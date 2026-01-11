import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import {
    createEnvironmentGateway,
    createWorkflowGateway,
    fileExists,
} from "../gateways/index.js";
import {
    buildCandidatesFromEnvironment,
    findMissingCandidates,
    generateWorkflowContent,
    getExistingActionsFromWorkflow,
    mergeCandidates,
    updateWorkflowWithMissingSteps,
} from "../use-cases/copilot-setup.js";

const copilotSetupArgs = {};

type CopilotSetupArgs = typeof copilotSetupArgs;

/**
 * Main command implementation for copilot-setup
 */
export const copilotSetupCommand = defineCommand({
    meta: {
        name: "copilot-setup",
        description:
            "Generate or update the Copilot Setup Steps workflow based on detected environment configuration",
    },
    args: copilotSetupArgs,
    run: async (context: CommandContext<CopilotSetupArgs>) => {
        // Support dependency injection for testing via context.data
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        // Create gateways
        const environmentGateway = createEnvironmentGateway();
        const workflowGateway = createWorkflowGateway();

        consola.info("Detecting environment configuration...");

        // Step 1: Detect environment configuration files
        const environment =
            await environmentGateway.detectEnvironment(targetDir);

        if (environment.hasMise) {
            consola.success("Found mise.toml - will use mise-action");
        }

        if (environment.versionFiles.length > 0) {
            const fileNames = environment.versionFiles
                .map((f) => f.filename)
                .join(", ");
            consola.success(`Found version files: ${fileNames}`);
        }

        // Step 2: Parse existing workflows for setup actions
        const workflowsDir = join(targetDir, ".github", "workflows");
        const workflowsDirExists = await fileExists(workflowsDir);

        const workflowCandidates = workflowsDirExists
            ? await workflowGateway.parseWorkflowsForSetupActions(targetDir)
            : [];

        if (workflowCandidates.length > 0) {
            const actionNames = workflowCandidates
                .map((c) => c.action)
                .join(", ");
            consola.success(
                `Found setup actions in existing workflows: ${actionNames}`,
            );
        }

        // Step 3: Build candidates from environment
        const envCandidates = await buildCandidatesFromEnvironment(environment);

        // Step 4: Merge candidates (workflow takes precedence)
        const allCandidates = mergeCandidates(
            envCandidates,
            workflowCandidates,
        );

        if (allCandidates.length === 0) {
            consola.warn(
                "No environment configuration or setup actions detected. Creating minimal workflow with checkout only.",
            );
        }

        // Step 5: Check if copilot-setup-steps.yml already exists
        const workflowExists =
            await workflowGateway.copilotSetupWorkflowExists(targetDir);

        // Ensure workflows directory exists
        if (!workflowsDirExists) {
            await mkdir(workflowsDir, { recursive: true });
        }

        if (workflowExists) {
            // Update existing workflow
            consola.info(
                "Found existing copilot-setup-steps.yml - checking for missing steps...",
            );

            const existingWorkflow =
                await workflowGateway.readCopilotSetupWorkflow(targetDir);
            const existingActions =
                getExistingActionsFromWorkflow(existingWorkflow);

            const missingCandidates = findMissingCandidates(
                allCandidates,
                existingActions,
            );

            if (missingCandidates.length === 0) {
                consola.success(
                    "Copilot Setup Steps workflow already contains all detected setup steps. No changes needed.",
                );
                return;
            }

            const missingNames = missingCandidates
                .map((c) => c.action)
                .join(", ");
            consola.info(`Adding missing setup steps: ${missingNames}`);

            const updatedContent = await updateWorkflowWithMissingSteps(
                existingWorkflow,
                missingCandidates,
            );

            await workflowGateway.writeCopilotSetupWorkflow(
                targetDir,
                updatedContent,
            );

            consola.success(
                `Updated copilot-setup-steps.yml with ${missingCandidates.length} new step(s)`,
            );
        } else {
            // Create new workflow
            consola.info("Creating new copilot-setup-steps.yml workflow...");

            const content = await generateWorkflowContent(allCandidates);
            await workflowGateway.writeCopilotSetupWorkflow(targetDir, content);

            const stepCount = allCandidates.length + 1; // +1 for checkout
            consola.success(
                `Created copilot-setup-steps.yml with ${stepCount} step(s)`,
            );

            if (allCandidates.length > 0) {
                const actionNames = allCandidates
                    .map((c) => c.action)
                    .join(", ");
                consola.info(`Included setup steps: ${actionNames}`);
            }
        }
    },
});
