/**
 * Gateway for discovering CLI tools and commands from GitHub Actions workflows
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
    type DiscoveredTool,
    determineScriptPhase,
    isScriptMandatory,
} from "../entities/feedback-loop.js";
import { fileExists } from "./file-system-utils.js";

/**
 * Gateway interface for discovering tools from workflows
 */
export interface ToolDiscoveryGateway {
    /**
     * Discovers CLI tools and commands from GitHub Actions workflows
     * @param targetDir The repository root directory
     * @returns Array of discovered tools
     */
    discoverTools(targetDir: string): Promise<DiscoveredTool[]>;
}

/**
 * File system implementation of tool discovery gateway
 */
export class FileSystemToolDiscoveryGateway implements ToolDiscoveryGateway {
    async discoverTools(targetDir: string): Promise<DiscoveredTool[]> {
        const workflowsDir = join(targetDir, ".github", "workflows");

        if (!(await fileExists(workflowsDir))) {
            return [];
        }

        const files = await readdir(workflowsDir);
        const yamlFiles = files.filter(
            (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
        );

        const allTools: DiscoveredTool[] = [];

        for (const file of yamlFiles) {
            const filePath = join(workflowsDir, file);
            try {
                const content = await readFile(filePath, "utf-8");
                const workflow = parseYaml(content);
                const tools = this.extractToolsFromWorkflow(workflow, file);
                allTools.push(...tools);
            } catch {
                // Skip files that can't be parsed as valid YAML
            }
        }

        return this.deduplicateTools(allTools);
    }

    private extractToolsFromWorkflow(
        workflow: unknown,
        sourceFile: string,
    ): DiscoveredTool[] {
        const tools: DiscoveredTool[] = [];

        if (!workflow || typeof workflow !== "object") {
            return tools;
        }

        const jobs = (workflow as Record<string, unknown>).jobs;
        if (!jobs || typeof jobs !== "object") {
            return tools;
        }

        for (const job of Object.values(jobs as Record<string, unknown>)) {
            if (!job || typeof job !== "object") {
                continue;
            }

            const steps = (job as Record<string, unknown>).steps;
            if (!Array.isArray(steps)) {
                continue;
            }

            for (const step of steps) {
                if (!step || typeof step !== "object") {
                    continue;
                }

                const stepObj = step as Record<string, unknown>;
                const run = stepObj.run;

                if (typeof run === "string") {
                    // Extract tools from run commands
                    const extractedTools = this.extractToolsFromRunCommand(
                        run,
                        sourceFile,
                    );
                    tools.push(...extractedTools);
                }
            }
        }

        return tools;
    }

    private extractToolsFromRunCommand(
        runCommand: string,
        sourceFile: string,
    ): DiscoveredTool[] {
        const tools: DiscoveredTool[] = [];

        // Split by newlines and pipes to handle multi-line and piped commands
        const commands = runCommand
            .split(/\n|\|/)
            .map((c) => c.trim())
            .filter((c) => c.length > 0 && !c.startsWith("#"));

        for (const command of commands) {
            // Extract the base command (first word)
            const parts = command.split(/\s+/);
            const baseCommand = parts[0];

            // Skip shell built-ins and common utilities
            if (this.isShellBuiltin(baseCommand)) {
                continue;
            }

            // Determine tool name and full command
            let toolName = baseCommand;
            let fullCommand = command;

            // Handle special cases like "npm run", "mise run", etc.
            if (parts.length >= 2) {
                if (
                    (baseCommand === "npm" || baseCommand === "mise") &&
                    parts[1] === "run"
                ) {
                    // "npm run test" -> name: "npm run test", full: same
                    toolName = parts.slice(0, 3).join(" ");
                    fullCommand = command;
                }
            }

            const phase = this.determineToolPhase(toolName, fullCommand);
            const isMandatory = isScriptMandatory(phase);

            tools.push({
                name: toolName,
                fullCommand,
                phase,
                isMandatory,
                sourceWorkflow: sourceFile,
            });
        }

        return tools;
    }

    private isShellBuiltin(command: string): boolean {
        const builtins = [
            "cd",
            "echo",
            "mkdir",
            "rm",
            "cp",
            "mv",
            "test",
            "[",
            "if",
            "then",
            "else",
            "fi",
            "for",
            "while",
            "do",
            "done",
            "case",
            "esac",
        ];
        return builtins.includes(command);
    }

    private determineToolPhase(
        toolName: string,
        fullCommand: string,
    ): ReturnType<typeof determineScriptPhase> {
        // Use the same logic as script phase determination
        return determineScriptPhase(toolName, fullCommand);
    }

    private deduplicateTools(tools: DiscoveredTool[]): DiscoveredTool[] {
        const seen = new Map<string, DiscoveredTool>();

        for (const tool of tools) {
            // Use full command as key for deduplication
            const key = tool.fullCommand;
            if (!seen.has(key)) {
                seen.set(key, tool);
            }
        }

        return Array.from(seen.values());
    }
}

/**
 * Creates and returns the default tool discovery gateway
 */
export function createToolDiscoveryGateway(): ToolDiscoveryGateway {
    return new FileSystemToolDiscoveryGateway();
}
