import { mkdir } from "node:fs/promises";
import type { DetectedEnvironment } from "@lousy-agents/core/entities/copilot-setup.js";
import {
    createEnvironmentGateway,
    createGitHubRulesetGateway,
    createNpmrcGateway,
    createWorkflowGateway,
    fileExists,
    resolveSafePath,
} from "@lousy-agents/core/gateways/index.js";
import type { NpmrcGateway } from "@lousy-agents/core/gateways/npmrc-gateway.js";
import { loadCopilotSetupConfig } from "@lousy-agents/core/lib/copilot-setup-config.js";
import { addAgentShell } from "@lousy-agents/core/use-cases/add-agent-shell.js";
import {
    buildCopilotReviewRulesetPayload,
    checkCopilotReviewRuleset,
    type RulesetGateway,
} from "@lousy-agents/core/use-cases/check-copilot-review-ruleset.js";
import {
    buildCandidatesFromEnvironment,
    generateWorkflowContent,
    updateWorkflowWithMissingSteps,
} from "@lousy-agents/core/use-cases/copilot-setup.js";
import {
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    mergeCandidates,
} from "@lousy-agents/core/use-cases/setup-step-discovery.js";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";

interface CopilotSetupRulesetGateway extends RulesetGateway {
    isAuthenticated(): Promise<boolean>;
    getRepoInfo(
        targetDir: string,
    ): Promise<{ owner: string; repo: string } | null>;
    hasAdvancedSecurity(owner: string, repo: string): Promise<boolean>;
}

type PromptFunction = (
    message: string,
    options: { type: string; default?: boolean },
) => Promise<boolean>;

const copilotSetupArgs = {
    "dry-run": {
        type: "boolean" as const,
        description:
            "Preview changes without modifying any files (no writes performed)",
        default: false,
    },
};

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

        const dryRun = context.args["dry-run"] ?? false;

        if (dryRun) {
            consola.info("[DRY-RUN MODE] No files will be modified");
        }

        const environmentGateway = createEnvironmentGateway(targetDir);
        const workflowGateway = createWorkflowGateway(targetDir);
        const copilotSetupConfig = await loadCopilotSetupConfig(targetDir);
        const rulesetGateway: CopilotSetupRulesetGateway =
            (context.data
                ?.rulesetGateway as CopilotSetupRulesetGateway | null) ??
            (await createGitHubRulesetGateway());
        const npmrcGateway: NpmrcGateway =
            (context.data?.npmrcGateway as NpmrcGateway | null) ??
            createNpmrcGateway(consola, dryRun);
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
        const workflowsDir = await resolveSafePath(
            targetDir,
            ".github/workflows",
        );
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
        const envCandidates = await buildCandidatesFromEnvironment(
            environment,
            undefined,
            copilotSetupConfig,
        );

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
            if (dryRun) {
                consola.info(
                    `[DRY-RUN] Would create directory: ${workflowsDir}`,
                );
            } else {
                await mkdir(workflowsDir, { recursive: true });
            }
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

                await runPostWorkflowSteps(
                    rulesetGateway,
                    npmrcGateway,
                    targetDir,
                    prompt,
                    environment,
                    dryRun,
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

            if (dryRun) {
                consola.info(
                    `[DRY-RUN] Would update copilot-setup-steps.yml with ${missingCandidates.length} new step(s)`,
                );
            } else {
                await workflowGateway.writeCopilotSetupWorkflow(
                    targetDir,
                    updatedContent,
                );
                consola.success(
                    `Updated copilot-setup-steps.yml with ${missingCandidates.length} new step(s)`,
                );
            }
        } else {
            // Create new workflow
            const content = await generateWorkflowContent(allCandidates);
            const stepCount = allCandidates.length + 1; // +1 for checkout

            if (dryRun) {
                consola.info(
                    `[DRY-RUN] Would create copilot-setup-steps.yml with ${stepCount} step(s)`,
                );
            } else {
                consola.info(
                    "Creating new copilot-setup-steps.yml workflow...",
                );
                await workflowGateway.writeCopilotSetupWorkflow(
                    targetDir,
                    content,
                );
                consola.success(
                    `Created copilot-setup-steps.yml with ${stepCount} step(s)`,
                );
            }

            if (allCandidates.length > 0) {
                const actionNames = allCandidates
                    .map((c) => c.action)
                    .join(", ");
                consola.info(`Included setup steps: ${actionNames}`);
            }
        }

        // Step 6: Run post-workflow steps (ruleset + agent-shell)
        await runPostWorkflowSteps(
            rulesetGateway,
            npmrcGateway,
            targetDir,
            prompt,
            environment,
            dryRun,
        );
    },
});

async function checkAndPromptRuleset(
    rulesetGateway: CopilotSetupRulesetGateway,
    targetDir: string,
    prompt: PromptFunction,
    dryRun: boolean,
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

        if (dryRun) {
            consola.info(
                `[DRY-RUN] Would create Copilot PR review ruleset: "${payload.name}"`,
            );
            return;
        }

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

async function runPostWorkflowSteps(
    rulesetGateway: CopilotSetupRulesetGateway,
    npmrcGateway: NpmrcGateway,
    targetDir: string,
    prompt: PromptFunction,
    environment: DetectedEnvironment,
    dryRun: boolean,
): Promise<void> {
    await checkAndPromptRuleset(rulesetGateway, targetDir, prompt, dryRun);
    await checkAndPromptAgentShell(
        npmrcGateway,
        targetDir,
        prompt,
        environment,
        dryRun,
    );
}

async function checkAndPromptAgentShell(
    npmrcGateway: NpmrcGateway,
    targetDir: string,
    prompt: PromptFunction,
    environment: DetectedEnvironment,
    dryRun: boolean,
): Promise<void> {
    const npmPackageManager = environment.packageManagers.find(
        (pm) => pm.type === "npm",
    );

    if (!npmPackageManager) {
        return;
    }

    // Check if already configured before prompting
    const existingContent = await npmrcGateway.readNpmrc(targetDir);
    if (
        existingContent !== null &&
        /^\s*script-shell\s*=/m.test(existingContent)
    ) {
        consola.success("agent-shell is already configured in .npmrc.");
        return;
    }

    const shouldAdd = await prompt(
        "Would you like to add agent-shell to observe npm script execution?",
        { type: "confirm", default: true },
    );

    if (!shouldAdd) {
        consola.info("Skipping agent-shell setup.");
        return;
    }

    if (dryRun) {
        consola.info(
            "[DRY-RUN] Would add agent-shell to .npmrc. Run `npm install -g @lousy-agents/agent-shell` to complete setup.",
        );
        return;
    }

    const result = await addAgentShell(
        { targetDir, packageManager: npmPackageManager },
        npmrcGateway,
    );

    if (result.wasAdded) {
        consola.success(
            "Added agent-shell to .npmrc. Run `npm install -g @lousy-agents/agent-shell` to complete setup.",
        );
    }
}
