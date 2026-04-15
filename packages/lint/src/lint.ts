/**
 * Lint composition root.
 *
 * Wires internal gateways, use cases, and severity filtering into a
 * single `runLint` entry point. This is a Layer 4 (Infrastructure)
 * module — the only place that instantiates concrete implementations.
 */

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
import { ZodError, z } from "zod";
import {
    LintValidationError,
    validateDirectory,
} from "./validate-directory.js";

const LintTargetsSchema = z
    .object({
        skills: z.boolean().optional(),
        agents: z.boolean().optional(),
        hooks: z.boolean().optional(),
        instructions: z.boolean().optional(),
    })
    .strict()
    .optional();

const LintOptionsSchema = z
    .object({
        directory: z.string().min(1, "directory must not be empty"),
        targets: LintTargetsSchema,
    })
    .strict();

/**
 * Options for the public lint API.
 *
 * @property directory - Path to the project directory to lint (absolute or relative).
 * @property targets - Optional selection of which lint targets to run.
 *   When omitted or when all flags are false, all targets are linted.
 */
export interface LintOptions {
    readonly directory: string;
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
    readonly outputs: readonly LintOutput[];
    readonly hasErrors: boolean;
}

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

/** Converts a use-case lint output to the unified LintOutput shape. */
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

async function lintSkills(targetDir: string): Promise<LintOutput> {
    const gateway = createSkillLintGateway();
    const useCase = new LintSkillFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "skill", output.totalSkills);
}

async function lintAgents(targetDir: string): Promise<LintOutput> {
    const gateway = createAgentLintGateway();
    const useCase = new LintAgentFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "agent", output.totalAgents);
}

async function lintHooks(targetDir: string): Promise<LintOutput> {
    const gateway = createHookConfigGateway();
    const useCase = new LintHookConfigUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "hook", output.totalFiles);
}

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

type TargetKey = keyof NonNullable<LintOptions["targets"]>;

interface LintTargetDefinition {
    readonly key: TargetKey;
    readonly execute: (targetDir: string) => Promise<LintOutput>;
}

const LINT_TARGETS: readonly LintTargetDefinition[] = [
    { key: "skills", execute: lintSkills },
    { key: "agents", execute: lintAgents },
    { key: "hooks", execute: lintHooks },
    { key: "instructions", execute: lintInstructions },
];

function isTargetEnabled(
    key: TargetKey,
    targets: LintOptions["targets"],
): boolean {
    if (!targets) return true;
    const hasAnyEnabled = Object.values(targets).some(Boolean);
    return !hasAnyEnabled || targets[key] === true;
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
 * @throws {LintValidationError} If directory validation, schema validation, or lint configuration validation fails.
 */
export async function runLint(options: LintOptions): Promise<LintResult> {
    let parsed: z.infer<typeof LintOptionsSchema>;
    try {
        parsed = LintOptionsSchema.parse(options);
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            throw new LintValidationError(
                error.issues.map((e) => e.message).join("; "),
            );
        }
        throw error;
    }

    const targetDir = await validateDirectory(parsed.directory);

    let rulesConfig: LintRulesConfig;
    try {
        rulesConfig = await loadLintConfig(targetDir);
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            throw new LintValidationError(
                `Invalid lint configuration: ${error.issues.map((e) => e.message).join("; ")}`,
            );
        }
        throw error;
    }

    const enabledTargets = LINT_TARGETS.filter((t) =>
        isTargetEnabled(t.key, parsed.targets),
    );

    const outputs: LintOutput[] = [];
    for (const target of enabledTargets) {
        const rawOutput = await target.execute(targetDir);
        outputs.push(applySeverityFilter(rawOutput, rulesConfig));
    }

    const totalErrors = outputs.reduce(
        (sum, output) => sum + output.summary.totalErrors,
        0,
    );

    return {
        outputs,
        hasErrors: totalErrors > 0,
    };
}
