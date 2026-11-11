import { isNestedInstructionFilename } from "@lousy-agents/core/entities/agentic-location-catalog.js";
import { readTextWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import type { FileIdentity } from "@lousy-agents/core/gateways/read-regular-file-no-follow.js";
import {
    isExcludedBySuffix,
    primaryConstructTypeForPath,
} from "@lousy-agents/core/lib/agentic-location-matchers.js";
import {
    DEFAULT_MAX_EDGES,
    DEFAULT_MAX_FILE_BYTES,
} from "@lousy-agents/core/lib/instruction-import-expand.js";
import type {
    ConstructType,
    Edge,
    HarnessName,
    InventoryRecord,
} from "../entities/edge-types.js";
import { determineHarness } from "../entities/harness-footprints.js";
import { parseRawEdges } from "../lib/edge-parser.js";
import { limitHardImports } from "../lib/limit-hard-imports.js";
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

/**
 * Reads a file's markdown content, or null when it has none to read (it is
 * not markdown). It throws when the file cannot be read safely: more than one
 * hard link, over the size cap, a symbolic link swapped in, or refused by the
 * system.
 */
export type ReadMarkdownContent = (
    file: InventorySourceFile,
) => Promise<string | null>;

interface InventorySource {
    readonly file: InventorySourceFile;
    readonly harness: HarnessName;
    readonly content: string | null;
    /** Whether the reader threw, so the file's imports are not in the report */
    readonly unread: boolean;
}

function isMarkdownFile(name: string): boolean {
    return name.endsWith(".md") || name.endsWith(".mdc");
}

function determineConstructType(relPath: string): ConstructType {
    return primaryConstructTypeForPath(relPath) ?? "instruction";
}

/**
 * Reads a markdown file's content. A file that is not markdown has no content
 * and contributes no edges. A markdown file that cannot be read safely throws,
 * so the scan can say it was left out.
 */
async function readMarkdownContent(
    file: InventorySourceFile,
): Promise<string | null> {
    if (!isMarkdownFile(file.relPath)) return null;
    return readTextWithinRoot(
        file.readRoot,
        file.readRelPath,
        DEFAULT_MAX_FILE_BYTES,
    );
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
function fileNameOf(relPath: string): string {
    const normalized = relPath.replaceAll("\\", "/");
    const slash = normalized.lastIndexOf("/");
    return slash === -1 ? normalized : normalized.slice(slash + 1);
}

function ownerOf(relPath: string): HarnessName | null {
    const harness = determineHarness(relPath);
    if (harness === null) {
        return null;
    }
    if (
        isExcludedBySuffix(relPath) &&
        !isNestedInstructionFilename(fileNameOf(relPath))
    ) {
        return null;
    }
    return harness;
}

async function readOrMarkUnread(
    readContent: ReadMarkdownContent,
    file: InventorySourceFile,
): Promise<{ content: string | null; unread: boolean }> {
    try {
        return { content: await readContent(file), unread: false };
    } catch {
        return { content: null, unread: true };
    }
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
                ...(await readOrMarkUnread(readContent, file)),
            });
        }
    }

    return sources;
}

interface BuiltRecord {
    readonly record: InventoryRecord;
    /** Whether `@` imports past the limit were left out of the record */
    readonly importsOverLimit: boolean;
}

async function toInventoryRecord(
    { file, harness, content }: InventorySource,
    ctx: EdgeResolutionContext,
): Promise<BuiltRecord> {
    const parsed = content === null ? [] : parseRawEdges(content);
    const { edges: rawEdges, overLimit } = limitHardImports(
        parsed,
        DEFAULT_MAX_EDGES,
    );
    const resolved = await Promise.all(
        rawEdges.map((raw) =>
            resolveEdge(raw, file.absPath, file.readRelPath, ctx),
        ),
    );
    const edges = resolved.filter((edge): edge is Edge => edge !== null);

    return {
        record: {
            id: `${harness}:${file.relPath}`,
            path: file.relPath,
            harness,
            constructType: determineConstructType(file.relPath),
            loadMechanism: "convention-loaded",
            edges,
        },
        importsOverLimit: overLimit,
    };
}

/**
 * The file inventory, the files whose `@` imports went past the limit, and
 * the files the scan could not read.
 */
export interface FileInventory {
    readonly records: InventoryRecord[];
    readonly filesOverImportLimit: string[];
    readonly unreadFiles: string[];
}

/**
 * Builds one inventory record per harness-owned file, with its edges
 * resolved. At most as many `@` imports per file as lint expands are
 * resolved; the files with more are named. Every record starts out
 * convention-loaded; see markReferencedRecords in the entities layer.
 */
export async function buildFileInventory(
    files: readonly InventorySourceFile[],
    ctx: EdgeResolutionContext,
    readContent: ReadMarkdownContent = readMarkdownContent,
): Promise<FileInventory> {
    const sources = await readInventorySources(
        files,
        readOncePerRealFile(readContent),
    );
    const built = await Promise.all(
        sources.map((source) => toInventoryRecord(source, ctx)),
    );
    return {
        records: built.map(({ record }) => record),
        filesOverImportLimit: built
            .filter(({ importsOverLimit }) => importsOverLimit)
            .map(({ record }) => record.path),
        unreadFiles: sources
            .filter(({ unread }) => unread)
            .map(({ file }) => file.relPath),
    };
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
