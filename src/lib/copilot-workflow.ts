import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { fileExists } from "./filesystem-structure.js";

/**
 * GitHub Actions expression for github.token
 * Split to avoid linter false positive about template strings
 */
const GITHUB_TOKEN_EXPR = "$" + "{{ github.token }}";

/**
 * Represents a detected version file and its corresponding setup action
 */
export interface VersionFileCandidate {
    file: string;
    runtime: string;
    setupAction: string;
    version?: string;
}

/**
 * Represents a setup action found in an existing workflow
 */
export interface WorkflowSetupStep {
    action: string;
    with?: Record<string, unknown>;
}

/**
 * Represents the result of analyzing a repository for Copilot Setup Steps
 */
export interface CopilotWorkflowAnalysis {
    versionFileCandidates: VersionFileCandidate[];
    workflowSetupSteps: WorkflowSetupStep[];
    existingCopilotWorkflow: boolean;
    existingCopilotWorkflowPath?: string;
    existingCopilotWorkflowSteps: WorkflowSetupStep[];
}

/**
 * Mapping of version files to their corresponding setup actions
 */
const VERSION_FILE_MAPPINGS: Record<
    string,
    { runtime: string; setupAction: string }
> = {
    ".nvmrc": { runtime: "node", setupAction: "actions/setup-node" },
    ".node-version": { runtime: "node", setupAction: "actions/setup-node" },
    ".python-version": {
        runtime: "python",
        setupAction: "actions/setup-python",
    },
    ".java-version": { runtime: "java", setupAction: "actions/setup-java" },
    ".ruby-version": { runtime: "ruby", setupAction: "ruby/setup-ruby" },
    ".go-version": { runtime: "go", setupAction: "actions/setup-go" },
    "mise.toml": { runtime: "mise", setupAction: "jdx/mise-action" },
    ".mise.toml": { runtime: "mise", setupAction: "jdx/mise-action" },
};

/**
 * Pattern to match setup-* actions in workflows
 */
const SETUP_ACTION_PATTERN =
    /^(actions\/setup-\w+|jdx\/mise-action|ruby\/setup-ruby)/;

/**
 * Detects version files in the root of the repository
 * @param targetDir The directory to scan for version files
 * @returns Array of detected version file candidates
 */
export async function detectVersionFiles(
    targetDir: string,
): Promise<VersionFileCandidate[]> {
    const candidates: VersionFileCandidate[] = [];

    for (const [file, mapping] of Object.entries(VERSION_FILE_MAPPINGS)) {
        const filePath = join(targetDir, file);
        if (await fileExists(filePath)) {
            let version: string | undefined;

            // Try to read version from the file (except for mise.toml which is more complex)
            if (!file.includes("mise")) {
                try {
                    const content = await readFile(filePath, "utf-8");
                    version = content.trim();
                } catch {
                    // Ignore read errors, version will be undefined
                }
            }

            candidates.push({
                file,
                runtime: mapping.runtime,
                setupAction: mapping.setupAction,
                version,
            });
        }
    }

    return candidates;
}

/**
 * Parses a single workflow file and extracts setup steps
 * @param workflowPath Path to the workflow YAML file
 * @returns Array of setup steps found in the workflow
 */
export async function parseWorkflowSetupSteps(
    workflowPath: string,
): Promise<WorkflowSetupStep[]> {
    const setupSteps: WorkflowSetupStep[] = [];

    try {
        const content = await readFile(workflowPath, "utf-8");
        const workflow = parseYaml(content) as {
            jobs?: Record<
                string,
                {
                    steps?: Array<{
                        uses?: string;
                        with?: Record<string, unknown>;
                    }>;
                }
            >;
        };

        if (!workflow?.jobs) {
            return setupSteps;
        }

        for (const job of Object.values(workflow.jobs)) {
            if (!job.steps) continue;

            for (const step of job.steps) {
                if (!step.uses) continue;

                // Extract action name without version/SHA
                const actionMatch = step.uses.match(/^([^@]+)/);
                if (!actionMatch) continue;

                const action = actionMatch[1];
                if (SETUP_ACTION_PATTERN.test(action)) {
                    setupSteps.push({
                        action,
                        with: step.with,
                    });
                }
            }
        }
    } catch {
        // Ignore parse errors for individual workflow files
    }

    return setupSteps;
}

/**
 * Parses all workflow files in the .github/workflows directory
 * @param targetDir The repository root directory
 * @returns Array of unique setup steps found across all workflows
 */
export async function parseAllWorkflowSetupSteps(
    targetDir: string,
): Promise<WorkflowSetupStep[]> {
    const workflowsDir = join(targetDir, ".github", "workflows");
    const allSetupSteps: WorkflowSetupStep[] = [];

    if (!(await fileExists(workflowsDir))) {
        return allSetupSteps;
    }

    try {
        const files = await readdir(workflowsDir);
        const workflowFiles = files.filter(
            (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
        );

        for (const file of workflowFiles) {
            // Skip the copilot-setup-steps workflow itself
            if (
                file === "copilot-setup-steps.yml" ||
                file === "copilot-setup-steps.yaml"
            ) {
                continue;
            }

            const workflowPath = join(workflowsDir, file);
            const steps = await parseWorkflowSetupSteps(workflowPath);
            allSetupSteps.push(...steps);
        }
    } catch {
        // Ignore directory read errors
    }

    // Deduplicate by action name
    const seen = new Set<string>();
    return allSetupSteps.filter((step) => {
        if (seen.has(step.action)) {
            return false;
        }
        seen.add(step.action);
        return true;
    });
}

/**
 * Checks if a Copilot Setup Steps workflow already exists
 * @param targetDir The repository root directory
 * @returns Object with existence flag and path if found
 */
export async function checkExistingCopilotWorkflow(
    targetDir: string,
): Promise<{ exists: boolean; path?: string; steps: WorkflowSetupStep[] }> {
    const workflowsDir = join(targetDir, ".github", "workflows");
    const possibleNames = [
        "copilot-setup-steps.yml",
        "copilot-setup-steps.yaml",
    ];

    for (const name of possibleNames) {
        const workflowPath = join(workflowsDir, name);
        if (await fileExists(workflowPath)) {
            const steps = await parseWorkflowSetupSteps(workflowPath);
            return { exists: true, path: workflowPath, steps };
        }
    }

    return { exists: false, steps: [] };
}

/**
 * Performs a complete analysis of the repository for Copilot Setup Steps configuration
 * @param targetDir The repository root directory
 * @returns Complete analysis of version files and workflow setup steps
 */
export async function analyzeCopilotWorkflowNeeds(
    targetDir: string,
): Promise<CopilotWorkflowAnalysis> {
    const [versionFileCandidates, workflowSetupSteps, existingWorkflow] =
        await Promise.all([
            detectVersionFiles(targetDir),
            parseAllWorkflowSetupSteps(targetDir),
            checkExistingCopilotWorkflow(targetDir),
        ]);

    return {
        versionFileCandidates,
        workflowSetupSteps,
        existingCopilotWorkflow: existingWorkflow.exists,
        existingCopilotWorkflowPath: existingWorkflow.path,
        existingCopilotWorkflowSteps: existingWorkflow.steps,
    };
}

/**
 * Pinned action versions for reproducibility
 * Format: action@sha # version
 */
export const PINNED_ACTIONS: Record<string, { sha: string; version: string }> =
    {
        "actions/checkout": {
            sha: "11bd71901bbe5b1630ceea73d27597364c9af683",
            version: "v4.2.2",
        },
        "actions/setup-node": {
            sha: "39370e3970a6d050c480ffad4ff0ed4d3fdee5af",
            version: "v4.1.0",
        },
        "actions/setup-python": {
            sha: "0b93645e9fea7318ecaed2b359559ac225c90a2b",
            version: "v5.3.0",
        },
        "actions/setup-java": {
            sha: "7a6d8a8234af8eb26422e24e3006232cccaa061b",
            version: "v4.6.0",
        },
        "actions/setup-go": {
            sha: "3041bf56c941b39c61721a86cd11f3bb1338122a",
            version: "v5.2.0",
        },
        "ruby/setup-ruby": {
            sha: "a4effe49ee8ee5b8224aba0bcf7754adb0aeb1e4",
            version: "v1.202.0",
        },
        "jdx/mise-action": {
            sha: "146a28175021df8ca24f8ee1828cc2a60f980bd5",
            version: "v3.5.1",
        },
    };

/**
 * Generates a pinned action reference
 * @param action The action name (e.g., "actions/setup-node")
 * @returns Pinned reference string with SHA and version comment
 */
export function getPinnedAction(action: string): string {
    const pinned = PINNED_ACTIONS[action];
    if (pinned) {
        return `${action}@${pinned.sha}  # ${pinned.version}`;
    }
    return action;
}

/**
 * Determines which setup steps are missing from the existing Copilot workflow
 * @param analysis The complete analysis of the repository
 * @returns Array of setup steps that should be added
 */
export function determineMissingSetupSteps(
    analysis: CopilotWorkflowAnalysis,
): WorkflowSetupStep[] {
    const existingActions = new Set(
        analysis.existingCopilotWorkflowSteps.map((s) => s.action),
    );

    const allNeededSteps: WorkflowSetupStep[] = [];

    // Add steps from version files
    for (const candidate of analysis.versionFileCandidates) {
        if (!existingActions.has(candidate.setupAction)) {
            const step: WorkflowSetupStep = {
                action: candidate.setupAction,
            };

            // Add version configuration if available
            if (candidate.version && candidate.runtime !== "mise") {
                step.with = getSetupActionWith(candidate);
            }

            allNeededSteps.push(step);
            existingActions.add(candidate.setupAction);
        }
    }

    // Add steps from other workflows
    for (const step of analysis.workflowSetupSteps) {
        if (!existingActions.has(step.action)) {
            allNeededSteps.push(step);
            existingActions.add(step.action);
        }
    }

    return allNeededSteps;
}

/**
 * Gets the 'with' configuration for a setup action based on version file
 */
function getSetupActionWith(
    candidate: VersionFileCandidate,
): Record<string, unknown> | undefined {
    switch (candidate.setupAction) {
        case "actions/setup-node":
            return { "node-version-file": candidate.file };
        case "actions/setup-python":
            return { "python-version-file": candidate.file };
        case "actions/setup-java":
            return {
                "java-version-file": candidate.file,
                distribution: "temurin",
            };
        case "actions/setup-go":
            return { "go-version-file": candidate.file };
        case "ruby/setup-ruby":
            return { "ruby-version": candidate.file };
        default:
            return undefined;
    }
}

/**
 * Generates the Copilot Setup Steps workflow content
 * @param analysis The complete analysis of the repository
 * @returns YAML content for the workflow file
 */
export function generateCopilotWorkflowContent(
    analysis: CopilotWorkflowAnalysis,
): string {
    const lines: string[] = [
        "---",
        'name: "Copilot Setup Steps"',
        "",
        "on:",
        "  workflow_dispatch:",
        "  push:",
        "    branches:",
        "      - main",
        "    paths:",
        "      - .github/workflows/copilot-setup-steps.yml",
        "  pull_request:",
        "    branches:",
        "      - main",
        "    paths:",
        "      - .github/workflows/copilot-setup-steps.yml",
        "",
        "jobs:",
        "  copilot-setup-steps:",
        "    runs-on: ubuntu-latest",
        "    timeout-minutes: 30",
        "    permissions:",
        "      id-token: write",
        "      contents: read",
        "",
        "    steps:",
        "      - name: Checkout code",
        `        uses: ${getPinnedAction("actions/checkout")}`,
    ];

    // Determine all setup steps needed
    const allSteps = determineMissingSetupSteps({
        ...analysis,
        existingCopilotWorkflowSteps: [], // Start fresh for generation
    });

    // Add setup steps
    for (const step of allSteps) {
        lines.push("");
        lines.push(`      - name: Setup ${getActionDisplayName(step.action)}`);
        lines.push(`        uses: ${getPinnedAction(step.action)}`);

        if (step.with && Object.keys(step.with).length > 0) {
            lines.push("        with:");
            for (const [key, value] of Object.entries(step.with)) {
                lines.push(`          ${key}: ${formatYamlValue(value)}`);
            }
        }

        // Add github_token for mise-action
        if (step.action === "jdx/mise-action") {
            if (!step.with) {
                lines.push("        with:");
            }
            lines.push(`          github_token: ${GITHUB_TOKEN_EXPR}`);
        }
    }

    // Add verification step
    lines.push("");
    lines.push("      - name: Verify development environment");
    lines.push("        run: |");
    lines.push('          echo "=== Development environment ready! ==="');

    // Add version verification for each runtime
    for (const step of allSteps) {
        const verifyCmd = getVersionVerifyCommand(step.action);
        if (verifyCmd) {
            lines.push(`          ${verifyCmd}`);
        }
    }

    lines.push("");

    return lines.join("\n");
}

/**
 * Gets a display name for an action
 */
function getActionDisplayName(action: string): string {
    const nameMap: Record<string, string> = {
        "actions/setup-node": "Node.js",
        "actions/setup-python": "Python",
        "actions/setup-java": "Java",
        "actions/setup-go": "Go",
        "ruby/setup-ruby": "Ruby",
        "jdx/mise-action": "mise",
    };
    return nameMap[action] || action;
}

/**
 * Gets a version verification command for a runtime
 */
function getVersionVerifyCommand(action: string): string | undefined {
    const cmdMap: Record<string, string> = {
        "actions/setup-node": "node --version && npm --version",
        "actions/setup-python": "python --version",
        "actions/setup-java": "java --version",
        "actions/setup-go": "go version",
        "ruby/setup-ruby": "ruby --version",
        "jdx/mise-action": "mise --version",
    };
    return cmdMap[action];
}

/**
 * Formats a value for YAML output
 */
function formatYamlValue(value: unknown): string {
    if (typeof value === "string") {
        // Quote strings that contain special characters
        if (value.includes(":") || value.includes("#") || value.includes("'")) {
            return `"${value}"`;
        }
        return `'${value}'`;
    }
    return String(value);
}
