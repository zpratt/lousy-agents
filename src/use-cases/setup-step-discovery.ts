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
                actions.add(parseActionName(uses));
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

    if (!workflow || typeof workflow !== "object") {
        return candidates;
    }

    const workflowObj = workflow as Record<string, unknown>;
    const jobs = workflowObj.jobs;

    if (!jobs || typeof jobs !== "object") {
        return candidates;
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

            if (typeof uses !== "string") {
                continue;
            }

            const action = parseActionName(uses);

            if (isSetupAction(action, patterns)) {
                // Extract version from uses string
                const atIndex = uses.indexOf("@");
                const version =
                    atIndex !== -1 ? uses.substring(atIndex + 1) : undefined;

                // Extract 'with' configuration
                const withConfig = stepObj.with;
                const config =
                    withConfig && typeof withConfig === "object"
                        ? (withConfig as Record<string, unknown>)
                        : undefined;

                candidates.push({
                    action,
                    version,
                    config,
                    source: "workflow",
                });
            }
        }
    }

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
