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
 * Iterates over all steps in a workflow that have a "uses" field
 * @param workflow The parsed workflow object
 * @param callback Function to call for each step with a "uses" field
 */
function forEachWorkflowStep(
    workflow: unknown,
    callback: (step: WorkflowStepInfo) => void,
): void {
    if (!workflow || typeof workflow !== "object") {
        return;
    }

    const jobs = (workflow as Record<string, unknown>).jobs;
    if (!jobs || typeof jobs !== "object") {
        return;
    }

    for (const job of Object.values(jobs as Record<string, unknown>)) {
        if (!job || typeof job !== "object") {
            continue;
        }

        const steps = (job as Record<string, unknown>).steps;
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
                const withConfig = stepObj.with;
                callback({
                    uses,
                    with:
                        withConfig && typeof withConfig === "object"
                            ? (withConfig as Record<string, unknown>)
                            : undefined,
                });
            }
        }
    }
}

/**
 * Extracts existing setup actions from a parsed workflow
 * @param workflow The parsed workflow object
 * @returns Set of action names already present
 */
export function getExistingActionsFromWorkflow(workflow: unknown): Set<string> {
    const actions = new Set<string>();

    forEachWorkflowStep(workflow, (step) => {
        actions.add(parseActionName(step.uses));
    });

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
 * Merges candidates from multiple sources, with earlier sources taking precedence
 * @param candidateSources Arrays of candidates, in order of precedence
 * @returns Merged and deduplicated candidates
 */
export function mergeCandidates(
    ...candidateSources: SetupStepCandidate[][]
): SetupStepCandidate[] {
    const result: SetupStepCandidate[] = [];
    const seen = new Set<string>();

    for (const candidates of candidateSources) {
        for (const candidate of candidates) {
            if (!seen.has(candidate.action)) {
                seen.add(candidate.action);
                result.push(candidate);
            }
        }
    }

    return result;
}

/**
 * Extracts version from a "uses" string
 * @example "actions/setup-node@v4" -> "v4"
 */
function extractVersionFromUses(uses: string): string | undefined {
    const atIndex = uses.indexOf("@");
    return atIndex !== -1 ? uses.substring(atIndex + 1) : undefined;
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
    const candidates: SetupStepCandidate[] = [];

    forEachWorkflowStep(workflow, (step) => {
        const action = parseActionName(step.uses);

        if (isSetupAction(action, patterns)) {
            candidates.push({
                action,
                version: extractVersionFromUses(step.uses),
                config: step.with,
                source: "workflow",
            });
        }
    });

    return candidates;
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
