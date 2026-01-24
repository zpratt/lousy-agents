import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { consola } from "consola";
import { Eta } from "eta";

/**
 * Template context for processing template variables in file content
 */
export interface TemplateContext {
    projectName: string;
}

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
 * Processes template content using Eta templating engine
 * @param content The template content to process
 * @param context The template context with values to substitute
 * @returns The processed content with template variables replaced
 */
function processTemplate(content: string, context: TemplateContext): string {
    const eta = new Eta();
    try {
        return eta.renderString(content, context);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Template processing failed: ${message}`);
    }
}

/**
 * Creates the filesystem structure defined by the given structure definition
 * Preserves existing files and directories without modification
 * Automatically creates parent directories for files
 * @param structure The declarative filesystem structure to create
 * @param targetDir The base directory where the structure should be created
 * @param templateContext Optional context for processing template variables in file content
 */
export async function createFilesystemStructure(
    structure: FilesystemStructure,
    targetDir: string,
    templateContext?: TemplateContext,
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

            // Process template if context is provided
            const content = templateContext
                ? processTemplate(node.content, templateContext)
                : node.content;

            await writeFile(fullPath, content, "utf-8");
            consola.debug(`Created file: ${fullPath}`);
        }
    }
}
