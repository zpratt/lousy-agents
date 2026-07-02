import { realpath, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import {
    listDirectoryWithinRoot,
    readTextWithinRoot,
} from "@lousy-agents/core/gateways/file-system-utils.js";
import type {
    ConstructType,
    Edge,
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
    if (
        relPath.startsWith(".agents/skills/") ||
        relPath.startsWith(".pi/skills/") ||
        relPath.startsWith(".pi/prompts/")
    ) {
        return "skill";
    }
    if (relPath.startsWith(".codex-plugin/")) {
        return "plugin";
    }
    if (relPath.startsWith(".claude/hooks/")) {
        return "hook";
    }
    if (relPath.startsWith(".claude/agents/")) {
        return "subagent";
    }
    if (relPath.startsWith(".claude/commands/")) {
        return "agent";
    }
    return "instruction";
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

function resolveEdge(
    rawTarget: string,
    type: "hard-import" | "soft-reference" | "glob-binding",
    sourceAbsPath: string,
    repoRoot: string,
    existingAbsPaths: Set<string>,
): Edge {
    const from = relative(repoRoot, sourceAbsPath).replace(/\\/g, "/");

    if (type === "glob-binding") {
        return {
            type,
            direction: { from, to: rawTarget },
            target: rawTarget,
            malformed: false,
        };
    }

    const sourceDir = dirname(sourceAbsPath);
    const resolvedAbs = resolve(sourceDir, rawTarget);
    const absoluteRoot = resolve(repoRoot);

    const isWithinRoot =
        resolvedAbs === absoluteRoot ||
        resolvedAbs.startsWith(`${absoluteRoot}${sep}`);

    if (!isWithinRoot) {
        return {
            type,
            direction: { from, to: rawTarget },
            target: rawTarget,
            malformed: true,
            reason: "path-traversal",
        };
    }

    const relativeTarget = relative(absoluteRoot, resolvedAbs).replace(
        /\\/g,
        "/",
    );

    if (!existingAbsPaths.has(resolvedAbs)) {
        return {
            type,
            direction: { from, to: relativeTarget },
            target: relativeTarget,
            malformed: true,
            reason: "missing-target",
        };
    }

    return {
        type,
        direction: { from, to: relativeTarget },
        target: relativeTarget,
        malformed: false,
    };
}

/**
 * fs-safe's listing/reading rejects symlinks outright, so a symlinked
 * instruction file or directory (e.g. a repo-root AGENTS.md pointing at a
 * canonical doc) is reported as neither a file nor a directory and silently
 * disappears from the scan. Resolve the target ourselves and only follow it
 * when it stays inside the repo root, mirroring the traversal guard already
 * used for edge targets. Stats the already-resolved real path (rather than
 * re-resolving the symlink) so the within-root check and the type check
 * observe the same target, closing the TOCTOU window between the two.
 */
async function resolveSymlink(
    rootReal: string,
    entryAbs: string,
): Promise<{ kind: "file" | "directory"; real: string } | null> {
    try {
        const real = await realpath(entryAbs);
        const isWithinRoot =
            real === rootReal || real.startsWith(`${rootReal}${sep}`);
        if (!isWithinRoot) return null;

        const targetStat = await stat(real);
        if (targetStat.isDirectory()) return { kind: "directory", real };
        if (targetStat.isFile()) return { kind: "file", real };
        return null;
    } catch {
        return null;
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
            ? await resolveSymlink(rootReal, listEntryAbs)
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

    const records: InventoryRecord[] = rawRecords.map(
        ({ absPath, relPath, harness, content }) => {
            const edges: Edge[] = [];

            if (content !== null) {
                const rawEdges = parseRawEdges(content);
                for (const raw of rawEdges) {
                    edges.push(
                        resolveEdge(
                            raw.rawTarget,
                            raw.type,
                            absPath,
                            absRoot,
                            existingAbsPaths,
                        ),
                    );
                }
            }

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
        },
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
