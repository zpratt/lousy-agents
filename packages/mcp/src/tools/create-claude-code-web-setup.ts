/**
 * MCP tool handler for creating or updating Claude Code Web Environment Setup.
 */

import { join } from "node:path";
import type {
    ClaudeEnvironmentRecommendation,
    ClaudeSetupAction,
    ClaudeSetupResult,
} from "@lousy-agents/core/entities/claude-setup.js";
import type { DetectedEnvironment } from "@lousy-agents/core/entities/copilot-setup.js";
import {
    createClaudeFileGateway,
    createEnvironmentGateway,
    fileExists,
} from "@lousy-agents/core/gateways/index.js";
import { loadCopilotSetupConfig } from "@lousy-agents/core/lib/copilot-setup-config.js";
import {
    buildSessionStartHooks,
    generateEnvironmentSetupSection,
    mergeClaudeDocumentation,
    mergeClaudeSettings,
} from "@lousy-agents/core/use-cases/claude-setup.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
} from "./types.js";

/**
 * Creates or updates Claude Code web environment setup files.
 */
export const createClaudeCodeWebSetupHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    try {
        const dir = args.targetDir || process.cwd();

        if (!(await fileExists(dir))) {
            return errorResponse(`Target directory does not exist: ${dir}`);
        }

        const environmentGateway = createEnvironmentGateway();
        const claudeGateway = createClaudeFileGateway();

        const environment = await environmentGateway.detectEnvironment(dir);
        const copilotSetupConfig = await loadCopilotSetupConfig(dir);

        const hooks = await buildSessionStartHooks(
            environment,
            copilotSetupConfig,
        );

        const existingSettings = await claudeGateway.readSettings(dir);

        const mergedSettings = mergeClaudeSettings(existingSettings, hooks);

        const settingsChanged =
            JSON.stringify(existingSettings, null, 2) !==
            JSON.stringify(mergedSettings, null, 2);

        const existingDocs = await claudeGateway.readDocumentation(dir);

        const setupSection = generateEnvironmentSetupSection(
            environment,
            hooks,
        );

        const mergedDocs = mergeClaudeDocumentation(existingDocs, setupSection);

        const normalizeDoc = (doc: string | null) =>
            doc ? `${doc.trimEnd()}\n` : null;
        const docsChanged =
            normalizeDoc(existingDocs) !== normalizeDoc(mergedDocs);

        let action: ClaudeSetupAction;
        if (!settingsChanged && !docsChanged) {
            action = "no_changes_needed";
        } else if (!existingSettings && !existingDocs) {
            action = "created";
        } else {
            action = "updated";
        }

        if (settingsChanged) {
            await claudeGateway.writeSettings(dir, mergedSettings);
        }

        if (docsChanged) {
            await claudeGateway.writeDocumentation(dir, mergedDocs);
        }

        const settingsPath = join(dir, ".claude", "settings.json");
        const documentationPath = join(dir, "CLAUDE.md");

        const result: ClaudeSetupResult = {
            hooks,
            environment,
            settingsPath,
            documentationPath,
            action,
            recommendations: buildRecommendations(environment),
        };

        const message = buildResultMessage(result);

        return successResponse({
            ...result,
            message,
            hooks: hooks.map((h) => ({
                command: h.command,
                description: h.description,
            })),
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return errorResponse(`Failed to create Claude Code setup: ${message}`);
    }
};

/**
 * Builds recommendations for UI-level environment configuration.
 */
function buildRecommendations(
    environment: DetectedEnvironment,
): ClaudeEnvironmentRecommendation[] | undefined {
    const recommendations: ClaudeEnvironmentRecommendation[] = [];

    // If package managers detected, recommend network access
    if (environment.packageManagers && environment.packageManagers.length > 0) {
        recommendations.push({
            type: "network_access" as const,
            description:
                "Enable internet access in Claude Code environment settings to allow package installation",
        });
    }

    return recommendations.length > 0 ? recommendations : undefined;
}

/**
 * Builds a human-readable result message.
 */
function buildResultMessage(result: ClaudeSetupResult): string {
    const lines: string[] = [];

    if (result.action === "created") {
        lines.push(
            `Created Claude Code environment setup with ${result.hooks.length} SessionStart hook(s)`,
        );
    } else if (result.action === "updated") {
        lines.push(
            `Updated Claude Code environment setup with ${result.hooks.length} SessionStart hook(s)`,
        );
    } else {
        lines.push("No changes needed - environment setup is already current");
    }

    if (result.hooks.length > 0) {
        lines.push("");
        lines.push("SessionStart hooks:");
        for (const hook of result.hooks) {
            lines.push(`  - ${hook.command}`);
            if (hook.description) {
                lines.push(`    ${hook.description}`);
            }
        }
    }

    if (result.recommendations && result.recommendations.length > 0) {
        lines.push("");
        lines.push("Recommendations:");
        for (const rec of result.recommendations) {
            lines.push(`  - ${rec.description}`);
        }
    }

    lines.push("");
    lines.push(`Files: ${result.settingsPath}, ${result.documentationPath}`);

    return lines.join("\n");
}
