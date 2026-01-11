import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { detectEnvironment } from "../lib/environment-detector.js";
import {
    buildCandidatesFromEnvironment,
    COPILOT_SETUP_WORKFLOW_PATH,
    createOrUpdateWorkflow,
    mergeCandidates,
} from "../lib/workflow-generator.js";
import { parseWorkflowsFromRoot } from "../lib/workflow-parser.js";

/**
 * Dependencies that can be injected for testing
 */
interface CopilotSetupDependencies {
    targetDir?: string;
    detectEnvironmentFn?: typeof detectEnvironment;
    parseWorkflowsFn?: typeof parseWorkflowsFromRoot;
    createOrUpdateWorkflowFn?: typeof createOrUpdateWorkflow;
}

const copilotSetupArgs = {};

type CopilotSetupArgs = typeof copilotSetupArgs;

export const copilotSetupCommand = defineCommand({
    meta: {
        name: "copilot-setup",
        description:
            "Create or update the Copilot Setup Steps workflow for GitHub Copilot Coding Agent",
    },
    args: copilotSetupArgs,
    run: async (context: CommandContext<CopilotSetupArgs>) => {
        // Support dependency injection for testing via context.data
        const deps = (context.data || {}) as CopilotSetupDependencies;
        const targetDir = deps.targetDir || process.cwd();
        const detectEnvironmentFn =
            deps.detectEnvironmentFn || detectEnvironment;
        const parseWorkflowsFn =
            deps.parseWorkflowsFn || parseWorkflowsFromRoot;
        const createOrUpdateWorkflowFn =
            deps.createOrUpdateWorkflowFn || createOrUpdateWorkflow;

        consola.start("Detecting environment configuration...");

        // Step 1: Detect environment configuration files
        const environment = await detectEnvironmentFn(targetDir);

        if (environment.hasMise) {
            consola.info("Found mise.toml - will use jdx/mise-action");
        }

        if (environment.versionFiles.length > 0) {
            const fileNames = environment.versionFiles
                .map((f) => f.filename)
                .join(", ");
            consola.info(`Found version files: ${fileNames}`);
        }

        // Step 2: Parse existing workflows for setup actions
        consola.start("Scanning existing workflows...");
        const workflowCandidates = await parseWorkflowsFn(targetDir);

        if (workflowCandidates.length > 0) {
            const actionNames = workflowCandidates
                .map((c) => c.action)
                .join(", ");
            consola.info(`Found setup actions in workflows: ${actionNames}`);
        }

        // Step 3: Build and merge candidates
        const environmentCandidates =
            buildCandidatesFromEnvironment(environment);
        const allCandidates = mergeCandidates(
            environmentCandidates,
            workflowCandidates,
        );

        if (allCandidates.length === 0) {
            consola.warn(
                "No environment configuration or setup actions detected. Creating minimal workflow.",
            );
        }

        // Step 4: Ensure workflows directory exists
        const workflowsDir = join(targetDir, ".github", "workflows");
        await mkdir(workflowsDir, { recursive: true });

        // Step 5: Create or update the workflow
        const result = await createOrUpdateWorkflowFn(targetDir, allCandidates);

        // Step 6: Report results
        if (result.created) {
            consola.success(`Created ${COPILOT_SETUP_WORKFLOW_PATH}`);
            if (result.addedSteps.length > 0) {
                consola.info(
                    `Added setup steps: ${result.addedSteps.join(", ")}`,
                );
            } else {
                consola.info(
                    "Created minimal workflow with checkout step only",
                );
            }
        } else if (result.updated) {
            consola.success(`Updated ${COPILOT_SETUP_WORKFLOW_PATH}`);
            consola.info(`Added setup steps: ${result.addedSteps.join(", ")}`);
        } else {
            consola.info(
                `${COPILOT_SETUP_WORKFLOW_PATH} is already up to date - no changes needed`,
            );
        }
    },
});
