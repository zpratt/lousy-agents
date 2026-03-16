/**
 * Use case for initializing a Copilot Setup Steps workflow in a new project.
 * Orchestrates environment detection, candidate building, and workflow generation.
 * Preserves any pre-existing workflow file.
 */

import type { ResolvedVersion } from "../entities/copilot-setup.js";
import type { EnvironmentGateway } from "../gateways/environment-gateway.js";
import type { WorkflowGateway } from "../gateways/workflow-gateway.js";
import type { CopilotSetupConfig } from "../lib/copilot-setup-config.js";
import { buildCandidatesFromEnvironment } from "./candidate-builder.js";
import { mergeCandidates } from "./setup-step-discovery.js";
import { generateWorkflowContent } from "./workflow-generator.js";

export interface InitCopilotSetupWorkflowInput {
    targetDir: string;
    resolvedVersions: ResolvedVersion[];
}

export interface InitCopilotSetupWorkflowOutput {
    created: boolean;
    stepCount: number;
}

/**
 * Generates a Copilot Setup Steps workflow in the target directory if one does not
 * already exist. Uses detected environment (version files, package managers) to build
 * environment-aware setup candidates and writes a SHA-pinned workflow.
 *
 * @returns `{ created: false }` when the workflow already exists (preserving it),
 *          `{ created: true, stepCount }` after writing the generated workflow.
 */
export async function initCopilotSetupWorkflow(
    input: InitCopilotSetupWorkflowInput,
    workflowGateway: WorkflowGateway,
    environmentGateway: EnvironmentGateway,
    copilotSetupConfig: CopilotSetupConfig,
): Promise<InitCopilotSetupWorkflowOutput> {
    const workflowExists = await workflowGateway.copilotSetupWorkflowExists(
        input.targetDir,
    );
    if (workflowExists) {
        return { created: false, stepCount: 0 };
    }

    const environment = await environmentGateway.detectEnvironment(
        input.targetDir,
    );
    const workflowCandidates =
        await workflowGateway.parseWorkflowsForSetupActions(input.targetDir);
    const envCandidates = await buildCandidatesFromEnvironment(
        environment,
        undefined,
        copilotSetupConfig,
    );
    const allCandidates = mergeCandidates(workflowCandidates, envCandidates);

    const content = await generateWorkflowContent(allCandidates, undefined, {
        resolvedVersions: input.resolvedVersions,
    });

    await workflowGateway.writeCopilotSetupWorkflow(input.targetDir, content);

    return { created: true, stepCount: allCandidates.length + 1 }; // +1 for checkout
}
