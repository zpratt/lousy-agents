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
    ResolvedVersion,
    SetupStepCandidate,
    VersionFile,
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
import {
    findResolvedVersion,
    VERSION_PLACEHOLDER,
} from "./action-resolution.js";

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
    return buildCandidatesFromVersionFiles(
        environment.versionFiles,
        versionTypeToAction,
        versionFileConfigKeys,
        versionGateway,
    );
}

/**
 * Builds setup step candidates from individual version files
 * @param versionFiles Array of version files to process
 * @param versionTypeToAction Map from version file type to action name
 * @param versionFileConfigKeys Map from version file type to config key
 * @param versionGateway Gateway for looking up action versions
 * @returns Array of setup step candidates
 */
async function buildCandidatesFromVersionFiles(
    versionFiles: VersionFile[],
    versionTypeToAction: Partial<Record<VersionFileType, string>>,
    versionFileConfigKeys: Partial<Record<VersionFileType, string>>,
    versionGateway: ActionVersionGateway,
): Promise<SetupStepCandidate[]> {
    const candidates: SetupStepCandidate[] = [];
    // Track which types we've already added to deduplicate (e.g., .nvmrc and .node-version)
    const addedTypes = new Set<VersionFileType>();

    for (const versionFile of versionFiles) {
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
 * Options for converting candidates to steps
 */
interface CandidateToStepOptions {
    /** Whether to use placeholder versions instead of actual versions */
    usePlaceholders?: boolean;
    /** Resolved versions to use for SHA-pinning */
    resolvedVersions?: ResolvedVersion[];
}

/**
 * Gets the version string for an action based on options.
 * Priority: resolved version > candidate version > placeholder
 */
function getVersionForAction(
    action: string,
    candidateVersion: string | undefined,
    options?: CandidateToStepOptions,
): string {
    // Check if we have a resolved version (SHA-pinned)
    if (options?.resolvedVersions) {
        const resolved = findResolvedVersion(action, options.resolvedVersions);
        if (resolved) {
            return `${resolved.sha}  # ${resolved.versionTag}`;
        }
    }

    // If using placeholders and no resolved version, return placeholder
    if (options?.usePlaceholders) {
        return VERSION_PLACEHOLDER;
    }

    // Fall back to candidate version or empty string
    return candidateVersion || "";
}

/**
 * Converts a SetupStepCandidate to a WorkflowStep
 * @param candidate The candidate to convert
 * @param options Optional conversion options for placeholders and resolved versions
 */
function candidateToStep(
    candidate: SetupStepCandidate,
    options?: CandidateToStepOptions,
): WorkflowStep {
    const version = getVersionForAction(
        candidate.action,
        candidate.version,
        options,
    );

    const uses = version ? `${candidate.action}@${version}` : candidate.action;

    const step: WorkflowStep = { uses };

    if (candidate.config && Object.keys(candidate.config).length > 0) {
        step.with = candidate.config;
    }

    return step;
}

/**
 * Converts an array of SetupStepCandidate to typed Step objects
 * @param candidates The setup step candidates to convert
 * @param options Optional conversion options for placeholders and resolved versions
 * @returns Array of typed Step objects
 */
function buildStepsFromCandidates(
    candidates: SetupStepCandidate[],
    options?: CandidateToStepOptions,
): Step[] {
    return candidates.map((candidate) => {
        const stepData = candidateToStep(candidate, options);
        return new Step({
            name: generateStepName(candidate.action),
            uses: stepData.uses,
            with: stepData.with as GeneratedWorkflowTypes.Env | undefined,
        });
    });
}

/**
 * Appends missing setup steps to an existing workflow's job steps array
 * @param steps The existing steps array to append to
 * @param missingCandidates The candidates to add as new steps
 * @param options Optional conversion options for placeholders and resolved versions
 */
function appendMissingStepsToJob(
    steps: unknown[],
    missingCandidates: SetupStepCandidate[],
    options?: CandidateToStepOptions,
): void {
    for (const candidate of missingCandidates) {
        const stepData = candidateToStep(candidate, options);
        const newStep = new Step({
            name: generateStepName(candidate.action),
            uses: stepData.uses,
            with: stepData.with as GeneratedWorkflowTypes.Env | undefined,
        });
        steps.push(newStep.step);
    }
}

/**
 * Options for workflow content generation
 */
export interface GenerateWorkflowOptions {
    /** Whether to use placeholder versions instead of gateway versions */
    usePlaceholders?: boolean;
    /** Resolved versions to use for SHA-pinning */
    resolvedVersions?: ResolvedVersion[];
}

/**
 * Generates the Copilot Setup Steps workflow content using typed workflow builder
 * @param candidates The setup step candidates to include
 * @param versionGateway Optional gateway for looking up action versions (defaults to local)
 * @param options Optional generation options for placeholders and resolved versions
 * @returns The workflow YAML content as a string
 */
export async function generateWorkflowContent(
    candidates: SetupStepCandidate[],
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
    options?: GenerateWorkflowOptions,
): Promise<string> {
    const stepOptions: CandidateToStepOptions = {
        usePlaceholders: options?.usePlaceholders,
        resolvedVersions: options?.resolvedVersions,
    };

    // Get checkout version: resolved > gateway > placeholder
    let checkoutVersion: string;
    if (options?.resolvedVersions) {
        const resolved = findResolvedVersion(
            "actions/checkout",
            options.resolvedVersions,
        );
        if (resolved) {
            checkoutVersion = `${resolved.sha}  # ${resolved.versionTag}`;
        } else if (options.usePlaceholders) {
            checkoutVersion = VERSION_PLACEHOLDER;
        } else {
            checkoutVersion =
                (await versionGateway.getVersion("actions/checkout")) || "v4";
        }
    } else if (options?.usePlaceholders) {
        checkoutVersion = VERSION_PLACEHOLDER;
    } else {
        checkoutVersion =
            (await versionGateway.getVersion("actions/checkout")) || "v4";
    }

    // Build steps: checkout first, then all setup step candidates
    const steps: Step[] = [
        new Step({
            name: "Checkout code",
            uses: `actions/checkout@${checkoutVersion}`,
        }),
        ...buildStepsFromCandidates(candidates, stepOptions),
    ];

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
 * @param options Optional generation options for placeholders and resolved versions
 * @returns The updated workflow YAML content
 */
export async function updateWorkflowWithMissingSteps(
    existingWorkflow: unknown,
    missingCandidates: SetupStepCandidate[],
    versionGateway: ActionVersionGateway = createActionVersionGateway(),
    options?: GenerateWorkflowOptions,
): Promise<string> {
    if (!existingWorkflow || typeof existingWorkflow !== "object") {
        // If we can't parse the existing workflow, generate a new one
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    // Deep clone the workflow
    const workflow = JSON.parse(JSON.stringify(existingWorkflow)) as Record<
        string,
        unknown
    >;

    const jobs = workflow.jobs as Record<string, unknown> | undefined;
    if (!jobs) {
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    // Find the main job (usually 'copilot-setup-steps' or similar)
    const jobNames = Object.keys(jobs);
    if (jobNames.length === 0) {
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    const mainJobName = jobNames[0];
    const mainJob = jobs[mainJobName] as Record<string, unknown>;

    if (!mainJob || !Array.isArray(mainJob.steps)) {
        return generateWorkflowContent(
            missingCandidates,
            versionGateway,
            options,
        );
    }

    // Append missing steps to the existing job
    const stepOptions: CandidateToStepOptions = {
        usePlaceholders: options?.usePlaceholders,
        resolvedVersions: options?.resolvedVersions,
    };
    appendMissingStepsToJob(
        mainJob.steps as unknown[],
        missingCandidates,
        stepOptions,
    );

    return `---\n${stringifyYaml(workflow, { lineWidth: 0 })}`;
}
