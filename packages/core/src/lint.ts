/**
 * Public lint API facade.
 *
 * Provides a single entry point for programmatic linting of agent skills,
 * custom agents, hook configurations, and instruction files.
 *
 * This module acts as a composition root for the lint workflow, wiring up
 * internal gateways, use cases, and severity filtering behind a clean
 * public interface.
 */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { LintDiagnostic, LintOutput } from "./entities/lint.js";
import type { LintRulesConfig } from "./entities/lint-rules.js";
import { createAgentLintGateway } from "./gateways/agent-lint-gateway.js";
import { createHookConfigGateway } from "./gateways/hook-config-gateway.js";
import { createInstructionFileDiscoveryGateway } from "./gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "./gateways/markdown-ast-gateway.js";
import { createFeedbackLoopCommandsGateway } from "./gateways/script-discovery-gateway.js";
import { createSkillLintGateway } from "./gateways/skill-lint-gateway.js";
import { loadLintConfig } from "./lib/lint-config.js";
import { AnalyzeInstructionQualityUseCase } from "./use-cases/analyze-instruction-quality.js";
import { applySeverityFilter } from "./use-cases/apply-severity-filter.js";
import type { LintAgentFrontmatterOutput } from "./use-cases/lint-agent-frontmatter.js";
import { LintAgentFrontmatterUseCase } from "./use-cases/lint-agent-frontmatter.js";
import type { LintHookConfigOutput } from "./use-cases/lint-hook-config.js";
import { LintHookConfigUseCase } from "./use-cases/lint-hook-config.js";
import type { LintSkillFrontmatterOutput } from "./use-cases/lint-skill-frontmatter.js";
import { LintSkillFrontmatterUseCase } from "./use-cases/lint-skill-frontmatter.js";

/** Zod schema for runtime validation of LintOptions */
const LintTargetsSchema = z
    .object({
        skills: z.boolean().optional(),
        agents: z.boolean().optional(),
        hooks: z.boolean().optional(),
        instructions: z.boolean().optional(),
    })
    .strict()
    .optional();

const LintOptionsSchema = z.object({
    directory: z.string().min(1, "directory must not be empty"),
    targets: LintTargetsSchema,
});

/**
 * Options for the public lint API.
 *
 * @property directory - Absolute path to the project directory to lint.
 * @property targets - Optional selection of which lint targets to run.
 *   When omitted or when all flags are false, all targets are linted.
 */
export interface LintOptions {
    /** Absolute path to the project directory to lint. */
    readonly directory: string;
    /** Optional selection of which lint targets to run. */
    readonly targets?: {
        readonly skills?: boolean;
        readonly agents?: boolean;
        readonly hooks?: boolean;
        readonly instructions?: boolean;
    };
}

/**
 * Result of a lint run.
 *
 * @property outputs - Array of lint results, one per target that was run.
 * @property hasErrors - True if any target produced error-severity diagnostics.
 */
export interface LintResult {
    /** Array of lint results, one per target that was run. */
    readonly outputs: readonly LintOutput[];
    /** True if any target produced error-severity diagnostics. */
    readonly hasErrors: boolean;
}

/**
 * Validates the directory path for safety.
 * Rejects path traversal, verifies existence, and ensures it is a directory.
 */
async function validateDirectory(directory: string): Promise<string> {
    if (directory.includes("..")) {
        throw new Error(
            `Invalid directory path (path traversal detected): ${directory}`,
        );
    }

    const resolved = resolve(directory);

    let stats: Awaited<ReturnType<typeof stat>>;
    try {
        stats = await stat(resolved);
    } catch {
        throw new Error(`Directory does not exist: ${directory}`);
    }

    if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${directory}`);
    }

    return resolved;
}

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
                ruleId: d.ruleId,
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
 * Converts hook lint output to unified LintOutput.
 */
function hookOutputToLintOutput(output: LintHookConfigOutput): LintOutput {
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
                target: "hook",
            });
        }
    }

    return {
        diagnostics,
        target: "hook",
        filesAnalyzed: output.results.map((r) => r.filePath),
        summary: {
            totalFiles: output.totalFiles,
            totalErrors: output.totalErrors,
            totalWarnings: output.totalWarnings,
            totalInfos: 0,
        },
    };
}

/**
 * Runs skill linting against the target directory.
 */
async function lintSkills(targetDir: string): Promise<LintOutput> {
    const gateway = createSkillLintGateway();
    const useCase = new LintSkillFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return skillOutputToLintOutput(output);
}

/**
 * Runs agent linting against the target directory.
 */
async function lintAgents(targetDir: string): Promise<LintOutput> {
    const gateway = createAgentLintGateway();
    const useCase = new LintAgentFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return agentOutputToLintOutput(output);
}

/**
 * Runs hook configuration linting against the target directory.
 */
async function lintHooks(targetDir: string): Promise<LintOutput> {
    const gateway = createHookConfigGateway();
    const useCase = new LintHookConfigUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return hookOutputToLintOutput(output);
}

/**
 * Runs instruction quality analysis against the target directory.
 */
async function lintInstructions(targetDir: string): Promise<LintOutput> {
    const discoveryGateway = createInstructionFileDiscoveryGateway();
    const astGateway = createMarkdownAstGateway();
    const commandsGateway = createFeedbackLoopCommandsGateway();

    const useCase = new AnalyzeInstructionQualityUseCase(
        discoveryGateway,
        astGateway,
        commandsGateway,
    );

    const output = await useCase.execute({ targetDir });

    const filesAnalyzed = output.result.discoveredFiles.map((f) => f.filePath);

    return {
        diagnostics: output.diagnostics,
        target: "instruction",
        filesAnalyzed,
        qualityResult: output.result,
        summary: {
            totalFiles: filesAnalyzed.length,
            totalErrors: output.diagnostics.filter(
                (d) => d.severity === "error",
            ).length,
            totalWarnings: output.diagnostics.filter(
                (d) => d.severity === "warning",
            ).length,
            totalInfos: output.diagnostics.filter((d) => d.severity === "info")
                .length,
        },
    };
}

/**
 * Run lint checks on a project directory.
 *
 * Orchestrates all lint targets (skills, agents, hooks, instructions),
 * applies lint rule configuration, and returns structured results.
 *
 * When no targets are specified (or all are false), all targets are run.
 *
 * @example
 * ```typescript
 * import { runLint } from '@lousy-agents/lint';
 *
 * const result = await runLint({ directory: '/path/to/project' });
 * console.log(result.hasErrors);
 * console.log(result.outputs);
 * ```
 *
 * @throws {Error} If directory is empty, contains path traversal, does not exist, or is not a directory.
 * @throws {Error} If lint configuration file has syntax errors or validation failures.
 */
export async function runLint(options: LintOptions): Promise<LintResult> {
    const parsed = LintOptionsSchema.parse(options);

    const targetDir = await validateDirectory(parsed.directory);

    const rulesConfig: LintRulesConfig = await loadLintConfig(targetDir);

    const targets = parsed.targets;
    const noFlagProvided =
        !targets?.skills &&
        !targets?.agents &&
        !targets?.hooks &&
        !targets?.instructions;

    const allOutputs: LintOutput[] = [];
    let totalErrors = 0;

    if (noFlagProvided || targets?.skills) {
        const rawOutput = await lintSkills(targetDir);
        const filtered = applySeverityFilter(rawOutput, rulesConfig);
        allOutputs.push(filtered);
        totalErrors += filtered.summary.totalErrors;
    }

    if (noFlagProvided || targets?.agents) {
        const rawOutput = await lintAgents(targetDir);
        const filtered = applySeverityFilter(rawOutput, rulesConfig);
        allOutputs.push(filtered);
        totalErrors += filtered.summary.totalErrors;
    }

    if (noFlagProvided || targets?.hooks) {
        const rawOutput = await lintHooks(targetDir);
        const filtered = applySeverityFilter(rawOutput, rulesConfig);
        allOutputs.push(filtered);
        totalErrors += filtered.summary.totalErrors;
    }

    if (noFlagProvided || targets?.instructions) {
        const rawOutput = await lintInstructions(targetDir);
        const filtered = applySeverityFilter(rawOutput, rulesConfig);
        allOutputs.push(filtered);
        totalErrors += filtered.summary.totalErrors;
    }

    return {
        outputs: allOutputs,
        hasErrors: totalErrors > 0,
    };
}
