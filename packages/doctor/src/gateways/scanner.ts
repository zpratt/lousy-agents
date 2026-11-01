import { realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { listDirectoryWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import { resolveRealPathWithinRoot } from "@lousy-agents/core/gateways/real-path-within-root.js";
import type { InventoryRecord } from "../entities/edge-types.js";
import type { EdgeResolutionContext } from "./edge-resolution.js";
import {
    buildFileInventoryRecords,
    markReferencedRecords,
    mcpServerRecords,
} from "./inventory-records.js";
import { enumerateMcpServers } from "./mcp-config.js";

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

function isScannableFile(name: string): boolean {
    if (SCANNABLE_EXTENSIONLESS.has(name)) return true;
    const dot = name.lastIndexOf(".");
    if (dot === -1) return false;
    return SCANNABLE_EXTENSIONS.has(name.slice(dot));
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

    const edgeContext: EdgeResolutionContext = {
        repoRoot: absRoot,
        rootReal,
        existingAbsPaths: new Set(allFiles.map((f) => f.absPath)),
    };

    const fileRecords = await buildFileInventoryRecords(allFiles, edgeContext);
    const mcpServers = await enumerateMcpServers(absRoot);

    return [
        ...markReferencedRecords(fileRecords),
        ...mcpServerRecords(mcpServers),
    ];
}
