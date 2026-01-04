import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { consola } from "consola";

/**
 * Represents a file to be created in the filesystem
 */
export interface FileNode {
    type: "file";
    path: string;
    content: string;
}

/**
 * Represents a directory to be created in the filesystem
 */
export interface DirectoryNode {
    type: "directory";
    path: string;
}

/**
 * Union type for filesystem nodes
 */
export type FilesystemNode = FileNode | DirectoryNode;

/**
 * Declarative filesystem structure definition
 */
export interface FilesystemStructure {
    nodes: FilesystemNode[];
}

/**
 * Checks if a file or directory exists
 */
export async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Creates the filesystem structure defined by the given structure definition
 * Preserves existing files and directories without modification
 * Automatically creates parent directories for files
 * @param structure The declarative filesystem structure to create
 * @param targetDir The base directory where the structure should be created
 */
export async function createFilesystemStructure(
    structure: FilesystemStructure,
    targetDir: string,
): Promise<void> {
    for (const node of structure.nodes) {
        const fullPath = join(targetDir, node.path);

        // Skip if already exists to preserve existing files/directories
        if (await fileExists(fullPath)) {
            consola.debug(`Skipping existing: ${fullPath}`);
            continue;
        }

        if (node.type === "directory") {
            await mkdir(fullPath, { recursive: true });
            consola.debug(`Created directory: ${fullPath}`);
        } else if (node.type === "file") {
            // Create parent directories if they don't exist
            const dir = dirname(fullPath);
            await mkdir(dir, { recursive: true });
            await writeFile(fullPath, node.content, "utf-8");
            consola.debug(`Created file: ${fullPath}`);
        }
    }
}
