import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Represents a setup step candidate detected from workflows or version files
 */
export interface SetupStepCandidate {
    action: string;
    version?: string;
    config?: Record<string, string>;
    source: "version-file" | "workflow";
}

/**
 * Pattern for matching setup actions we care about
 */
const SETUP_ACTION_PATTERNS = [
    /^actions\/setup-node(@.*)?$/,
    /^actions\/setup-python(@.*)?$/,
    /^actions\/setup-java(@.*)?$/,
    /^actions\/setup-go(@.*)?$/,
    /^actions\/setup-ruby(@.*)?$/,
    /^jdx\/mise-action(@.*)?$/,
];

/**
 * Parses an action reference into action name and version
 * @param uses The "uses" string from a workflow step (e.g., "actions/setup-node@v4")
 * @returns Object with action name and optional version
 */
export function parseActionReference(uses: string): {
    action: string;
    version?: string;
} {
    const atIndex = uses.indexOf("@");
    if (atIndex === -1) {
        return { action: uses };
    }
    return {
        action: uses.substring(0, atIndex),
        version: uses.substring(atIndex + 1),
    };
}

/**
 * Checks if an action reference matches a setup action pattern
 * @param uses The "uses" string from a workflow step
 * @returns True if this is a setup action we care about
 */
export function isSetupAction(uses: string): boolean {
    return SETUP_ACTION_PATTERNS.some((pattern) => pattern.test(uses));
}

/**
 * Extracts setup step candidates from a workflow YAML structure
 * @param workflow Parsed workflow YAML object
 * @returns Array of setup step candidates found in the workflow
 */
function extractSetupStepsFromWorkflow(
    workflow: unknown,
): SetupStepCandidate[] {
    const candidates: SetupStepCandidate[] = [];

    if (!workflow || typeof workflow !== "object") {
        return candidates;
    }

    const workflowObj = workflow as Record<string, unknown>;
    const jobs = workflowObj.jobs;

    if (!jobs || typeof jobs !== "object") {
        return candidates;
    }

    const jobsObj = jobs as Record<string, unknown>;

    for (const jobKey of Object.keys(jobsObj)) {
        const job = jobsObj[jobKey];
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

            if (typeof uses !== "string") {
                continue;
            }

            if (!isSetupAction(uses)) {
                continue;
            }

            const { action, version } = parseActionReference(uses);
            const withConfig = stepObj.with as
                | Record<string, unknown>
                | undefined;

            const config: Record<string, string> | undefined = withConfig
                ? Object.fromEntries(
                      Object.entries(withConfig)
                          .filter(([, v]) => typeof v === "string")
                          .map(([k, v]) => [k, v as string]),
                  )
                : undefined;

            candidates.push({
                action,
                version,
                config:
                    config && Object.keys(config).length > 0
                        ? config
                        : undefined,
                source: "workflow",
            });
        }
    }

    return candidates;
}

/**
 * Parses workflow files in a directory to extract setup action candidates
 * @param workflowsDir The path to the .github/workflows directory
 * @returns Array of unique setup step candidates found across all workflows
 */
export async function parseWorkflows(
    workflowsDir: string,
): Promise<SetupStepCandidate[]> {
    const candidates: SetupStepCandidate[] = [];

    // Try to read the workflows directory
    let files: string[];
    try {
        files = await readdir(workflowsDir);
    } catch {
        // Directory doesn't exist or can't be read
        return candidates;
    }

    // Filter for YAML files
    const yamlFiles = files.filter(
        (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );

    // Parse each workflow file
    for (const filename of yamlFiles) {
        const filePath = join(workflowsDir, filename);
        try {
            const content = await readFile(filePath, "utf-8");
            const workflow = parseYaml(content);
            const workflowCandidates = extractSetupStepsFromWorkflow(workflow);
            candidates.push(...workflowCandidates);
        } catch {}
    }

    // Deduplicate by action name (prefer first occurrence which has full config)
    const seenActions = new Set<string>();
    return candidates.filter((candidate) => {
        if (seenActions.has(candidate.action)) {
            return false;
        }
        seenActions.add(candidate.action);
        return true;
    });
}

/**
 * Parses workflows from a repository root directory
 * @param rootDir The repository root directory
 * @returns Array of unique setup step candidates found in .github/workflows
 */
export async function parseWorkflowsFromRoot(
    rootDir: string = process.cwd(),
): Promise<SetupStepCandidate[]> {
    const workflowsDir = join(rootDir, ".github", "workflows");
    return parseWorkflows(workflowsDir);
}
