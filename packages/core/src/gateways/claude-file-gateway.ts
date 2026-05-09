/**
 * Gateway interface for Claude Code file operations.
 * Handles reading and writing .claude/settings.json and CLAUDE.md files.
 */

import { mkdir, writeFile } from "node:fs/promises";
import type { ClaudeSettings } from "../entities/claude-setup.js";
import {
    pathExistsWithinRoot,
    readTextWithinRoot,
    resolveSafePath,
} from "./file-system-utils.js";

const MAX_CLAUDE_SETTINGS_BYTES = 1_048_576;
const MAX_CLAUDE_DOC_BYTES = 1_048_576;

/**
 * Interface for Claude file gateway
 * Allows for different implementations (file system, mock, etc.)
 */
export interface ClaudeFileGateway {
    /**
     * Reads and parses .claude/settings.json
     * @param targetDir The repository root directory
     * @returns Parsed settings object or null if file doesn't exist
     */
    readSettings(targetDir: string): Promise<ClaudeSettings | null>;

    /**
     * Writes .claude/settings.json
     * @param targetDir The repository root directory
     * @param settings The settings object to write
     */
    writeSettings(targetDir: string, settings: ClaudeSettings): Promise<void>;

    /**
     * Reads CLAUDE.md documentation file
     * @param targetDir The repository root directory
     * @returns File content or null if file doesn't exist
     */
    readDocumentation(targetDir: string): Promise<string | null>;

    /**
     * Writes CLAUDE.md documentation file
     * @param targetDir The repository root directory
     * @param content The documentation content
     */
    writeDocumentation(targetDir: string, content: string): Promise<void>;
}

/**
 * File system implementation of ClaudeFileGateway
 */
export class FileSystemClaudeFileGateway implements ClaudeFileGateway {
    async readSettings(targetDir: string): Promise<ClaudeSettings | null> {
        if (!(await pathExistsWithinRoot(targetDir, ".claude/settings.json"))) {
            return null;
        }

        const content = await readTextWithinRoot(
            targetDir,
            ".claude/settings.json",
            MAX_CLAUDE_SETTINGS_BYTES,
        );
        try {
            return JSON.parse(content) as ClaudeSettings;
        } catch {
            // If JSON parsing fails, treat as if file doesn't exist
            return null;
        }
    }

    async writeSettings(
        targetDir: string,
        settings: ClaudeSettings,
    ): Promise<void> {
        const claudeDir = await resolveSafePath(targetDir, ".claude");
        const settingsPath = await resolveSafePath(
            targetDir,
            ".claude/settings.json",
        );

        // Ensure .claude directory exists
        await mkdir(claudeDir, { recursive: true });

        // Write with 2-space indentation and trailing newline
        const content = `${JSON.stringify(settings, null, 2)}\n`;
        await writeFile(settingsPath, content, "utf-8");
    }

    async readDocumentation(targetDir: string): Promise<string | null> {
        if (!(await pathExistsWithinRoot(targetDir, "CLAUDE.md"))) {
            return null;
        }

        return readTextWithinRoot(targetDir, "CLAUDE.md", MAX_CLAUDE_DOC_BYTES);
    }

    async writeDocumentation(
        targetDir: string,
        content: string,
    ): Promise<void> {
        const docPath = await resolveSafePath(targetDir, "CLAUDE.md");

        // Ensure content has trailing newline
        const normalizedContent = content.endsWith("\n")
            ? content
            : `${content}\n`;

        await writeFile(docPath, normalizedContent, "utf-8");
    }
}

/**
 * Factory function to create a Claude file gateway
 */
export function createClaudeFileGateway(): ClaudeFileGateway {
    return new FileSystemClaudeFileGateway();
}
