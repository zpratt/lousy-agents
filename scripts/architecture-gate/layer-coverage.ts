import type { LayerPolicy } from "./layer-policy.js";

const REPOSITORY_ROOT = ".";

export interface AmbiguouslyMappedFile {
    readonly file: string;
    readonly layers: readonly string[];
}

export interface NestedPrefixes {
    readonly ancestor: string;
    readonly descendant: string;
}

/**
 * Whether a repository-relative path falls under a layer prefix, by whole path
 * segments as coach decides it: the prefix is the path itself or a directory
 * above it, so `index.ts` does not match `index-utils.ts`.
 */
export function matchesPrefix(path: string, prefix: string): boolean {
    return (
        prefix === REPOSITORY_ROOT ||
        path === prefix ||
        path.startsWith(`${prefix}/`)
    );
}

function layersClaiming(file: string, policy: LayerPolicy): string[] {
    return policy.layers
        .filter((layer) =>
            layer.prefixes.some((prefix) => matchesPrefix(file, prefix)),
        )
        .map((layer) => layer.name);
}

/**
 * Files that no layer claims. Coach says nothing about an import to or from
 * such a file, so each one is a hole in the architecture check.
 */
export function findUnmappedFiles(
    files: readonly string[],
    policy: LayerPolicy,
): string[] {
    return files.filter((file) => layersClaiming(file, policy).length === 0);
}

/** Files claimed by more than one layer, with the layers that claim them. */
export function findAmbiguouslyMappedFiles(
    files: readonly string[],
    policy: LayerPolicy,
): AmbiguouslyMappedFile[] {
    return files
        .map((file) => ({ file, layers: layersClaiming(file, policy) }))
        .filter((entry) => entry.layers.length > 1);
}

function nestedPair(first: string, second: string): NestedPrefixes[] {
    if (matchesPrefix(second, first)) {
        return [{ ancestor: first, descendant: second }];
    }
    if (matchesPrefix(first, second)) {
        return [{ ancestor: second, descendant: first }];
    }
    return [];
}

/**
 * Every pair of prefixes where one is the other or sits inside it. Coach
 * rejects only adjacent pairs in sorted order, so this compares all pairs.
 */
export function findNestedPrefixes(policy: LayerPolicy): NestedPrefixes[] {
    const prefixes = policy.layers.flatMap((layer) => layer.prefixes);
    return prefixes.flatMap((first, index) =>
        prefixes
            .slice(index + 1)
            .flatMap((second) => nestedPair(first, second)),
    );
}

export interface StalePrefix {
    readonly layer: string;
    readonly prefix: string;
}

/**
 * Prefixes that no file falls under, usually left behind by a rename. They
 * claim nothing, and the files that moved are no longer mapped.
 */
export function findStalePrefixes(
    files: readonly string[],
    policy: LayerPolicy,
): StalePrefix[] {
    return policy.layers.flatMap((layer) =>
        layer.prefixes
            .filter(
                (prefix) => !files.some((file) => matchesPrefix(file, prefix)),
            )
            .map((prefix) => ({ layer: layer.name, prefix })),
    );
}
