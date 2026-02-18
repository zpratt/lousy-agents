/**
 * MCP tool handler for creating or updating Claude Code Web Environment Setup.
 */

import { join } from "node:path";
import type {
    ClaudeEnvironmentRecommendation,
    ClaudeSetupAction,
    ClaudeSetupResult,
} from "../../entities/claude-setup.js";
import type { DetectedEnvironment } from "../../entities/copilot-setup.js";
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

    // Check if settings changed (normalize JSON for comparison)
    const settingsChanged =
        JSON.stringify(existingSettings, null, 2) !==
        JSON.stringify(mergedSettings, null, 2);

    // Read existing documentation
    const existingDocs = await claudeGateway.readDocumentation(dir);

    // Generate environment setup section
    const setupSection = generateEnvironmentSetupSection(environment, hooks);

    // Merge documentation
    const mergedDocs = mergeClaudeDocumentation(existingDocs, setupSection);

    // Check if documentation changed (normalize for comparison - trim and ensure trailing newline)
    const normalizeDoc = (doc: string | null) =>
        doc ? (doc.trimEnd() + "\n") : null;
    const docsChanged =
        normalizeDoc(existingDocs) !== normalizeDoc(mergedDocs);

    // Determine action before writing
    let action: ClaudeSetupAction;
    if (!settingsChanged && !docsChanged) {
        action = "no_changes_needed";
    } else if (!existingSettings && !existingDocs) {
        action = "created";
    } else {
        action = "updated";
    }

    // Only write if there are changes
    if (settingsChanged) {
        await claudeGateway.writeSettings(dir, mergedSettings);
    }

    if (docsChanged) {
        await claudeGateway.writeDocumentation(dir, mergedDocs);
    }

    const settingsPath = join(dir, ".claude", "settings.json");
    const documentationPath = join(dir, "CLAUDE.md");

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
