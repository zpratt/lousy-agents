import { readTextWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import { primaryConstructTypeForPath } from "@lousy-agents/core/lib/agentic-location-matchers.js";
import type {
    ConstructType,
    HarnessName,
    InventoryRecord,
} from "../entities/edge-types.js";
import {
    HARNESS_FOOTPRINTS,
    HARNESS_NAMES,
    matchesPrimaryIndicator,
} from "../entities/harness-footprints.js";
import { parseRawEdges } from "../lib/edge-parser.js";
import { type EdgeResolutionContext, resolveEdge } from "./edge-resolution.js";
import type { McpServerRecord } from "./mcp-config.js";

const MAX_FILE_BYTES = 1_048_576;

const ALL_HARNESS_NAMES: readonly HarnessName[] = [...HARNESS_NAMES, "shared"];

/**
 * A file discovered by the repository walk. `readRoot`/`readRelPath` locate
 * the symlink-free path to read content from; `relPath`/`absPath` give the
 * file's logical identity in the repository.
 */
export interface InventorySourceFile {
    readonly absPath: string;
    readonly relPath: string;
    readonly readRoot: string;
    readonly readRelPath: string;
}

interface InventorySource {
    readonly file: InventorySourceFile;
    readonly harness: HarnessName;
    readonly content: string | null;
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

/**
 * Reads a markdown file's content. Non-markdown files and files that cannot
 * be read safely have no content, and so contribute no edges.
 */
async function readMarkdownContent(
    file: InventorySourceFile,
): Promise<string | null> {
    if (!isMarkdownFile(file.relPath)) return null;
    try {
        return await readTextWithinRoot(
            file.readRoot,
            file.readRelPath,
            MAX_FILE_BYTES,
        );
    } catch {
        return null;
    }
}

/** Reads files one at a time, keeping only those that belong to a harness. */
async function readInventorySources(
    files: readonly InventorySourceFile[],
): Promise<InventorySource[]> {
    const sources: InventorySource[] = [];

    for (const file of files) {
        const harness = determineHarness(file.relPath);
        if (harness !== null) {
            sources.push({
                file,
                harness,
                content: await readMarkdownContent(file),
            });
        }
    }

    return sources;
}

async function toInventoryRecord(
    { file, harness, content }: InventorySource,
    ctx: EdgeResolutionContext,
): Promise<InventoryRecord> {
    const rawEdges = content === null ? [] : parseRawEdges(content);
    const edges = await Promise.all(
        rawEdges.map((raw) =>
            resolveEdge(raw.rawTarget, raw.type, file.absPath, ctx),
        ),
    );

    return {
        id: `${harness}:${file.relPath}`,
        path: file.relPath,
        harness,
        constructType: determineConstructType(file.relPath),
        loadMechanism: "convention-loaded",
        edges,
    };
}

/**
 * Builds one inventory record per harness-owned file, with its edges
 * resolved. Every record starts out convention-loaded; see
 * markReferencedRecords.
 */
export async function buildFileInventoryRecords(
    files: readonly InventorySourceFile[],
    ctx: EdgeResolutionContext,
): Promise<InventoryRecord[]> {
    const sources = await readInventorySources(files);
    return Promise.all(sources.map((source) => toInventoryRecord(source, ctx)));
}

/** Paths that some well-formed hard-import or soft-reference edge points to. */
function referencedPaths(records: readonly InventoryRecord[]): Set<string> {
    return new Set(
        records
            .flatMap((record) => record.edges)
            .flatMap((edge) =>
                !edge.malformed &&
                edge.type !== "glob-binding" &&
                typeof edge.direction.to === "string"
                    ? [edge.direction.to]
                    : [],
            ),
    );
}

/**
 * Returns the records with `loadMechanism: "referenced"` on every record that
 * another record's well-formed edge points to.
 */
export function markReferencedRecords(
    records: readonly InventoryRecord[],
): InventoryRecord[] {
    const referenced = referencedPaths(records);

    return records.map((record) =>
        referenced.has(record.path)
            ? { ...record, loadMechanism: "referenced" }
            : record,
    );
}

export function mcpServerRecords(
    servers: readonly McpServerRecord[],
): InventoryRecord[] {
    return servers.map((server) => ({
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
    }));
}
