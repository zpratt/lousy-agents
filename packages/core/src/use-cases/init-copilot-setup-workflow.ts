/**
 * Use case for initializing a Copilot Setup Steps workflow in a new project.
 * Orchestrates environment detection, candidate building, and workflow generation.
 * Preserves any pre-existing workflow file.
 */

import type { ResolvedVersion } from "../entities/copilot-setup.js";
import type { CopilotSetupConfig } from "../entities/copilot-setup-config.js";
import { buildCandidatesFromEnvironment } from "./candidate-builder.js";
import { mergeCandidates } from "./setup-step-discovery.js";
import { generateWorkflowContent } from "./workflow-generator.js";

/**
 * Port for environment detection.
 */
export interface EnvironmentGateway {
    detectEnvironment(targetDir: string): Promise<import("../entities/copilot-setup.js").DetectedEnvironment>;
}

/**
 * Port for workflow file operations.
 */
export interface WorkflowGateway {
    parseWorkflowsForSetupActions(
        targetDir: string,
    ): Promise<import("../entities/copilot-setup.js").SetupStepCandidate[]>;
    copilotSetupWorkflowExists(targetDir: string): Promise<boolean>;
    getCopilotSetupWorkflowPath(targetDir: string): Promise<string>;
    readCopilotSetupWorkflow(targetDir: string): Promise<unknown | null>;
    writeCopilotSetupWorkflow(
        targetDir: string,
        content: string,
    ): Promise<void>;
}

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
