import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
    DetectedEnvironment,
    VersionFileType,
} from "./environment-detector.js";
import type { SetupStepCandidate } from "./workflow-parser.js";

/**
 * Represents a step in the generated workflow
 */
interface WorkflowStep {
    name?: string;
    uses?: string;
    with?: Record<string, string>;
    run?: string;
}

/**
 * Maps version file types to their corresponding setup actions
 */
const VERSION_FILE_TO_ACTION: Record<VersionFileType, string> = {
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
 * Version file config keys for each action
 */
const VERSION_FILE_CONFIG_KEYS: Record<string, string> = {
    "actions/setup-node": "node-version-file",
    "actions/setup-python": "python-version-file",
};

/**
 * Builds setup step candidates from detected environment
 * @param environment Detected environment configuration
 * @returns Array of setup step candidates derived from version files
 */
export function buildCandidatesFromEnvironment(
    environment: DetectedEnvironment,
): SetupStepCandidate[] {
    const candidates: SetupStepCandidate[] = [];

    // If mise.toml is present, add mise-action as the primary candidate
    if (environment.hasMise) {
        candidates.push({
            action: "jdx/mise-action",
            version: DEFAULT_ACTION_VERSIONS["jdx/mise-action"],
            source: "version-file",
        });
    }

    // Add candidates for version files (but skip if mise is present since mise handles everything)
    if (!environment.hasMise) {
        // Track which action types we've already added to avoid duplicates
        const addedActions = new Set<string>();

        for (const versionFile of environment.versionFiles) {
            const action = VERSION_FILE_TO_ACTION[versionFile.type];

            // Skip if we already have this action
            if (addedActions.has(action)) {
                continue;
            }
            addedActions.add(action);

            const configKey = VERSION_FILE_CONFIG_KEYS[action];
            const config = configKey
                ? { [configKey]: versionFile.filename }
                : undefined;

            candidates.push({
                action,
                version: DEFAULT_ACTION_VERSIONS[action],
                config,
                source: "version-file",
            });
        }
    }

    return candidates;
}

/**
 * Merges setup step candidates from multiple sources, with workflow sources taking precedence
 * @param environmentCandidates Candidates from environment detection
 * @param workflowCandidates Candidates from workflow parsing
 * @returns Deduplicated array of candidates (workflow config takes precedence)
 */
export function mergeCandidates(
    environmentCandidates: SetupStepCandidate[],
    workflowCandidates: SetupStepCandidate[],
): SetupStepCandidate[] {
    const candidateMap = new Map<string, SetupStepCandidate>();

    // Add environment candidates first
    for (const candidate of environmentCandidates) {
        candidateMap.set(candidate.action, candidate);
    }

    // Workflow candidates override environment candidates (they have more specific config)
    for (const candidate of workflowCandidates) {
        candidateMap.set(candidate.action, candidate);
    }

    return Array.from(candidateMap.values());
}

/**
 * Converts a setup step candidate to a workflow step object
 * @param candidate The setup step candidate
 * @returns A workflow step object
 */
function candidateToStep(candidate: SetupStepCandidate): WorkflowStep {
    const step: WorkflowStep = {
        uses: candidate.version
            ? `${candidate.action}@${candidate.version}`
            : candidate.action,
    };

    if (candidate.config && Object.keys(candidate.config).length > 0) {
        step.with = candidate.config;
    }

    return step;
}

/**
 * Orders candidates in a logical sequence for workflow execution
 * @param candidates Array of candidates to order
 * @returns Ordered array (mise first, then alphabetically by action)
 */
function orderCandidates(
    candidates: SetupStepCandidate[],
): SetupStepCandidate[] {
    return [...candidates].sort((a, b) => {
        // mise-action should come first
        if (a.action === "jdx/mise-action") return -1;
        if (b.action === "jdx/mise-action") return 1;
        // Then alphabetically
        return a.action.localeCompare(b.action);
    });
}

/**
 * Generates a complete Copilot Setup Steps workflow YAML content
 * @param candidates Array of setup step candidates to include
 * @returns Generated workflow YAML string
 */
export function generateWorkflowYaml(candidates: SetupStepCandidate[]): string {
    const orderedCandidates = orderCandidates(candidates);

    const steps: WorkflowStep[] = [
        {
            name: "Checkout",
            uses: `actions/checkout@${DEFAULT_ACTION_VERSIONS["actions/checkout"]}`,
        },
        ...orderedCandidates.map(candidateToStep),
    ];

    const workflow = {
        name: "Copilot Setup Steps",
        on: {
            workflow_dispatch: {},
            pull_request: {},
        },
        permissions: {
            contents: "read",
            "id-token": "write",
        },
        jobs: {
            "copilot-setup-steps": {
                "runs-on": "ubuntu-latest",
                steps,
            },
        },
    };

    return stringifyYaml(workflow, {
        lineWidth: 0,
        indent: 2,
    });
}

/**
 * Parses an existing workflow file to extract current steps
 * @param workflowContent The workflow YAML content
 * @returns Array of action names currently in the workflow
 */
export function extractExistingActions(workflowContent: string): string[] {
    try {
        const workflow = parseYaml(workflowContent);

        if (!workflow || typeof workflow !== "object") {
            return [];
        }

        const workflowObj = workflow as Record<string, unknown>;
        const jobs = workflowObj.jobs as Record<string, unknown> | undefined;

        if (!jobs) {
            return [];
        }

        const actions: string[] = [];

        for (const jobKey of Object.keys(jobs)) {
            const job = jobs[jobKey] as Record<string, unknown> | undefined;
            if (!job) continue;

            const steps = job.steps as unknown[];
            if (!Array.isArray(steps)) continue;

            for (const step of steps) {
                if (!step || typeof step !== "object") continue;
                const stepObj = step as Record<string, unknown>;
                const uses = stepObj.uses;
                if (typeof uses === "string") {
                    // Extract action name without version
                    const atIndex = uses.indexOf("@");
                    actions.push(
                        atIndex === -1 ? uses : uses.substring(0, atIndex),
                    );
                }
            }
        }

        return actions;
    } catch {
        return [];
    }
}

/**
 * Result of updating a workflow
 */
export interface WorkflowUpdateResult {
    updated: boolean;
    content: string;
    addedSteps: string[];
}

/**
 * Updates an existing workflow with missing setup step candidates
 * @param existingContent The existing workflow YAML content
 * @param candidates Array of setup step candidates that should be present
 * @returns Update result with new content and list of added steps
 */
export function updateWorkflow(
    existingContent: string,
    candidates: SetupStepCandidate[],
): WorkflowUpdateResult {
    const existingActions = extractExistingActions(existingContent);
    const existingActionSet = new Set(existingActions);

    // Filter candidates to only those not already present
    const missingCandidates = candidates.filter(
        (c) => !existingActionSet.has(c.action),
    );

    if (missingCandidates.length === 0) {
        return {
            updated: false,
            content: existingContent,
            addedSteps: [],
        };
    }

    // Parse existing workflow
    let workflow: Record<string, unknown>;
    try {
        workflow = parseYaml(existingContent) as Record<string, unknown>;
    } catch {
        // If parsing fails, generate a new workflow
        return {
            updated: true,
            content: generateWorkflowYaml(candidates),
            addedSteps: candidates.map((c) => c.action),
        };
    }

    // Find the copilot-setup-steps job or the first job
    const jobs = workflow.jobs as Record<string, unknown> | undefined;
    if (!jobs) {
        // No jobs, generate fresh workflow
        return {
            updated: true,
            content: generateWorkflowYaml(candidates),
            addedSteps: candidates.map((c) => c.action),
        };
    }

    // Try to find copilot-setup-steps job, otherwise use first job
    const targetJobKey =
        "copilot-setup-steps" in jobs
            ? "copilot-setup-steps"
            : Object.keys(jobs)[0];
    const targetJob = jobs[targetJobKey] as Record<string, unknown>;

    if (!targetJob) {
        return {
            updated: true,
            content: generateWorkflowYaml(candidates),
            addedSteps: candidates.map((c) => c.action),
        };
    }

    // Get existing steps
    let steps = targetJob.steps as WorkflowStep[];
    if (!Array.isArray(steps)) {
        steps = [];
    }

    // Add missing steps at the end (after checkout and existing setup steps)
    const orderedMissing = orderCandidates(missingCandidates);
    const newSteps = orderedMissing.map(candidateToStep);
    targetJob.steps = [...steps, ...newSteps];

    return {
        updated: true,
        content: stringifyYaml(workflow, { lineWidth: 0, indent: 2 }),
        addedSteps: missingCandidates.map((c) => c.action),
    };
}

/**
 * Result of the workflow generation/update operation
 */
export interface WorkflowResult {
    created: boolean;
    updated: boolean;
    path: string;
    addedSteps: string[];
}

/**
 * Path to the Copilot Setup Steps workflow file
 */
export const COPILOT_SETUP_WORKFLOW_PATH =
    ".github/workflows/copilot-setup-steps.yml";

/**
 * Creates or updates the Copilot Setup Steps workflow file
 * @param rootDir The repository root directory
 * @param candidates Array of setup step candidates
 * @returns Result of the operation
 */
export async function createOrUpdateWorkflow(
    rootDir: string,
    candidates: SetupStepCandidate[],
): Promise<WorkflowResult> {
    const workflowPath = join(rootDir, COPILOT_SETUP_WORKFLOW_PATH);

    // Try to read existing workflow
    let existingContent: string | null = null;
    try {
        existingContent = await readFile(workflowPath, "utf-8");
    } catch {
        // File doesn't exist
    }

    if (existingContent === null) {
        // Create new workflow
        const content = generateWorkflowYaml(candidates);
        await writeFile(workflowPath, content, "utf-8");

        return {
            created: true,
            updated: false,
            path: workflowPath,
            addedSteps: candidates.map((c) => c.action),
        };
    }

    // Update existing workflow
    const updateResult = updateWorkflow(existingContent, candidates);

    if (updateResult.updated) {
        await writeFile(workflowPath, updateResult.content, "utf-8");
    }

    return {
        created: false,
        updated: updateResult.updated,
        path: workflowPath,
        addedSteps: updateResult.addedSteps,
    };
}
