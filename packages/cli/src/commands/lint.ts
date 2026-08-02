/**
 * CLI command for linting agent skills, custom agents, and instruction files.
 * Delegates to the lint package facade and handles CLI display concerns.
 */

import type { LintFormatType } from "@lousy-agents/lint";
import { LintValidationError, runLint } from "@lousy-agents/lint";
import type { CommandContext, CommandDef } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { displayFormattedOutputs, sumWarnings } from "./lint-display.js";
import { reportFailure, reportSuccess } from "./lint-report.js";

const VALID_FORMATS = new Set<LintFormatType>(["human", "json", "rdjsonl"]);

function resolveTargetDir(context: CommandContext<LintArgs>): string {
    if (typeof context.data?.targetDir === "string") {
        return context.data.targetDir;
    }
    return process.cwd();
}

function isLessonsSubcommand(rawArgs: string[]): boolean {
    return rawArgs.some(
        (token, idx) => token === "lessons" && rawArgs[idx - 1] !== "--format",
    );
}

function resolveBooleanFlag(
    context: CommandContext<LintArgs>,
    key: keyof LintArgs,
): boolean {
    return context.args?.[key] === true || context.data?.[key] === true;
}

function isLintFormatType(value: string): value is LintFormatType {
    return VALID_FORMATS.has(value as LintFormatType);
}

function readRawFormat(context: CommandContext<LintArgs>): string {
    if (typeof context.args?.format === "string") {
        return context.args.format;
    }
    if (typeof context.data?.format === "string") {
        return context.data.format;
    }
    return "human";
}

function resolveFormat(context: CommandContext<LintArgs>): LintFormatType {
    const rawFormat = readRawFormat(context);
    if (isLintFormatType(rawFormat)) {
        return rawFormat;
    }
    return "human";
}

function resolveLintTargets(context: CommandContext<LintArgs>) {
    return {
        skills: resolveBooleanFlag(context, "skills"),
        agents: resolveBooleanFlag(context, "agents"),
        subagents: resolveBooleanFlag(context, "subagents"),
        hooks: resolveBooleanFlag(context, "hooks"),
        instructions: resolveBooleanFlag(context, "instructions"),
        mcpServers: resolveBooleanFlag(context, "mcpServers"),
    };
}

async function executeLint(context: CommandContext<LintArgs>) {
    try {
        return await runLint({
            directory: resolveTargetDir(context),
            targets: resolveLintTargets(context),
        });
    } catch (error) {
        if (error instanceof LintValidationError) {
            consola.error(`Lint failed: ${error.message}`);
            process.exitCode = 1;
            return null;
        }
        throw error;
    }
}

async function runLintCommand(
    context: CommandContext<LintArgs>,
): Promise<void> {
    if (isLessonsSubcommand(context.rawArgs ?? [])) {
        return;
    }

    const format = resolveFormat(context);
    const result = await executeLint(context);
    if (result === null) {
        return;
    }

    const { outputs, hasErrors } = result;
    const totalWarnings = sumWarnings(outputs);

    displayFormattedOutputs(outputs, format);

    if (hasErrors) {
        reportFailure(outputs, totalWarnings, format);
        return;
    }

    reportSuccess(outputs, totalWarnings, format);
}

/**
 * The `lint` command for validating agent skills, custom agents, and instruction files.
 * Also exposes `lint lessons` as a subcommand for lesson frontmatter validation.
 */
const lintArgs = {
    skills: {
        type: "boolean",
        description:
            "Lint skill frontmatter in .github/skills/ and .claude/skills/",
        default: false,
    },
    agents: {
        type: "boolean",
        description: "Lint custom agent frontmatter in .github/agents/",
        default: false,
    },
    subagents: {
        type: "boolean",
        description:
            "[flag-only, not default-on] Lint Claude Code subagent frontmatter in .claude/agents/",
        default: false,
    },
    hooks: {
        type: "boolean",
        description:
            "Lint pre-tool-use hook configurations in .github/hooks/agent-shell/hooks.json, .claude/settings.json, and .claude/settings.local.json",
        default: false,
    },
    instructions: {
        type: "boolean",
        description:
            "Analyze instruction quality across all instruction file formats",
        default: false,
    },
    mcpServers: {
        type: "boolean",
        description:
            "[flag-only, not default-on] Lint MCP server config files (.mcp.json, .vscode/mcp.json)",
        default: false,
    },
    format: {
        type: "string",
        description: "Output format: human (default), json, or rdjsonl",
        default: "human",
    },
} as const;

type LintArgs = typeof lintArgs;

export function createLintCommand(lintLessonsCmd: CommandDef) {
    return defineCommand({
        meta: {
            name: "lint",
            description:
                "Lint agent skills, custom agents, instruction files, and hook configurations. Validates frontmatter, instruction quality, and hook config schemas. Also supports flag-only (not default-on) subagent and MCP server config linting. Run `lint lessons` to validate lesson files.",
        },
        subCommands: {
            lessons: lintLessonsCmd,
        },
        args: lintArgs,
        run: runLintCommand,
    });
}
