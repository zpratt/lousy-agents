/**
 * Finds steps of an existing workflow that still hold the version
 * placeholder and have a resolved SHA-pinned version available.
 */

import type { ResolvedVersion } from "../entities/copilot-setup.js";
import {
    findResolvedVersion,
    VERSION_PLACEHOLDER,
} from "./action-resolution.js";

/**
 * A workflow step that still holds the version placeholder, paired with the
 * resolved version that replaces it.
 */
export interface PlaceholderStepToPin {
    readonly step: Record<string, unknown>;
    readonly resolved: ResolvedVersion;
}

const PLACEHOLDER_SUFFIX = `@${VERSION_PLACEHOLDER}`;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

/**
 * Collects every step object in a parsed workflow's jobs.
 */
function collectStepObjects(
    jobs: Record<string, unknown>,
): Record<string, unknown>[] {
    return Object.values(jobs)
        .map((job) => (isRecord(job) ? job.steps : undefined))
        .filter((steps): steps is unknown[] => Array.isArray(steps))
        .flat()
        .filter(isRecord);
}

/**
 * Finds the resolved version for a step whose "uses" still holds the
 * version placeholder.
 */
function findResolvedVersionForPlaceholderStep(
    step: Record<string, unknown>,
    resolvedVersions: ResolvedVersion[],
): ResolvedVersion | undefined {
    const uses = step.uses;
    if (typeof uses !== "string" || !uses.endsWith(PLACEHOLDER_SUFFIX)) {
        return undefined;
    }
    const action = uses.slice(0, -PLACEHOLDER_SUFFIX.length);
    return findResolvedVersion(action, resolvedVersions);
}

/**
 * Lists the steps in a workflow's jobs that still hold the version
 * placeholder and for which a resolved version is available.
 * @param jobs The parsed "jobs" mapping of a workflow
 * @param resolvedVersions Resolved versions to apply
 */
export function findPlaceholderStepsToPin(
    jobs: Record<string, unknown>,
    resolvedVersions: ResolvedVersion[] | undefined,
): PlaceholderStepToPin[] {
    if (!resolvedVersions || resolvedVersions.length === 0) {
        return [];
    }
    return collectStepObjects(jobs).flatMap((step) => {
        const resolved = findResolvedVersionForPlaceholderStep(
            step,
            resolvedVersions,
        );
        return resolved ? [{ step, resolved }] : [];
    });
}

/**
 * Lists the actions in an existing workflow whose steps still hold the version
 * placeholder and for which a resolved version is available.
 * @param existingWorkflow The parsed existing workflow
 * @param resolvedVersions Resolved versions to apply
 * @returns Action names that would be SHA-pinned by updateWorkflowWithMissingSteps
 */
export function findPlaceholderActionsToPin(
    existingWorkflow: unknown,
    resolvedVersions: ResolvedVersion[] | undefined,
): string[] {
    const jobs = isRecord(existingWorkflow) ? existingWorkflow.jobs : undefined;
    if (!isRecord(jobs)) {
        return [];
    }
    return findPlaceholderStepsToPin(jobs, resolvedVersions).map(
        ({ resolved }) => resolved.action,
    );
}
