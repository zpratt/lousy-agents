/**
 * CLI command for linting agent skills, custom agents, and instruction files.
 * Delegates to the lint package facade and handles CLI display concerns.
 */

import type { LintFormatType, LintOutput } from "@lousy-agents/lint";
import { createFormatter, runLint } from "@lousy-agents/lint";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";

/**
 * Formats and displays a LintOutput using consola.
 */
function displayLintOutput(output: LintOutput, label: string): void {
    if (output.summary.totalFiles === 0) {
        consola.info(`No ${label} found`);
        return;
    }

    consola.info(`Discovered ${output.summary.totalFiles} ${label}`);

    // Group diagnostics by file
    const filesWithDiagnostics = new Set<string>();

    for (const d of output.diagnostics) {
        filesWithDiagnostics.add(d.filePath);
    }

    for (const file of output.filesAnalyzed) {
        if (!filesWithDiagnostics.has(file)) {
            consola.success(`${file}: OK`);
        }
    }

    for (const d of output.diagnostics) {
        const prefix = `${d.filePath}:${d.line}`;
        const fieldInfo = d.field ? ` [${d.field}]` : "";

        if (d.severity === "error") {
            consola.error(`${prefix}${fieldInfo}: ${d.message}`);
        } else if (d.severity === "warning") {
            consola.warn(`${prefix}${fieldInfo}: ${d.message}`);
        } else {
            consola.info(`${prefix}${fieldInfo}: ${d.message}`);
        }
    }
}

/**
 * Displays instruction quality analysis results using consola.
 */
function displayInstructionQuality(output: LintOutput): void {
    const result = output.qualityResult;
    if (!result) {
        return;
    }

    if (result.discoveredFiles.length === 0) {
        consola.info("No instruction files found");
    } else {
        consola.info(
            `Discovered ${result.discoveredFiles.length} instruction file(s)`,
        );
        for (const file of result.discoveredFiles) {
            consola.info(`  ${file.filePath} (${file.format})`);
        }
        consola.info(
            `Overall instruction quality score: ${result.overallQualityScore}%`,
        );
    }

    for (const suggestion of result.suggestions) {
        consola.warn(suggestion.message);
    }
}

/**
 * The `lint` command for validating agent skills, custom agents, and instruction files.
 */
export const lintCommand = defineCommand({
    meta: {
        name: "lint",
        description:
            "Lint agent skills, custom agents, instruction files, and hook configurations. Validates frontmatter, instruction quality, and hook config schemas.",
    },
    args: {
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
        format: {
            type: "string",
            description: "Output format: human (default), json, or rdjsonl",
            default: "human",
        },
    },
    run: async (context: CommandContext) => {
        const rawTargetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const lintSkillsFlag =
            context.args?.skills === true || context.data?.skills === true;
        const lintAgentsFlag =
            context.args?.agents === true || context.data?.agents === true;
        const lintHooksFlag =
            context.args?.hooks === true || context.data?.hooks === true;
        const lintInstructionsFlag =
            context.args?.instructions === true ||
            context.data?.instructions === true;

        const rawFormat =
            typeof context.args?.format === "string"
                ? context.args.format
                : typeof context.data?.format === "string"
                  ? context.data.format
                  : "human";
        const validFormats = new Set<LintFormatType>([
            "human",
            "json",
            "rdjsonl",
        ]);
        function isLintFormatType(value: string): value is LintFormatType {
            return validFormats.has(value as LintFormatType);
        }
        const format: LintFormatType = isLintFormatType(rawFormat)
            ? rawFormat
            : "human";

        let result: Awaited<ReturnType<typeof runLint>>;
        try {
            result = await runLint({
                directory: rawTargetDir,
                targets: {
                    skills: lintSkillsFlag,
                    agents: lintAgentsFlag,
                    hooks: lintHooksFlag,
                    instructions: lintInstructionsFlag,
                },
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            consola.error(`Lint failed: ${message}`);
            process.exitCode = 1;
            return;
        }

        const { outputs, hasErrors } = result;

        let totalWarnings = 0;
        for (const output of outputs) {
            totalWarnings += output.summary.totalWarnings;
        }

        const targetLabels: Record<string, string> = {
            skill: "skill(s)",
            agent: "agent(s)",
            hook: "hook config(s)",
            instruction: "instruction file(s)",
        };

        if (format !== "human") {
            const formatter = createFormatter(format);
            const formatted = formatter.format(outputs);
            if (formatted) {
                process.stdout.write(`${formatted}\n`);
            }
        } else {
            for (const output of outputs) {
                const label = targetLabels[output.target] ?? output.target;
                if (output.target === "instruction") {
                    displayInstructionQuality(output);
                } else {
                    displayLintOutput(output, label);
                }
            }
        }

        if (hasErrors) {
            process.exitCode = 1;

            if (format === "human") {
                const totalErrors = outputs.reduce(
                    (sum, o) => sum + o.summary.totalErrors,
                    0,
                );
                consola.error(
                    `lint failed: ${totalErrors} error(s), ${totalWarnings} warning(s)`,
                );
            }

            return;
        }

        if (format === "human") {
            if (totalWarnings > 0) {
                consola.warn(`Lint passed with ${totalWarnings} warning(s)`);
            } else {
                const targets = outputs
                    .map((o) => targetLabels[o.target] ?? o.target)
                    .join(", ");
                consola.success(`All ${targets} passed lint checks`);
            }
        }
    },
});
