/**
 * Use cases for the Copilot Setup Steps feature.
 * These contain the application-specific business rules.
 */

import {
    type GeneratedWorkflowTypes,
    NormalJob,
    Step,
    Workflow,
} from "@github-actions-workflow-ts/lib";
import { stringify as stringifyYaml } from "yaml";
import type {
    DetectedEnvironment,
    SetupStepCandidate,
    VersionFileType,
    WorkflowStep,
} from "../entities/copilot-setup.js";
import type { ActionVersionGateway } from "../gateways/action-version-gateway.js";
import { createActionVersionGateway } from "../gateways/action-version-gateway.js";
import {
    type CopilotSetupConfig,
    getVersionFileConfigKeyMap,
    getVersionTypeToActionMap,
    loadCopilotSetupConfig,
} from "../lib/copilot-setup-config.js";

// Re-export from setup-step-discovery for backward compatibility
export {
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    mergeCandidates,
} from "./setup-step-discovery.js";

/**
 * Builds setup step candidates from detected environment
 * @param environment The detected environment configuration
 * @param versionGateway Optional gateway for looking up action versions (defaults to local)
 * @param config Optional copilot-setup configuration
 * @returns Array of setup step candidates
 */
export async function buildCandidatesFromEnvironment(
    environment: DetectedEnvironment,
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
    config?: CopilotSetupConfig,
): Promise<SetupStepCandidate[]> {
    const loadedConfig = config || (await loadCopilotSetupConfig());
    const versionTypeToAction = getVersionTypeToActionMap(loadedConfig);
    const versionFileConfigKeys = getVersionFileConfigKeyMap(loadedConfig);

    const candidates: SetupStepCandidate[] = [];

    // If mise.toml is present, add mise-action only
    if (environment.hasMise) {
        const miseVersion = await versionGateway.getVersion("jdx/mise-action");
        candidates.push({
            action: "jdx/mise-action",
            version: miseVersion,
            source: "version-file",
        });
        return candidates;
    }

    // Otherwise, add individual setup actions for each version file
    // Track which types we've already added to deduplicate (e.g., .nvmrc and .node-version)
    const addedTypes = new Set<VersionFileType>();

    for (const versionFile of environment.versionFiles) {
        if (addedTypes.has(versionFile.type)) {
            continue;
        }
        addedTypes.add(versionFile.type);

        const action = versionTypeToAction[versionFile.type];
        const configKey = versionFileConfigKeys[versionFile.type];

        if (!action || !configKey) {
            continue;
        }

        const version = await versionGateway.getVersion(action);

        candidates.push({
            action,
            version,
            config: {
                [configKey]: versionFile.filename,
            },
            source: "version-file",
        });
    }

    return candidates;
}

/**
 * Generates a human-readable step name from an action name
 * @example "actions/setup-node" -> "Setup node"
 * @example "jdx/mise-action" -> "Setup mise"
 */
function generateStepName(actionName: string): string {
    const name = actionName.split("/").pop() || actionName;
    return `Setup ${name.replace("setup-", "").replace("-action", "")}`;
}

/**
 * Converts a SetupStepCandidate to a WorkflowStep
 */
function candidateToStep(candidate: SetupStepCandidate): WorkflowStep {
    const uses = candidate.version
        ? `${candidate.action}@${candidate.version}`
        : candidate.action;

    const step: WorkflowStep = { uses };

    if (candidate.config && Object.keys(candidate.config).length > 0) {
        step.with = candidate.config;
    }

    return step;
}

/**
 * Generates the Copilot Setup Steps workflow content using typed workflow builder
 * @param candidates The setup step candidates to include
 * @param versionGateway Optional gateway for looking up action versions (defaults to local)
 * @returns The workflow YAML content as a string
 */
export async function generateWorkflowContent(
    candidates: SetupStepCandidate[],
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
): Promise<string> {
    const checkoutVersion = await versionGateway.getVersion("actions/checkout");
    if (!checkoutVersion) {
        throw new Error(
            "Failed to get version for actions/checkout from version gateway. Ensure the action is available in the version mapping.",
        );
    }

    // Build steps using the typed Step class
    const steps: Step[] = [];

    // Always start with checkout
    steps.push(
        new Step({
            name: "Checkout code",
            uses: `actions/checkout@${checkoutVersion}`,
        }),
    );

    // Add all setup step candidates
    for (const candidate of candidates) {
        const stepData = candidateToStep(candidate);
        steps.push(
            new Step({
                name: generateStepName(candidate.action),
                uses: stepData.uses,
                with: stepData.with as GeneratedWorkflowTypes.Env | undefined,
            }),
        );
    }

    // Build job using typed NormalJob class
    const job = new NormalJob("copilot-setup-steps", {
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 30,
        permissions: {
            "id-token": "write",
            contents: "read",
        },
    }).addSteps(steps);

    // Build workflow using typed Workflow class
    const workflow = new Workflow("copilot-setup-steps.yml", {
        name: "Copilot Setup Steps",
        on: {
            workflow_dispatch: {},
            push: {
                branches: ["main"],
                paths: [".github/workflows/copilot-setup-steps.yml"],
            },
            pull_request: {
                branches: ["main"],
                paths: [".github/workflows/copilot-setup-steps.yml"],
            },
        },
    }).addJob(job);

    // Add YAML frontmatter and stringify
    return `---\n${stringifyYaml(workflow.workflow, { lineWidth: 0 })}`;
}

/**
 * Updates an existing workflow by appending missing setup steps
 * @param existingWorkflow The parsed existing workflow
 * @param missingCandidates Candidates to add to the workflow
 * @param versionGateway Optional gateway for looking up action versions (defaults to local)
 * @returns The updated workflow YAML content
 */
export async function updateWorkflowWithMissingSteps(
    existingWorkflow: unknown,
    missingCandidates: SetupStepCandidate[],
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
): Promise<string> {
    if (!existingWorkflow || typeof existingWorkflow !== "object") {
        // If we can't parse the existing workflow, generate a new one
        return generateWorkflowContent(missingCandidates, versionGateway);
    }

    // Deep clone the workflow
    const workflow = JSON.parse(JSON.stringify(existingWorkflow)) as Record<
        string,
        unknown
    >;

    const jobs = workflow.jobs as Record<string, unknown> | undefined;
    if (!jobs) {
        return generateWorkflowContent(missingCandidates, versionGateway);
    }

    // Find the main job (usually 'copilot-setup-steps' or similar)
    const jobNames = Object.keys(jobs);
    if (jobNames.length === 0) {
        return generateWorkflowContent(missingCandidates, versionGateway);
    }

    const mainJobName = jobNames[0];
    const mainJob = jobs[mainJobName] as Record<string, unknown>;

    if (!mainJob || !Array.isArray(mainJob.steps)) {
        return generateWorkflowContent(missingCandidates, versionGateway);
    }

    // Append missing steps using the typed Step class to ensure proper format
    const steps = mainJob.steps as unknown[];
    for (const candidate of missingCandidates) {
        const stepData = candidateToStep(candidate);
        const newStep = new Step({
            name: generateStepName(candidate.action),
            uses: stepData.uses,
            with: stepData.with as GeneratedWorkflowTypes.Env | undefined,
        });
        steps.push(newStep.step);
    }

    return `---\n${stringifyYaml(workflow, { lineWidth: 0 })}`;
}
