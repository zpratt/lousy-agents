import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type {
    DetectedEnvironment,
    VersionFileType,
} from "./environment-detector.js";
import type { SetupStepCandidate } from "./workflow-parser.js";

/**
 * Mapping of version file types to their corresponding setup actions
 */
const VERSION_TYPE_TO_ACTION: Record<VersionFileType, string> = {
    node: "actions/setup-node",
    python: "actions/setup-python",
    java: "actions/setup-java",
    ruby: "actions/setup-ruby",
    go: "actions/setup-go",
};

/**
 * Default versions for setup actions
 */
const DEFAULT_ACTION_VERSIONS: Record<string, string> = {
    "actions/checkout": "v4",
    "actions/setup-node": "v4",
    "actions/setup-python": "v5",
    "actions/setup-java": "v4",
    "actions/setup-ruby": "v1",
    "actions/setup-go": "v5",
    "jdx/mise-action": "v2",
};

/**
 * Mapping of version file types to their version-file config keys
 */
const VERSION_FILE_CONFIG_KEYS: Record<VersionFileType, string> = {
    node: "node-version-file",
    python: "python-version-file",
    java: "java-version-file",
    ruby: "ruby-version-file",
    go: "go-version-file",
};

/**
 * Represents a step in a GitHub Actions workflow
 */
export interface WorkflowStep {
    name?: string;
    uses: string;
    with?: Record<string, unknown>;
}

/**
 * Builds setup step candidates from detected environment
 * @param environment The detected environment configuration
 * @returns Array of setup step candidates
 */
export function buildCandidatesFromEnvironment(
    environment: DetectedEnvironment,
): SetupStepCandidate[] {
    const candidates: SetupStepCandidate[] = [];

    // If mise.toml is present, add mise-action only
    if (environment.hasMise) {
        candidates.push({
            action: "jdx/mise-action",
            version: DEFAULT_ACTION_VERSIONS["jdx/mise-action"],
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

        const action = VERSION_TYPE_TO_ACTION[versionFile.type];
        const configKey = VERSION_FILE_CONFIG_KEYS[versionFile.type];

        candidates.push({
            action,
            version: DEFAULT_ACTION_VERSIONS[action],
            config: {
                [configKey]: versionFile.filename,
            },
            source: "version-file",
        });
    }

    return candidates;
}

/**
 * Merges candidates from environment detection and workflow parsing
 * Workflow-sourced candidates take precedence over version-file candidates
 * @param envCandidates Candidates from environment detection
 * @param workflowCandidates Candidates from workflow parsing
 * @returns Merged and deduplicated candidates
 */
export function mergeCandidates(
    envCandidates: SetupStepCandidate[],
    workflowCandidates: SetupStepCandidate[],
): SetupStepCandidate[] {
    const result: SetupStepCandidate[] = [];
    const seen = new Set<string>();

    // First add workflow candidates (they take precedence)
    for (const candidate of workflowCandidates) {
        if (!seen.has(candidate.action)) {
            seen.add(candidate.action);
            result.push(candidate);
        }
    }

    // Then add environment candidates that haven't been seen
    for (const candidate of envCandidates) {
        if (!seen.has(candidate.action)) {
            seen.add(candidate.action);
            result.push(candidate);
        }
    }

    return result;
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
 * Generates the Copilot Setup Steps workflow content
 * @param candidates The setup step candidates to include
 * @returns The workflow YAML content as a string
 */
export function generateWorkflowContent(
    candidates: SetupStepCandidate[],
): string {
    const steps: WorkflowStep[] = [];

    // Always start with checkout
    steps.push({
        name: "Checkout code",
        uses: `actions/checkout@${DEFAULT_ACTION_VERSIONS["actions/checkout"]}`,
    });

    // Add all setup step candidates
    for (const candidate of candidates) {
        const step = candidateToStep(candidate);
        step.name = generateStepName(candidate.action);
        steps.push(step);
    }

    const workflow = {
        name: "Copilot Setup Steps",
        on: {
            workflow_dispatch: null,
            push: {
                branches: ["main"],
                paths: [".github/workflows/copilot-setup-steps.yml"],
            },
            pull_request: {
                branches: ["main"],
                paths: [".github/workflows/copilot-setup-steps.yml"],
            },
        },
        jobs: {
            "copilot-setup-steps": {
                "runs-on": "ubuntu-latest",
                "timeout-minutes": 30,
                permissions: {
                    "id-token": "write",
                    contents: "read",
                },
                steps,
            },
        },
    };

    // Add YAML frontmatter and stringify
    return `---\n${stringifyYaml(workflow, { lineWidth: 0 })}`;
}

/**
 * Extracts existing setup actions from a parsed workflow
 * @param workflow The parsed workflow object
 * @returns Set of action names already present
 */
export function getExistingActionsFromWorkflow(workflow: unknown): Set<string> {
    const actions = new Set<string>();

    if (!workflow || typeof workflow !== "object") {
        return actions;
    }

    const workflowObj = workflow as Record<string, unknown>;
    const jobs = workflowObj.jobs;

    if (!jobs || typeof jobs !== "object") {
        return actions;
    }

    for (const job of Object.values(jobs as Record<string, unknown>)) {
        if (!job || typeof job !== "object") {
            continue;
        }

        const jobObj = job as Record<string, unknown>;
        const steps = jobObj.steps;

        if (!Array.isArray(steps)) {
            continue;
        }

        for (const step of steps) {
            if (!step || typeof step !== "object") {
                continue;
            }

            const stepObj = step as Record<string, unknown>;
            const uses = stepObj.uses;

            if (typeof uses === "string") {
                // Extract action name without version
                const atIndex = uses.indexOf("@");
                const action =
                    atIndex === -1 ? uses : uses.substring(0, atIndex);
                actions.add(action);
            }
        }
    }

    return actions;
}

/**
 * Identifies candidates that are missing from an existing workflow
 * @param candidates All candidates to potentially add
 * @param existingActions Actions already present in the workflow
 * @returns Candidates that need to be added
 */
export function findMissingCandidates(
    candidates: SetupStepCandidate[],
    existingActions: Set<string>,
): SetupStepCandidate[] {
    return candidates.filter(
        (candidate) => !existingActions.has(candidate.action),
    );
}

/**
 * Updates an existing workflow by appending missing setup steps
 * @param existingWorkflow The parsed existing workflow
 * @param missingCandidates Candidates to add to the workflow
 * @returns The updated workflow YAML content
 */
export function updateWorkflowWithMissingSteps(
    existingWorkflow: unknown,
    missingCandidates: SetupStepCandidate[],
): string {
    if (!existingWorkflow || typeof existingWorkflow !== "object") {
        // If we can't parse the existing workflow, generate a new one
        return generateWorkflowContent(missingCandidates);
    }

    // Deep clone the workflow
    const workflow = JSON.parse(JSON.stringify(existingWorkflow)) as Record<
        string,
        unknown
    >;

    const jobs = workflow.jobs as Record<string, unknown> | undefined;
    if (!jobs) {
        return generateWorkflowContent(missingCandidates);
    }

    // Find the main job (usually 'copilot-setup-steps' or similar)
    const jobNames = Object.keys(jobs);
    if (jobNames.length === 0) {
        return generateWorkflowContent(missingCandidates);
    }

    const mainJobName = jobNames[0];
    const mainJob = jobs[mainJobName] as Record<string, unknown>;

    if (!mainJob || !Array.isArray(mainJob.steps)) {
        return generateWorkflowContent(missingCandidates);
    }

    // Append missing steps
    const steps = mainJob.steps as unknown[];
    for (const candidate of missingCandidates) {
        const step = candidateToStep(candidate);
        step.name = generateStepName(candidate.action);
        steps.push(step);
    }

    return `---\n${stringifyYaml(workflow, { lineWidth: 0 })}`;
}

/**
 * Writes the Copilot Setup Steps workflow to the repository
 * @param targetDir The repository root directory
 * @param content The workflow YAML content
 */
export async function writeCopilotSetupWorkflow(
    targetDir: string,
    content: string,
): Promise<void> {
    const workflowPath = join(
        targetDir,
        ".github",
        "workflows",
        "copilot-setup-steps.yml",
    );
    await writeFile(workflowPath, content, "utf-8");
}
