/**
 * Pure path→construct matching helpers over the agentic location catalog.
 * No filesystem I/O.
 */

import {
    AGENTIC_LOCATION_CATALOG,
    type AgenticConstructType,
    type AgenticLocationEntry,
    type LintDiscoveryTarget,
} from "../entities/agentic-location-catalog.js";

/**
 * Normalizes a repo-relative path for catalog matching.
 * Collapses `.` / `..` segments. Returns "" when the path is absolute or
 * escapes the repository root — callers treat "" as non-matching.
 */
export function normalizeRepoRelativePath(path: string): string {
    const normalized = path.replaceAll("\\", "/");
    // POSIX absolute, UNC-style leading slash after backslash conversion,
    // and Windows drive-letter absolute (C:/..., d:\...).
    if (normalized.startsWith("/") || /^[A-Za-z]:(\/|$)/.test(normalized)) {
        return "";
    }

    const resolved: string[] = [];
    for (const segment of normalized.split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }
        if (segment === "..") {
            if (resolved.length === 0) {
                return "";
            }
            resolved.pop();
            continue;
        }
        resolved.push(segment);
    }
    return resolved.join("/");
}

export function matchesLocationEntry(
    path: string,
    entry: AgenticLocationEntry,
): boolean {
    const normalized = normalizeRepoRelativePath(path);
    if (entry.matchKind === "exact") {
        return normalized === entry.path;
    }
    return normalized === entry.path || normalized.startsWith(`${entry.path}/`);
}

export function entriesMatchingPath(
    path: string,
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): AgenticLocationEntry[] {
    return catalog.filter((entry) => matchesLocationEntry(path, entry));
}

function specificityScore(entry: AgenticLocationEntry): number {
    // Exact matches outrank any prefix; longer prefixes outrank shorter ones.
    const kindBonus = entry.matchKind === "exact" ? 1_000_000 : 0;
    return kindBonus + entry.path.length;
}

function bestMatchingEntry(
    path: string,
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): AgenticLocationEntry | null {
    const matches = entriesMatchingPath(path, catalog);
    if (matches.length === 0) {
        return null;
    }
    let best = matches[0] as AgenticLocationEntry;
    let bestScore = specificityScore(best);
    for (let i = 1; i < matches.length; i++) {
        const candidate = matches[i] as AgenticLocationEntry;
        const score = specificityScore(candidate);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}

export function primaryConstructTypeForPath(
    path: string,
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): AgenticConstructType | null {
    return bestMatchingEntry(path, catalog)?.primaryConstruct ?? null;
}

export function constructTypesForPath(
    path: string,
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): readonly AgenticConstructType[] {
    const best = bestMatchingEntry(path, catalog);
    if (!best) {
        return [];
    }
    if (best.secondaryConstructs && best.secondaryConstructs.length > 0) {
        return [best.primaryConstruct, ...best.secondaryConstructs];
    }
    return [best.primaryConstruct];
}

export function lintTargetEntries(
    target: Exclude<LintDiscoveryTarget, "none">,
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): AgenticLocationEntry[] {
    return catalog.filter((entry) => entry.lintTarget === target);
}

export function skillDirectoryRoots(
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): readonly string[] {
    return lintTargetEntries("skills", catalog)
        .filter((entry) => entry.matchKind === "directory-prefix")
        .map((entry) => entry.path);
}

export function agentDirectoryRoots(
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): readonly string[] {
    return lintTargetEntries("agents", catalog)
        .filter((entry) => entry.matchKind === "directory-prefix")
        .map((entry) => entry.path);
}

export function hookConfigPaths(
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): ReadonlyArray<{ relativePath: string; platform: "copilot" | "claude" }> {
    return lintTargetEntries("hooks", catalog)
        .filter(
            (
                entry,
            ): entry is AgenticLocationEntry & {
                hookPlatform: "copilot" | "claude";
            } => entry.matchKind === "exact" && entry.hookPlatform != null,
        )
        .map((entry) => ({
            relativePath: entry.path,
            platform: entry.hookPlatform,
        }));
}

export function instructionDiscoveryEntries(
    catalog: readonly AgenticLocationEntry[] = AGENTIC_LOCATION_CATALOG,
): AgenticLocationEntry[] {
    return catalog.filter((entry) => entry.instructionFormat != null);
}
