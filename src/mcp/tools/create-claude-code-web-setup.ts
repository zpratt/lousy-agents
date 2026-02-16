/**
 * MCP tool handler for creating or updating Claude Code Web Environment Setup.
 */

import { join } from "node:path";
import type {
    ClaudeSetupAction,
    ClaudeSetupResult,
} from "../../entities/claude-setup.js";
import {
    createClaudeFileGateway,
    createEnvironmentGateway,
    fileExists,
} from "../../gateways/index.js";
import {
    buildSessionStartHooks,
    generateEnvironmentSetupSection,
    mergeClaudeDocumentation,
    mergeClaudeSettings,
} from "../../use-cases/claude-setup.js";
import {
    errorResponse,
    successResponse,
    type ToolArgs,
    type ToolHandler,
    type ToolResult,
} from "./types.js";

/**
 * Creates or updates Claude Code web environment setup files.
 */
export const createClaudeCodeWebSetupHandler: ToolHandler = async (
    args: ToolArgs,
) => {
    const dir = args.targetDir || process.cwd();

    if (!(await fileExists(dir))) {
        return errorResponse(`Target directory does not exist: ${dir}`);
    }

    const environmentGateway = createEnvironmentGateway();
    const claudeGateway = createClaudeFileGateway();

    // Detect environment configuration
    const environment = await environmentGateway.detectEnvironment(dir);

    // Build SessionStart hooks from environment
    const hooks = await buildSessionStartHooks(environment);

    // Read existing settings
    const existingSettings = await claudeGateway.readSettings(dir);

    // Merge settings
    const mergedSettings = mergeClaudeSettings(existingSettings, hooks);

    // Write settings
    await claudeGateway.writeSettings(dir, mergedSettings);
    const settingsPath = join(dir, ".claude", "settings.json");

    // Read existing documentation
    const existingDocs = await claudeGateway.readDocumentation(dir);

    // Generate environment setup section
    const setupSection = generateEnvironmentSetupSection(environment, hooks);

    // Merge documentation
    const mergedDocs = mergeClaudeDocumentation(existingDocs, setupSection);

    // Write documentation
    await claudeGateway.writeDocumentation(dir, mergedDocs);
    const documentationPath = join(dir, "CLAUDE.md");

    // Determine action taken
    const action: ClaudeSetupAction =
        !existingSettings && !existingDocs
            ? "created"
            : existingSettings || existingDocs
              ? "updated"
              : "no_changes_needed";

    // Build result
    const result: ClaudeSetupResult = {
        hooks,
        environment,
        settingsPath,
        documentationPath,
        action,
        recommendations: buildRecommendations(environment),
    };

    // Format message
    const message = buildResultMessage(result);

    return successResponse({
        ...result,
        message,
        // Make hooks serializable for JSON response
        hooks: hooks.map((h) => ({
            command: h.command,
            description: h.description,
        })),
    });
};

/**
 * Builds recommendations for UI-level environment configuration.
 */
function buildRecommendations(
    environment: ReturnType<typeof environmentGateway.detectEnvironment>,
) {
    const recommendations = [];

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

// Make environmentGateway available for type extraction
const environmentGateway = createEnvironmentGateway();
