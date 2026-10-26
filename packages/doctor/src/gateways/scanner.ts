import { realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import {
    listDirectoryWithinRoot,
    readTextWithinRoot,
    resolveRealPathWithinRoot,
} from "@lousy-agents/core/gateways/file-system-utils.js";
import { primaryConstructTypeForPath } from "@lousy-agents/core/lib/agentic-location-matchers.js";
import { normalizeRelativeWithinRoot } from "@lousy-agents/core/lib/instruction-import-expand.js";
import type {
    ConstructType,
    Edge,
    EdgeMalformedReason,
    HarnessName,
    InventoryRecord,
} from "../entities/edge-types.js";
import {
    HARNESS_FOOTPRINTS,
    HARNESS_NAMES,
    matchesPrimaryIndicator,
} from "../entities/harness-footprints.js";
import { parseRawEdges } from "../lib/edge-parser.js";
import { enumerateMcpServers } from "./mcp-config.js";

const MAX_FILE_BYTES = 1_048_576;

const SCANNABLE_EXTENSIONS = new Set([
    ".md",
    ".mdc",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
]);

// Extensionless files that are known harness convention artifacts
const SCANNABLE_EXTENSIONLESS = new Set([".cursorrules"]);

const ALL_HARNESS_NAMES: readonly HarnessName[] = [...HARNESS_NAMES, "shared"];

function isScannableFile(name: string): boolean {
    if (SCANNABLE_EXTENSIONLESS.has(name)) return true;
    const dot = name.lastIndexOf(".");
    if (dot === -1) return false;
    return SCANNABLE_EXTENSIONS.has(name.slice(dot));
}

function isMarkdownFile(name: string): boolean {
    return name.endsWith(".md") || name.endsWith(".mdc");
}

function determineConstructType(relPath: string): ConstructType {
    return primaryConstructTypeForPath(relPath) ?? "instruction";
}

function determineHarness(repoRelativePath: string): HarnessName | null {
    const matching = ALL_HARNESS_NAMES.filter((harness) =>
        matchesPrimaryIndicator(
            repoRelativePath,
            HARNESS_FOOTPRINTS[harness].primaryIndicators,
        ),
    );
    if (matching.length === 0) return null;
    if (matching.length >= 2) return "shared";
    return matching[0];
}

interface EdgeResolutionContext {
    readonly repoRoot: string;
    readonly rootReal: string;
    readonly existingAbsPaths: Set<string>;
}

function malformedEdge(
    type: Edge["type"],
    from: string,
    target: string,
    reason: EdgeMalformedReason,
): Edge {
    return {
        type,
        direction: { from, to: target },
        target,
        malformed: true,
        reason,
    };
}

function wellFormedEdge(
    type: Edge["type"],
    from: string,
    target: string,
): Edge {
    return {
        type,
        direction: { from, to: target },
        target,
        malformed: false,
    };
}

const HARD_IMPORT_REASON_BY_STATUS: Partial<
    Record<string, EdgeMalformedReason>
> = {
    home: "home",
    absolute: "absolute",
    escape: "path-traversal",
};

/**
 * Resolves a Claude `@path` import with the same target rules as core import
 * expansion: home-directory, absolute, and escaping targets are rejected, and
 * any regular file inside the repository (not only scannable files) resolves.
 */
async function resolveHardImportEdge(
    rawTarget: string,
    from: string,
    ctx: EdgeResolutionContext,
): Promise<Edge> {
    const normalized = normalizeRelativeWithinRoot(from, rawTarget);
    if (!normalized.ok) {
        return malformedEdge(
            "hard-import",
            from,
            rawTarget,
            HARD_IMPORT_REASON_BY_STATUS[normalized.status] ?? "missing-target",
        );
    }

    const targetAbs = resolve(ctx.repoRoot, normalized.relativePath);
    const exists =
        ctx.existingAbsPaths.has(targetAbs) ||
        (await resolveRealPathWithinRoot(ctx.rootReal, targetAbs))?.kind ===
            "file";

    return exists
        ? wellFormedEdge("hard-import", from, normalized.relativePath)
        : malformedEdge(
              "hard-import",
              from,
              normalized.relativePath,
              "missing-target",
          );
}

function resolveSoftReferenceEdge(
    rawTarget: string,
    sourceAbsPath: string,
    from: string,
    ctx: EdgeResolutionContext,
): Edge {
    const resolvedAbs = resolve(dirname(sourceAbsPath), rawTarget);
    const absoluteRoot = resolve(ctx.repoRoot);

    const isWithinRoot =
        resolvedAbs === absoluteRoot ||
        resolvedAbs.startsWith(`${absoluteRoot}${sep}`);

    if (!isWithinRoot) {
        return malformedEdge(
            "soft-reference",
            from,
            rawTarget,
            "path-traversal",
        );
    }

    const relativeTarget = relative(absoluteRoot, resolvedAbs).replace(
        /\\/g,
        "/",
    );

    return ctx.existingAbsPaths.has(resolvedAbs)
        ? wellFormedEdge("soft-reference", from, relativeTarget)
        : malformedEdge(
              "soft-reference",
              from,
              relativeTarget,
              "missing-target",
          );
}

async function resolveEdge(
    rawTarget: string,
    type: Edge["type"],
    sourceAbsPath: string,
    ctx: EdgeResolutionContext,
): Promise<Edge> {
    const from = relative(ctx.repoRoot, sourceAbsPath).replace(/\\/g, "/");

    switch (type) {
        case "glob-binding":
            return wellFormedEdge(type, from, rawTarget);
        case "hard-import":
            return resolveHardImportEdge(rawTarget, from, ctx);
        case "soft-reference":
            return resolveSoftReferenceEdge(
                rawTarget,
                sourceAbsPath,
                from,
                ctx,
            );
    }
}

interface CollectedFile {
    absPath: string;
    relPath: string;
    readRoot: string;
    readRelPath: string;
}

/**
 * Walks the repo tree, tracking two coordinate systems in parallel:
 *  - (listRoot, listRelDir): where fs-safe should actually list/read from.
 *    This starts at topRepoRoot but re-roots to rootReal + a real relative
 *    path once the walk crosses a symlinked directory, since fs-safe cannot
 *    list a path that is itself a symlink.
 *  - logicalPrefix: the repo-root-relative path as it appears in the tree,
 *    used for InventoryRecord.path/absPath so a file's identity reflects
 *    where it's *referenced from*, not where the symlink target physically
 *    lives.
 *
 * fs-safe's listing/reading rejects symlinks outright, so a symlinked
 * instruction file or directory (e.g. a repo-root AGENTS.md pointing at a
 * canonical doc) would silently disappear from the scan. Symlinks are
 * followed with the shared core policy (resolveRealPathWithinRoot), which
 * core instruction discovery also uses: only targets that stay inside the
 * repo root are followed.
 */
async function collectFiles(
    listRoot: string,
    listRelDir: string,
    logicalPrefix: string,
    topRepoRoot: string,
    rootReal: string,
    collected: CollectedFile[],
    depth = 0,
): Promise<void> {
    if (depth > 10) return;

    let entries: Awaited<ReturnType<typeof listDirectoryWithinRoot>>;
    try {
        entries = await listDirectoryWithinRoot(listRoot, listRelDir);
    } catch {
        return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const listEntryRel = listRelDir
            ? `${listRelDir}/${entry.name}`
            : entry.name;
        const logicalRel = logicalPrefix
            ? `${logicalPrefix}/${entry.name}`
            : entry.name;
        const listEntryAbs = resolve(listRoot, listEntryRel);

        const isDirectory = entry.isDirectory();
        const isFile = entry.isFile();
        const symlink = entry.isSymbolicLink()
            ? await resolveRealPathWithinRoot(rootReal, listEntryAbs)
            : null;

        if (isDirectory || symlink?.kind === "directory") {
            if (
                entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === "dist"
            ) {
                continue;
            }
            if (symlink?.kind === "directory") {
                // Re-root the walk at rootReal so the symlinked directory
                // (and anything beneath it) is listed via its real,
                // symlink-free path — fs-safe rejects listing a path that
                // is itself a symlink.
                await collectFiles(
                    rootReal,
                    relative(rootReal, symlink.real),
                    logicalRel,
                    topRepoRoot,
                    rootReal,
                    collected,
                    depth + 1,
                );
            } else {
                await collectFiles(
                    listRoot,
                    listEntryRel,
                    logicalRel,
                    topRepoRoot,
                    rootReal,
                    collected,
                    depth + 1,
                );
            }
        } else if (
            (isFile || symlink?.kind === "file") &&
            isScannableFile(entry.name)
        ) {
            collected.push({
                absPath: resolve(topRepoRoot, logicalRel),
                relPath: logicalRel,
                readRoot: symlink?.kind === "file" ? rootReal : listRoot,
                readRelPath:
                    symlink?.kind === "file"
                        ? relative(rootReal, symlink.real)
                        : listEntryRel,
            });
        }
    }
}

export async function scanRepository(
    repoRoot: string,
): Promise<InventoryRecord[]> {
    const absRoot = resolve(repoRoot);
    const rootReal = await realpath(absRoot);

    const allFiles: CollectedFile[] = [];
    await collectFiles(absRoot, "", "", absRoot, rootReal, allFiles);

    const existingAbsPaths = new Set(allFiles.map((f) => f.absPath));

    const rawRecords: Array<{
        absPath: string;
        relPath: string;
        harness: HarnessName;
        content: string | null;
    }> = [];

    for (const { absPath, relPath, readRoot, readRelPath } of allFiles) {
        const harness = determineHarness(relPath);
        if (harness === null) continue;

        let content: string | null = null;
        if (isMarkdownFile(relPath)) {
            try {
                content = await readTextWithinRoot(
                    readRoot,
                    readRelPath,
                    MAX_FILE_BYTES,
                );
            } catch {
                content = null;
            }
        }

        rawRecords.push({ absPath, relPath, harness, content });
    }

    const edgeContext: EdgeResolutionContext = {
        repoRoot: absRoot,
        rootReal,
        existingAbsPaths,
    };

    const records: InventoryRecord[] = await Promise.all(
        rawRecords.map(async ({ absPath, relPath, harness, content }) => {
            const edges: Edge[] =
                content === null
                    ? []
                    : await Promise.all(
                          parseRawEdges(content).map((raw) =>
                              resolveEdge(
                                  raw.rawTarget,
                                  raw.type,
                                  absPath,
                                  edgeContext,
                              ),
                          ),
                      );

            const id =
                harness === "shared"
                    ? `shared:${relPath}`
                    : `${harness}:${relPath}`;

            return {
                id,
                path: relPath,
                harness,
                constructType: determineConstructType(relPath),
                loadMechanism: "convention-loaded" as const,
                edges,
            };
        }),
    );

    const referencedPaths = new Set<string>();
    for (const record of records) {
        for (const edge of record.edges) {
            if (
                !edge.malformed &&
                edge.type !== "glob-binding" &&
                typeof edge.direction.to === "string"
            ) {
                referencedPaths.add(edge.direction.to);
            }
        }
    }

    for (const record of records) {
        if (referencedPaths.has(record.path)) {
            (
                record as { loadMechanism: "referenced" | "convention-loaded" }
            ).loadMechanism = "referenced";
        }
    }

    const mcpServers = await enumerateMcpServers(absRoot);
    for (const server of mcpServers) {
        records.push({
            id: `mcp-server:${server.path}#${server.serverName}`,
            path: server.path,
            harness: server.harness,
            constructType: "mcp-server",
            loadMechanism: "convention-loaded",
            edges: [],
            serverName: server.serverName,
            ...(server.transport !== undefined
                ? { transport: server.transport }
                : {}),
        });
    }

    return records;
}
