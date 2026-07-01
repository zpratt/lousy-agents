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

async function collectFiles(
    repoRoot: string,
    relDir: string,
    collected: Array<{ absPath: string; relPath: string }>,
    depth = 0,
): Promise<void> {
    if (depth > 10) return;

    let entries: Awaited<ReturnType<typeof listDirectoryWithinRoot>>;
    try {
        entries = await listDirectoryWithinRoot(repoRoot, relDir);
    } catch {
        return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        const entryAbs = resolve(repoRoot, entryRel);

        if (entry.isDirectory()) {
            if (
                entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === "dist"
            ) {
                continue;
            }
            await collectFiles(repoRoot, entryRel, collected, depth + 1);
        } else if (entry.isFile() && isScannableFile(entry.name)) {
            collected.push({ absPath: entryAbs, relPath: entryRel });
        }
    }
}

export async function scanRepository(
    repoRoot: string,
): Promise<InventoryRecord[]> {
    const absRoot = resolve(repoRoot);

    const allFiles: Array<{ absPath: string; relPath: string }> = [];
    await collectFiles(absRoot, "", allFiles);

    const existingAbsPaths = new Set(allFiles.map((f) => f.absPath));

    const rawRecords: Array<{
        absPath: string;
        relPath: string;
        harness: HarnessName;
        content: string | null;
    }> = [];

    for (const { absPath, relPath } of allFiles) {
        const harness = determineHarness(relPath);
        if (harness === null) continue;

        let content: string | null = null;
        if (isMarkdownFile(relPath)) {
            try {
                content = await readTextWithinRoot(
                    absRoot,
                    relPath,
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
