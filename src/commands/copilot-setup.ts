import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import {
    createEnvironmentGateway,
    createGitHubRulesetGateway,
    createWorkflowGateway,
    fileExists,
} from "../gateways/index.js";
import {
    buildCopilotReviewRulesetPayload,
    checkCopilotReviewRuleset,
    type RulesetGateway,
} from "../use-cases/check-copilot-review-ruleset.js";
import {
    buildCandidatesFromEnvironment,
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "../use-cases/copilot-setup.js";
import {
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    mergeCandidates,
} from "../use-cases/setup-step-discovery.js";

interface CopilotSetupRulesetGateway extends RulesetGateway {
    isAuthenticated(): Promise<boolean>;
    getRepoInfo(
        targetDir: string,
    ): Promise<{ owner: string; repo: string } | null>;
    hasAdvancedSecurity(owner: string, repo: string): Promise<boolean>;
}

type PromptFunction = (
    message: string,
    options: { type: string },
) => Promise<boolean>;

const copilotSetupArgs = {};

type CopilotSetupArgs = typeof copilotSetupArgs;

export const copilotSetupCommand = defineCommand({
    meta: {
        name: "copilot-setup",
        description:
            "Generate or update the Copilot Setup Steps workflow based on detected environment configuration",
    },
    args: copilotSetupArgs,
    run: async (context: CommandContext<CopilotSetupArgs>) => {
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const environmentGateway = createEnvironmentGateway();
        const workflowGateway = createWorkflowGateway();
        const rulesetGateway: CopilotSetupRulesetGateway =
            (context.data
                ?.rulesetGateway as CopilotSetupRulesetGateway | null) ??
            (await createGitHubRulesetGateway());
        const prompt =
            (context.data?.prompt as PromptFunction | null) ??
            ((message, options) =>
                consola.prompt(message, options) as Promise<boolean>);

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
            workflowCandidates,
            envCandidates,
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

                await checkAndPromptRuleset(rulesetGateway, targetDir, prompt);
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

        // Step 6: Check for Copilot PR review rulesets
        await checkAndPromptRuleset(rulesetGateway, targetDir, prompt);
    },
});

async function checkAndPromptRuleset(
    rulesetGateway: CopilotSetupRulesetGateway,
    targetDir: string,
    prompt: PromptFunction,
): Promise<void> {
    consola.info("Checking Copilot PR review ruleset...");

    const isAuthenticated = await rulesetGateway.isAuthenticated();
    if (!isAuthenticated) {
        consola.warn(
            "No valid GitHub token available. Set GH_TOKEN/GITHUB_TOKEN or run `gh auth login` to enable Copilot PR review ruleset management.",
        );
        return;
    }

    const repoInfo = await rulesetGateway.getRepoInfo(targetDir);
    if (!repoInfo) {
        consola.warn(
            "Could not determine repository owner and name from git remote. Skipping ruleset check.",
        );
        return;
    }

    const status = await checkCopilotReviewRuleset(
        rulesetGateway,
        repoInfo.owner,
        repoInfo.repo,
    );

    if (status.error) {
        consola.warn(
            `Could not check rulesets: ${status.error}. You may need admin access to manage rulesets.`,
        );
        return;
    }

    if (status.hasRuleset) {
        consola.success(
            `Copilot PR review ruleset is already configured: "${status.rulesetName}"`,
        );
        return;
    }

    const shouldCreate = await prompt(
        "No Copilot PR review ruleset found. Would you like to create one?",
        { type: "confirm" },
    );

    if (!shouldCreate) {
        consola.info("Skipping Copilot PR review ruleset creation.");
        return;
    }

    try {
        const advancedSecurityEnabled =
            await rulesetGateway.hasAdvancedSecurity(
                repoInfo.owner,
                repoInfo.repo,
            );
        const payload = buildCopilotReviewRulesetPayload({
            advancedSecurityEnabled,
        });
        await rulesetGateway.createRuleset(
            repoInfo.owner,
            repoInfo.repo,
            payload,
        );
        consola.success(`Created Copilot PR review ruleset: "${payload.name}"`);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error";
        consola.error(
            `Failed to create ruleset: ${message}. You may need admin access to the repository.`,
        );
    }
}
