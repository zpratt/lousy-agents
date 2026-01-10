import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import {
    analyzeCopilotWorkflowNeeds,
    type CopilotWorkflowAnalysis,
    determineMissingSetupSteps,
    generateCopilotWorkflowContent,
    type WorkflowSetupStep,
} from "../lib/copilot-workflow.js";
import { fileExists } from "../lib/filesystem-structure.js";

const copilotArgs = {
    dry: {
        type: "boolean" as const,
        description: "Preview changes without writing files",
        default: false,
    },
};

type CopilotArgs = typeof copilotArgs;

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
 * GitHub Actions expression for github.token
 */
const GITHUB_TOKEN_EXPR = "$" + "{{ github.token }}";

/**
 * Appends missing setup steps to an existing workflow file
 */
async function appendMissingSteps(
    workflowPath: string,
    missingSteps: WorkflowSetupStep[],
): Promise<string> {
    const content = await readFile(workflowPath, "utf-8");
    const lines = content.split("\n");

    // Find the verification step or the last step
    let insertIndex = lines.length - 1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Verify development environment")) {
            // Insert before the verification step
            insertIndex = i - 1;
            // Go back to find the start of the step
            while (
                insertIndex > 0 &&
                !lines[insertIndex].trim().startsWith("- name:")
            ) {
                insertIndex--;
            }
            break;
        }
    }

    // Generate step content for missing steps
    const newStepLines: string[] = [];
    for (const step of missingSteps) {
        newStepLines.push("");
        newStepLines.push(
            `      - name: Setup ${getActionDisplayName(step.action)}`,
        );
        newStepLines.push(
            `        uses: ${getPinnedActionForAppend(step.action)}`,
        );

        if (step.with && Object.keys(step.with).length > 0) {
            newStepLines.push("        with:");
            for (const [key, value] of Object.entries(step.with)) {
                newStepLines.push(
                    `          ${key}: ${formatYamlValue(value)}`,
                );
            }
        }

        // Add github_token for mise-action
        if (step.action === "jdx/mise-action") {
            if (!step.with) {
                newStepLines.push("        with:");
            }
            newStepLines.push(`          github_token: ${GITHUB_TOKEN_EXPR}`);
        }
    }

    // Insert the new steps
    lines.splice(insertIndex, 0, ...newStepLines);

    return lines.join("\n");
}

/**
 * Gets display name for an action
 */
function getActionDisplayName(action: string): string {
    const nameMap: Record<string, string> = {
        "actions/setup-node": "Node.js",
        "actions/setup-python": "Python",
        "actions/setup-java": "Java",
        "actions/setup-go": "Go",
        "ruby/setup-ruby": "Ruby",
        "jdx/mise-action": "mise",
    };
    return nameMap[action] || action;
}

/**
 * Pinned action versions (duplicated for append functionality)
 */
const PINNED_ACTIONS: Record<string, { sha: string; version: string }> = {
    "actions/checkout": {
        sha: "11bd71901bbe5b1630ceea73d27597364c9af683",
        version: "v4.2.2",
    },
    "actions/setup-node": {
        sha: "39370e3970a6d050c480ffad4ff0ed4d3fdee5af",
        version: "v4.1.0",
    },
    "actions/setup-python": {
        sha: "0b93645e9fea7318ecaed2b359559ac225c90a2b",
        version: "v5.3.0",
    },
    "actions/setup-java": {
        sha: "7a6d8a8234af8eb26422e24e3006232cccaa061b",
        version: "v4.6.0",
    },
    "actions/setup-go": {
        sha: "3041bf56c941b39c61721a86cd11f3bb1338122a",
        version: "v5.2.0",
    },
    "ruby/setup-ruby": {
        sha: "a4effe49ee8ee5b8224aba0bcf7754adb0aeb1e4",
        version: "v1.202.0",
    },
    "jdx/mise-action": {
        sha: "146a28175021df8ca24f8ee1828cc2a60f980bd5",
        version: "v3.5.1",
    },
};

function getPinnedActionForAppend(action: string): string {
    const pinned = PINNED_ACTIONS[action];
    if (pinned) {
        return `${action}@${pinned.sha}  # ${pinned.version}`;
    }
    return action;
}

function formatYamlValue(value: unknown): string {
    if (typeof value === "string") {
        if (value.includes(":") || value.includes("#") || value.includes("'")) {
            return `"${value}"`;
        }
        return `'${value}'`;
    }
    return String(value);
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
    run: async (context: CommandContext<CopilotArgs>) => {
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
            // Check for missing steps
            const missingSteps = determineMissingSetupSteps(analysis);

            if (missingSteps.length === 0) {
                consola.success("Copilot Setup Steps workflow is up to date!");
                return {
                    action: "unchanged",
                    path: analysis.existingCopilotWorkflowPath,
                    missingSteps: [],
                    analysis,
                } as CopilotScaffoldResult;
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
                    path: analysis.existingCopilotWorkflowPath,
                    missingSteps,
                    analysis,
                } as CopilotScaffoldResult;
            }

            // Append missing steps to existing workflow
            // Safe to access path since existingCopilotWorkflow is true
            const existingPath = analysis.existingCopilotWorkflowPath as string;
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
                path: analysis.existingCopilotWorkflowPath,
                missingSteps,
                analysis,
            } as CopilotScaffoldResult;
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
            } as CopilotScaffoldResult;
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
        } as CopilotScaffoldResult;
    },
});
