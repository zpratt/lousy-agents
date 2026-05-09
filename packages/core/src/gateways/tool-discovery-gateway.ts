/**
 * Gateway for discovering CLI tools and commands from GitHub Actions workflows
 */

import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
    type DiscoveredTool,
    determineScriptPhase,
    isScriptMandatory,
} from "../entities/feedback-loop.js";
import type { ToolDiscoveryGateway } from "../use-cases/discover-feedback-loops.js";
import {
    listDirectoryWithinRoot,
    pathExistsWithinRoot,
    readTextWithinRoot,
} from "./file-system-utils.js";

export type { ToolDiscoveryGateway };

const MAX_WORKFLOW_FILE_BYTES = 1_048_576;

/**
 * File system implementation of tool discovery gateway
 */
export class FileSystemToolDiscoveryGateway implements ToolDiscoveryGateway {
    async discoverTools(targetDir: string): Promise<DiscoveredTool[]> {
        const workflowsDir = join(".github", "workflows");

        if (!(await pathExistsWithinRoot(targetDir, workflowsDir))) {
            return [];
        }

        const files = await listDirectoryWithinRoot(targetDir, workflowsDir);
        const yamlFiles = files.filter(
            (f) =>
                f.isFile() &&
                (f.name.endsWith(".yml") || f.name.endsWith(".yaml")),
        );

        const allTools: DiscoveredTool[] = [];

        for (const file of yamlFiles) {
            const filePath = join(workflowsDir, file.name);
            try {
                const content = await readTextWithinRoot(
                    targetDir,
                    filePath,
                    MAX_WORKFLOW_FILE_BYTES,
                );
                const workflow = parseYaml(content);
                const tools = this.extractToolsFromWorkflow(
                    workflow,
                    file.name,
                );
                allTools.push(...tools);
            } catch {}
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

        const commands = runCommand
            .split(/\n|\s\|\s/)
            .map((c) => c.trim())
            .filter((c) => c.length > 0 && !c.startsWith("#"));

        for (const command of commands) {
            const parts = command.split(/\s+/);
            const baseCommand = parts[0];

            if (this.isShellBuiltin(baseCommand)) {
                continue;
            }

            let toolName: string;
            const fullCommand = command;

            if (
                parts.length >= 2 &&
                (baseCommand === "npm" || baseCommand === "mise") &&
                parts[1] === "run"
            ) {
                if (parts.length >= 3 && parts[2]) {
                    toolName = parts.slice(0, 3).join(" ");
                } else {
                    toolName = parts.slice(0, 2).join(" ");
                }
            } else if (parts.length >= 2) {
                toolName = parts.slice(0, 2).join(" ");
            } else {
                toolName = baseCommand;
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
        return determineScriptPhase(toolName, fullCommand);
    }

    private deduplicateTools(tools: DiscoveredTool[]): DiscoveredTool[] {
        const seen = new Map<string, DiscoveredTool>();

        for (const tool of tools) {
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
