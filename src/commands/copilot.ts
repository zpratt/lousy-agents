import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { type Document, isMap, isSeq, parseDocument } from "yaml";
import {
    analyzeCopilotWorkflowNeeds,
    type CopilotWorkflowAnalysis,
    determineMissingSetupSteps,
    generateCopilotWorkflowContent,
    type WorkflowSetupStep,
} from "../lib/copilot-workflow.js";
import { fileExists } from "../lib/filesystem-structure.js";
import {
    GITHUB_TOKEN_EXPR,
    getActionDisplayName,
    getPinnedActionReference,
} from "../lib/pinned-actions.js";

const copilotArgs = {
    dry: {
        type: "boolean" as const,
        description: "Preview changes without writing files",
        default: false,
    },
};

type CopilotArgs = typeof copilotArgs;

/**
 * Represents a step object in a workflow YAML file
 */
interface WorkflowStepYaml {
    name?: string;
    uses?: string;
    with?: Record<string, unknown>;
    run?: string;
}

/**
 * Context data for dependency injection in tests
 */
export interface CopilotCommandData {
    targetDir?: string;
    prompt?: (message: string, options: { type: string }) => Promise<unknown>;
}

/**
 * Result of the copilot scaffold operation
 */
export interface CopilotScaffoldResult {
    action: "created" | "updated" | "unchanged";
    path: string;
    missingSteps: WorkflowSetupStep[];
    analysis: CopilotWorkflowAnalysis;
}

/**
 * Creates a step object for insertion into the workflow
 */
function createStepObject(step: WorkflowSetupStep): Record<string, unknown> {
    const stepObj: Record<string, unknown> = {
        name: `Setup ${getActionDisplayName(step.action)}`,
        uses: getPinnedActionReference(step.action),
    };

    // Build the 'with' object
    const withObj: Record<string, unknown> = {};

    if (step.with) {
        Object.assign(withObj, step.with);
    }

    // Add github_token for mise-action
    if (step.action === "jdx/mise-action") {
        withObj.github_token = GITHUB_TOKEN_EXPR;
    }

    if (Object.keys(withObj).length > 0) {
        stepObj.with = withObj;
    }

    return stepObj;
}

/**
 * Finds the index to insert new steps (before verification step or at end)
 */
function findInsertIndex(steps: WorkflowStepYaml[]): number {
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.name?.includes("Verify")) {
            return i;
        }
    }
    return steps.length;
}

/**
 * Appends missing setup steps to an existing workflow file using proper YAML parsing
 * Preserves the original formatting and indentation
 */
async function appendMissingSteps(
    workflowPath: string,
    missingSteps: WorkflowSetupStep[],
): Promise<string> {
    const content = await readFile(workflowPath, "utf-8");

    // Parse the document preserving comments and formatting
    const doc: Document = parseDocument(content);

    // Get the jobs section
    const root = doc.contents;
    if (!isMap(root)) {
        throw new Error("Invalid workflow: root is not a map");
    }

    const jobs = root.get("jobs");
    if (!isMap(jobs)) {
        throw new Error("Invalid workflow: jobs is not a map");
    }

    // Find the first job (typically 'copilot-setup-steps')
    const firstJobKey = jobs.items[0]?.key;
    if (!firstJobKey) {
        throw new Error("Invalid workflow: no jobs found");
    }

    const job = jobs.get(firstJobKey);
    if (!isMap(job)) {
        throw new Error("Invalid workflow: job is not a map");
    }

    const steps = job.get("steps");
    if (!isSeq(steps)) {
        throw new Error("Invalid workflow: steps is not a sequence");
    }

    // Convert steps to JS array to find insert position
    const stepsArray = steps.toJSON() as WorkflowStepYaml[];
    const insertIndex = findInsertIndex(stepsArray);

    // Insert new steps at the correct position
    for (let i = 0; i < missingSteps.length; i++) {
        const newStep = createStepObject(missingSteps[i]);
        steps.items.splice(insertIndex + i, 0, doc.createNode(newStep));
    }

    // Convert back to string, preserving formatting
    return doc.toString();
}

/**
 * Ensures the .github/workflows directory exists
 */
async function ensureWorkflowsDirectory(targetDir: string): Promise<void> {
    const workflowsDir = join(targetDir, ".github", "workflows");
    if (!(await fileExists(workflowsDir))) {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(workflowsDir, { recursive: true });
    }
}

export const copilotCommand = defineCommand({
    meta: {
        name: "copilot",
        description:
            "Scaffold or update the Copilot Setup Steps workflow for GitHub Copilot Coding Agent",
    },
    args: copilotArgs,
    run: async (
        context: CommandContext<CopilotArgs>,
    ): Promise<CopilotScaffoldResult> => {
        // Support dependency injection for testing via context.data
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const dryRun = context.args.dry ?? false;

        consola.info(
            "Analyzing repository for Copilot Setup Steps configuration...",
        );

        // Analyze the repository
        const analysis = await analyzeCopilotWorkflowNeeds(targetDir);

        // Report findings
        if (analysis.versionFileCandidates.length > 0) {
            consola.info("Detected version files:");
            for (const candidate of analysis.versionFileCandidates) {
                const versionInfo = candidate.version
                    ? ` (${candidate.version})`
                    : "";
                consola.info(
                    `  - ${candidate.file}${versionInfo} → ${candidate.setupAction}`,
                );
            }
        }

        if (analysis.workflowSetupSteps.length > 0) {
            consola.info("Detected setup actions in existing workflows:");
            for (const step of analysis.workflowSetupSteps) {
                consola.info(`  - ${step.action}`);
            }
        }

        const workflowPath = join(
            targetDir,
            ".github",
            "workflows",
            "copilot-setup-steps.yml",
        );

        if (analysis.existingCopilotWorkflow) {
            // Type narrowing: when existingCopilotWorkflow is true, path is always defined
            const existingPath = analysis.existingCopilotWorkflowPath;
            if (!existingPath) {
                throw new Error(
                    "Internal error: existingCopilotWorkflow is true but path is undefined",
                );
            }

            // Check for missing steps
            const missingSteps = determineMissingSetupSteps(analysis);

            if (missingSteps.length === 0) {
                consola.success("Copilot Setup Steps workflow is up to date!");
                return {
                    action: "unchanged",
                    path: existingPath,
                    missingSteps: [],
                    analysis,
                };
            }

            consola.info("Missing setup steps in existing workflow:");
            for (const step of missingSteps) {
                consola.info(`  - ${step.action}`);
            }

            if (dryRun) {
                consola.info(
                    "[Dry run] Would update existing workflow with missing steps",
                );
                return {
                    action: "updated",
                    path: existingPath,
                    missingSteps,
                    analysis,
                };
            }

            // Append missing steps to existing workflow
            const updatedContent = await appendMissingSteps(
                existingPath,
                missingSteps,
            );
            await writeFile(existingPath, updatedContent);

            consola.success(
                "Updated Copilot Setup Steps workflow with missing steps!",
            );
            return {
                action: "updated",
                path: existingPath,
                missingSteps,
                analysis,
            };
        }

        // Generate new workflow
        const workflowContent = generateCopilotWorkflowContent(analysis);

        if (dryRun) {
            consola.info("[Dry run] Would create new workflow at:");
            consola.info(`  ${workflowPath}`);
            consola.info("\nGenerated content:");
            console.log(workflowContent);
            return {
                action: "created",
                path: workflowPath,
                missingSteps: determineMissingSetupSteps({
                    ...analysis,
                    existingCopilotWorkflowSteps: [],
                }),
                analysis,
            };
        }

        // Ensure workflows directory exists
        await ensureWorkflowsDirectory(targetDir);

        // Write the workflow file
        await writeFile(workflowPath, workflowContent);

        consola.success(
            `Created Copilot Setup Steps workflow at ${workflowPath}`,
        );

        if (
            analysis.versionFileCandidates.length === 0 &&
            analysis.workflowSetupSteps.length === 0
        ) {
            consola.info(
                "\nNo version files or setup actions detected. " +
                    "Consider adding version files (.nvmrc, .python-version, mise.toml, etc.) " +
                    "to configure the development environment.",
            );
        }

        return {
            action: "created",
            path: workflowPath,
            missingSteps: determineMissingSetupSteps({
                ...analysis,
                existingCopilotWorkflowSteps: [],
            }),
            analysis,
        };
    },
});
