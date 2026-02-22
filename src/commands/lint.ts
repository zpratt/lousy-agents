/**
 * CLI command for linting agent skills and custom agent frontmatter.
 * Discovers skills and agents, validates frontmatter, and reports diagnostics.
 */

import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import type { LintDiagnostic, LintOutput } from "../entities/lint.js";
import { createAgentLintGateway } from "../gateways/agent-lint-gateway.js";
import { createSkillLintGateway } from "../gateways/skill-lint-gateway.js";
import type { LintAgentFrontmatterOutput } from "../use-cases/lint-agent-frontmatter.js";
import { LintAgentFrontmatterUseCase } from "../use-cases/lint-agent-frontmatter.js";
import type { LintSkillFrontmatterOutput } from "../use-cases/lint-skill-frontmatter.js";
import { LintSkillFrontmatterUseCase } from "../use-cases/lint-skill-frontmatter.js";

/**
 * Converts skill lint output to unified LintOutput.
 */
function skillOutputToLintOutput(
    output: LintSkillFrontmatterOutput,
): LintOutput {
    const diagnostics: LintDiagnostic[] = [];

    for (const result of output.results) {
        for (const d of result.diagnostics) {
            diagnostics.push({
                filePath: result.filePath,
                line: d.line,
                severity: d.severity,
                message: d.message,
                field: d.field,
                target: "skill",
            });
        }
    }

    return {
        diagnostics,
        target: "skill",
        filesAnalyzed: output.results.map((r) => r.filePath),
        summary: {
            totalFiles: output.totalSkills,
            totalErrors: output.totalErrors,
            totalWarnings: output.totalWarnings,
            totalInfos: 0,
        },
    };
}

/**
 * Converts agent lint output to unified LintOutput.
 */
function agentOutputToLintOutput(
    output: LintAgentFrontmatterOutput,
): LintOutput {
    const diagnostics: LintDiagnostic[] = [];

    for (const result of output.results) {
        for (const d of result.diagnostics) {
            diagnostics.push({
                filePath: result.filePath,
                line: d.line,
                severity: d.severity,
                message: d.message,
                field: d.field,
                ruleId: d.ruleId,
                target: "agent",
            });
        }
    }

    return {
        diagnostics,
        target: "agent",
        filesAnalyzed: output.results.map((r) => r.filePath),
        summary: {
            totalFiles: output.totalAgents,
            totalErrors: output.totalErrors,
            totalWarnings: output.totalWarnings,
            totalInfos: 0,
        },
    };
}

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
    const filesSeen = new Set<string>();
    const filesWithDiagnostics = new Set<string>();

    for (const d of output.diagnostics) {
        filesWithDiagnostics.add(d.filePath);
    }

    for (const file of output.filesAnalyzed) {
        if (!filesWithDiagnostics.has(file)) {
            consola.success(`${file}: OK`);
        }
        filesSeen.add(file);
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
 * Runs skill linting.
 */
async function lintSkills(targetDir: string): Promise<LintOutput> {
    const gateway = createSkillLintGateway();
    const useCase = new LintSkillFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return skillOutputToLintOutput(output);
}

/**
 * Runs agent linting.
 */
async function lintAgents(targetDir: string): Promise<LintOutput> {
    const gateway = createAgentLintGateway();
    const useCase = new LintAgentFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return agentOutputToLintOutput(output);
}

/**
 * The `lint` command for validating agent skill and custom agent files.
 */
export const lintCommand = defineCommand({
    meta: {
        name: "lint",
        description:
            "Lint agent skills and custom agents. Validates required and recommended fields in frontmatter.",
    },
    args: {
        agents: {
            type: "boolean",
            description: "Lint custom agent frontmatter in .github/agents/",
            default: false,
        },
    },
    run: async (context: CommandContext) => {
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const lintAgentsFlag =
            context.args?.agents === true ||
            context.data?.agents === true;

        let totalErrors = 0;
        let totalWarnings = 0;

        if (lintAgentsFlag) {
            const agentOutput = await lintAgents(targetDir);
            displayLintOutput(agentOutput, "agent(s)");
            totalErrors += agentOutput.summary.totalErrors;
            totalWarnings += agentOutput.summary.totalWarnings;
        } else {
            // Default: lint skills
            const skillOutput = await lintSkills(targetDir);
            displayLintOutput(skillOutput, "skill(s)");
            totalErrors += skillOutput.summary.totalErrors;
            totalWarnings += skillOutput.summary.totalWarnings;
        }

        if (totalErrors > 0) {
            throw new Error(
                `lint failed: ${totalErrors} error(s), ${totalWarnings} warning(s)`,
            );
        }

        if (totalWarnings > 0) {
            consola.warn(
                `Lint passed with ${totalWarnings} warning(s)`,
            );
        } else {
            const target = lintAgentsFlag ? "agents" : "skills";
            consola.success(`All ${target} passed lint checks`);
        }
    },
});

