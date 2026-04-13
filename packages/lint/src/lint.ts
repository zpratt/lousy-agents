/**
 * Lint composition root.
 *
 * Wires internal gateways, use cases, and severity filtering into a
 * single `runLint` entry point. This is a Layer 4 (Infrastructure)
 * module — the only place that instantiates concrete implementations.
 */

import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
    LintDiagnostic,
    LintOutput,
    LintSeverity,
} from "@lousy-agents/core/entities/lint.js";
import type { LintRulesConfig } from "@lousy-agents/core/entities/lint-rules.js";
import { createAgentLintGateway } from "@lousy-agents/core/gateways/agent-lint-gateway.js";
import { createHookConfigGateway } from "@lousy-agents/core/gateways/hook-config-gateway.js";
import { createInstructionFileDiscoveryGateway } from "@lousy-agents/core/gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "@lousy-agents/core/gateways/markdown-ast-gateway.js";
import { createFeedbackLoopCommandsGateway } from "@lousy-agents/core/gateways/script-discovery-gateway.js";
import { createSkillLintGateway } from "@lousy-agents/core/gateways/skill-lint-gateway.js";
import { loadLintConfig } from "@lousy-agents/core/lib/lint-config.js";
import { AnalyzeInstructionQualityUseCase } from "@lousy-agents/core/use-cases/analyze-instruction-quality.js";
import { applySeverityFilter } from "@lousy-agents/core/use-cases/apply-severity-filter.js";
import { LintAgentFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-agent-frontmatter.js";
import { LintHookConfigUseCase } from "@lousy-agents/core/use-cases/lint-hook-config.js";
import { LintSkillFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-skill-frontmatter.js";
import { z } from "zod";

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
 * @property directory - Path to the project directory to lint (absolute or relative).
 * @property targets - Optional selection of which lint targets to run.
 *   When omitted or when all flags are false, all targets are linted.
 */
export interface LintOptions {
    /** Path to the project directory to lint (absolute or relative). */
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
    // Reject null bytes which some platforms accept as path terminators
    if (directory.includes("\0")) {
        throw new Error(
            `Invalid directory path (null byte detected): ${directory}`,
        );
    }

    // Reject paths containing ".." path segments (traversal).
    // Split on path separators and check segments to avoid false positives
    // on legitimate names like "data..v2".
    const rawSegments = directory.split(/[\\/]/);
    if (rawSegments.includes("..")) {
        throw new Error(
            `Invalid directory path (path traversal detected): ${directory}`,
        );
    }

    const resolved = resolve(directory);

    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
        stats = await lstat(resolved);
    } catch (error: unknown) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            throw new Error(`Directory does not exist: ${directory}`);
        }
        throw error;
    }

    if (stats.isSymbolicLink()) {
        throw new Error(`Path is a symbolic link: ${directory}`);
    }

    if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${directory}`);
    }

    return resolved;
}

/**
 * Shape shared by all use-case lint outputs.
 * Each has a `results` array (entries with `filePath` and `diagnostics`)
 * plus summary counters.
 */
interface UseCaseLintOutput {
    readonly results: ReadonlyArray<{
        readonly filePath: string;
        readonly diagnostics: ReadonlyArray<{
            readonly line: number;
            readonly severity: LintSeverity;
            readonly message: string;
            readonly field?: string;
            readonly ruleId?: string;
        }>;
    }>;
    readonly totalErrors: number;
    readonly totalWarnings: number;
}

/**
 * Converts a use-case lint output to the unified LintOutput shape.
 * Computes `totalInfos` from actual diagnostics rather than hardcoding 0.
 */
function toLintOutput(
    output: UseCaseLintOutput,
    target: LintOutput["target"],
    totalFiles: number,
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
                target,
            });
        }
    }

    return {
        diagnostics,
        target,
        filesAnalyzed: output.results.map((r) => r.filePath),
        summary: {
            totalFiles,
            totalErrors: output.totalErrors,
            totalWarnings: output.totalWarnings,
            totalInfos: diagnostics.filter((d) => d.severity === "info").length,
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
    return toLintOutput(output, "skill", output.totalSkills);
}

/**
 * Runs agent linting against the target directory.
 */
async function lintAgents(targetDir: string): Promise<LintOutput> {
    const gateway = createAgentLintGateway();
    const useCase = new LintAgentFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "agent", output.totalAgents);
}

/**
 * Runs hook configuration linting against the target directory.
 */
async function lintHooks(targetDir: string): Promise<LintOutput> {
    const gateway = createHookConfigGateway();
    const useCase = new LintHookConfigUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "hook", output.totalFiles);
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
