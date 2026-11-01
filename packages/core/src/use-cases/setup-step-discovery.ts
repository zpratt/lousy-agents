/**
 * Use case for discovering setup steps in workflows.
 * This module provides reusable logic for finding existing and missing setup steps.
 */

import type { SetupStepCandidate } from "../entities/copilot-setup.js";

/**
 * Extracts action name from a "uses" string
 * @example "actions/setup-node@v4" -> "actions/setup-node"
 */
export function parseActionName(uses: string): string {
    const atIndex = uses.indexOf("@");
    return atIndex === -1 ? uses : uses.substring(0, atIndex);
}

/**
 * Checks if an action matches any of the setup action patterns
 * @param actionName The action name to check (e.g., "actions/setup-node")
 * @param patterns List of patterns to match against
 */
export function isSetupAction(actionName: string, patterns: string[]): boolean {
    return patterns.includes(actionName);
}

/**
 * Step object extracted from a workflow
 */
interface WorkflowStepInfo {
    uses: string;
    with?: Record<string, unknown>;
}

/**
 * Step object with all fields (for workflow reading)
 */
export interface WorkflowStepDetails {
    name?: string;
    uses?: string;
    with?: Record<string, unknown>;
}

/**
 * Narrows to a truthy, object-typed value (arrays included).
 */
function isObjectLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

/**
 * Returns every step object in every job of a workflow, in job and step order.
 * Anything that is not an object (a missing "jobs" map, a job without a
 * "steps" array, a non-object step) contributes no steps.
 * @param workflow The parsed workflow object
 */
function workflowStepObjects(workflow: unknown): Record<string, unknown>[] {
    if (!isObjectLike(workflow) || !isObjectLike(workflow.jobs)) {
        return [];
    }

    return Object.values(workflow.jobs)
        .filter(isObjectLike)
        .flatMap((job) =>
            Array.isArray(job.steps) ? job.steps.filter(isObjectLike) : [],
        );
}

/**
 * Reads a step's "with" configuration, ignoring anything that is not an object
 */
function toWithConfig(value: unknown): Record<string, unknown> | undefined {
    return isObjectLike(value) ? value : undefined;
}

/**
 * Returns all steps in a workflow that have a "uses" field
 * @param workflow The parsed workflow object
 */
function workflowUsesSteps(workflow: unknown): WorkflowStepInfo[] {
    return workflowStepObjects(workflow).flatMap((step) =>
        typeof step.uses === "string"
            ? [{ uses: step.uses, with: toWithConfig(step.with) }]
            : [],
    );
}

/**
 * Builds the key under which a run step is recorded in the set of existing
 * workflow steps. Run steps have no "uses" field, so they are matched by
 * their command.
 * @example "npm ci" -> "run-command:npm ci"
 */
export function runCommandKey(command: string): string {
    return `run-command:${command.trim()}`;
}

/**
 * Extracts all steps from a workflow (including steps without "uses")
 * @param workflow The parsed workflow object
 * @returns Array of step details
 */
export function extractAllWorkflowSteps(
    workflow: unknown,
): WorkflowStepDetails[] {
    return workflowStepObjects(workflow).map((step) => ({
        name: typeof step.name === "string" ? step.name : undefined,
        uses: typeof step.uses === "string" ? step.uses : undefined,
        with: toWithConfig(step.with),
    }));
}

/**
 * The key a step contributes to the set of existing workflow steps: its action
 * name when it uses an action, otherwise its run command key.
 */
function existingActionKeys(step: Record<string, unknown>): string[] {
    if (typeof step.uses === "string") {
        return [parseActionName(step.uses)];
    }
    if (typeof step.run === "string") {
        return [runCommandKey(step.run)];
    }
    return [];
}

/**
 * Extracts existing setup actions from a parsed workflow
 * @param workflow The parsed workflow object
 * @returns Set of action names already present, plus a runCommandKey for each run step
 */
export function getExistingActionsFromWorkflow(workflow: unknown): Set<string> {
    return new Set(workflowStepObjects(workflow).flatMap(existingActionKeys));
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
    return candidates.filter((candidate) =>
        candidate.run
            ? !existingActions.has(runCommandKey(candidate.run))
            : !existingActions.has(candidate.action),
    );
}

/**
 * Merges candidates from multiple sources, with earlier sources taking precedence
 * @param candidateSources Arrays of candidates, in order of precedence
 * @returns Merged and deduplicated candidates
 */
export function mergeCandidates(
    ...candidateSources: SetupStepCandidate[][]
): SetupStepCandidate[] {
    return deduplicateCandidates(candidateSources.flat());
}

/**
 * Extracts version from a "uses" string
 * @example "actions/setup-node@v4" -> "v4"
 */
export function parseActionVersion(uses: string): string | undefined {
    const atIndex = uses.indexOf("@");
    return atIndex !== -1 ? uses.substring(atIndex + 1) : undefined;
}

/**
 * Action reference with name and version.
 * @example { name: "actions/setup-node", version: "v4" }
 * @example { name: "actions/checkout", version: "b4ffde65f46336ab88eb53be808477a3936bae11" }
 */
export interface ActionReference {
    /** The action name without version (e.g., "actions/setup-node") */
    name: string;
    /** The version, tag, or commit SHA (e.g., "v4", "main", "a1b2c3d4") */
    version: string;
}

/**
 * Extracts all action references from a workflow.
 * Only includes actions that have a version specified (format: "action@version").
 * Actions without versions are skipped as they represent incomplete references.
 * @param workflow The parsed workflow object
 * @returns Array of action references with name and version
 */
export function extractActionsFromWorkflow(
    workflow: unknown,
): ActionReference[] {
    return workflowUsesSteps(workflow).flatMap((step): ActionReference[] => {
        const version = parseActionVersion(step.uses);
        // Skip actions without versions - these are incomplete references
        return version ? [{ name: parseActionName(step.uses), version }] : [];
    });
}

/**
 * Extracts setup step candidates from a parsed workflow based on action patterns
 * @param workflow The parsed workflow object
 * @param patterns List of action patterns to detect
 * @returns Array of setup step candidates
 */
export function extractSetupStepsFromWorkflow(
    workflow: unknown,
    patterns: string[],
): SetupStepCandidate[] {
    return workflowUsesSteps(workflow).flatMap((step): SetupStepCandidate[] => {
        const action = parseActionName(step.uses);

        return isSetupAction(action, patterns)
            ? [
                  {
                      action,
                      version: parseActionVersion(step.uses),
                      config: step.with,
                      source: "workflow",
                  },
              ]
            : [];
    });
}

/**
 * Deduplicates candidates by action name, keeping the first occurrence
 * @param candidates Array of candidates to deduplicate
 * @returns Deduplicated array of candidates
 */
export function deduplicateCandidates(
    candidates: SetupStepCandidate[],
): SetupStepCandidate[] {
    const seen = new Set<string>();
    const deduplicated: SetupStepCandidate[] = [];

    for (const candidate of candidates) {
        if (!seen.has(candidate.action)) {
            seen.add(candidate.action);
            deduplicated.push(candidate);
        }
    }

    return deduplicated;
}
