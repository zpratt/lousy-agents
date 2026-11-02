import { readTextWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import type { FileIdentity } from "@lousy-agents/core/gateways/read-regular-file-no-follow.js";
import {
    isExcludedBySuffix,
    primaryConstructTypeForPath,
} from "@lousy-agents/core/lib/agentic-location-matchers.js";
import { DEFAULT_MAX_FILE_BYTES } from "@lousy-agents/core/lib/instruction-import-expand.js";
import type {
    ConstructType,
    Edge,
    HarnessName,
    InventoryRecord,
} from "../entities/edge-types.js";
import { determineHarness } from "../entities/harness-footprints.js";
import { parseRawEdges } from "../lib/edge-parser.js";
import { type EdgeResolutionContext, resolveEdge } from "./edge-resolution.js";
import type { McpServerRecord } from "./mcp-config.js";

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
    /** Identity of the real file, so aliases of one file are read once */
    readonly identity: FileIdentity;
}

/** Reads a file's markdown content, or null when it has none to read. */
export type ReadMarkdownContent = (
    file: InventorySourceFile,
) => Promise<string | null>;

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
            DEFAULT_MAX_FILE_BYTES,
        );
    } catch {
        return null;
    }
}

/**
 * Reads each real file once. Doctor lists every logical location of a file,
 * so the same real file can be reached through several paths; its records
 * stay distinct but its content is read a single time per scan.
 */
function readOncePerRealFile(read: ReadMarkdownContent): ReadMarkdownContent {
    const pending = new Map<string, Promise<string | null>>();
    return (file) => {
        // Whether a path is markdown is decided per logical path, so a file
        // reached as both foo.json and bar.md is read for one and not the other.
        const key = `${file.identity.dev}:${file.identity.ino}:${isMarkdownFile(file.relPath)}`;
        const started = pending.get(key) ?? read(file);
        pending.set(key, started);
        return started;
    };
}

/**
 * The harness that loads a file, or null when none does. A file under a
 * harness's directory is not loaded when the catalog says that directory
 * accepts only files with a suffix the file lacks.
 */
function ownerOf(relPath: string): HarnessName | null {
    return isExcludedBySuffix(relPath) ? null : determineHarness(relPath);
}

/** Reads files one at a time, keeping only those that belong to a harness. */
async function readInventorySources(
    files: readonly InventorySourceFile[],
    readContent: ReadMarkdownContent,
): Promise<InventorySource[]> {
    const sources: InventorySource[] = [];

    for (const file of files) {
        const harness = ownerOf(file.relPath);
        if (harness !== null) {
            sources.push({
                file,
                harness,
                content: await readContent(file),
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
    const resolved = await Promise.all(
        rawEdges.map((raw) =>
            resolveEdge(raw, file.absPath, file.readRelPath, ctx),
        ),
    );
    const edges = resolved.filter((edge): edge is Edge => edge !== null);

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
 * markReferencedRecords in the entities layer.
 */
export async function buildFileInventoryRecords(
    files: readonly InventorySourceFile[],
    ctx: EdgeResolutionContext,
    readContent: ReadMarkdownContent = readMarkdownContent,
): Promise<InventoryRecord[]> {
    const sources = await readInventorySources(
        files,
        readOncePerRealFile(readContent),
    );
    return Promise.all(sources.map((source) => toInventoryRecord(source, ctx)));
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
