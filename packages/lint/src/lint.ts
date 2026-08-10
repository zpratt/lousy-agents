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
import { createClaudeInstructionImportExpander } from "@lousy-agents/core/gateways/claude-instruction-import-expander.js";
import { createHookConfigGateway } from "@lousy-agents/core/gateways/hook-config-gateway.js";
import { createInstructionFileDiscoveryGateway } from "@lousy-agents/core/gateways/instruction-file-discovery-gateway.js";
import { createMarkdownAstGateway } from "@lousy-agents/core/gateways/markdown-ast-gateway.js";
import { createMcpServersLintGateway } from "@lousy-agents/core/gateways/mcp-lint-gateway.js";
import { createFeedbackLoopCommandsGateway } from "@lousy-agents/core/gateways/script-discovery-gateway.js";
import { createSkillLintGateway } from "@lousy-agents/core/gateways/skill-lint-gateway.js";
import { createSubagentLintGateway } from "@lousy-agents/core/gateways/subagent-lint-gateway.js";
import { loadLintConfig } from "@lousy-agents/core/lib/lint-config.js";
import { AnalyzeInstructionQualityUseCase } from "@lousy-agents/core/use-cases/analyze-instruction-quality.js";
import { applySeverityFilter } from "@lousy-agents/core/use-cases/apply-severity-filter.js";
import { LintAgentFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-agent-frontmatter.js";
import { LintHookConfigUseCase } from "@lousy-agents/core/use-cases/lint-hook-config.js";
import { LintMcpServersUseCase } from "@lousy-agents/core/use-cases/lint-mcp-servers.js";
import { LintSkillFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-skill-frontmatter.js";
import { LintSubagentFrontmatterUseCase } from "@lousy-agents/core/use-cases/lint-subagent-frontmatter.js";
import { ZodError, z } from "zod";
import { LintValidationError } from "./lint-errors.js";
import { validateDirectory } from "./validate-directory.js";

/**
 * Minimal logger interface for the public `LintOptions.logger` boundary.
 *
 * Intentionally structurally typed: any object with a `.warn` method
 * (consola, pino, plain object) satisfies this contract. This keeps the
 * published `@lousy-agents/lint` types free from a hard `consola` import.
 */
export interface LintLogger {
    warn(message: string, ...args: unknown[]): void;
}

const LintTargetsSchema = z
    .object({
        skills: z.boolean().optional(),
        agents: z.boolean().optional(),
        subagents: z.boolean().optional(),
        hooks: z.boolean().optional(),
        instructions: z.boolean().optional(),
        mcpServers: z.boolean().optional(),
    })
    .strict()
    .optional();

const LintOptionsSchema = z
    .object({
        directory: z.string().min(1, "directory must not be empty"),
        targets: LintTargetsSchema,
        // logger is a runtime object — `z.custom` validates its structural contract
        // at the boundary; TypeScript enforces it further at compile time.
        // `v === undefined` is NOT needed here: ZodOptional intercepts undefined
        // before the predicate is invoked, so the guard would be dead code.
        logger: z
            .custom<LintLogger>(
                (v) =>
                    v !== null &&
                    typeof v === "object" &&
                    typeof (v as LintLogger).warn === "function",
                { message: "logger must be an object with a .warn method" },
            )
            .optional(),
    })
    .strict();

/**
 * Options for the public lint API.
 *
 * @property directory - Path to the project directory to lint (absolute or relative).
 * @property targets - Optional selection of which lint targets to run.
 *   When omitted or when all flags are false, all targets are linted.
 * @property logger - Optional logger for gateway diagnostics (e.g. warnings
 *   about unreadable or malformed package.json files). When omitted, the global
 *   `consola` instance is used. Must be an object with a `.warn` method.
 */
export interface LintOptions {
    readonly directory: string;
    readonly targets?: {
        readonly skills?: boolean;
        readonly agents?: boolean;
        /**
         * Flag-only target (not GA): lints `.claude/agents` subagent
         * frontmatter. Never runs unless explicitly set to `true`, even
         * when `targets` is entirely omitted.
         */
        readonly subagents?: boolean;
        readonly hooks?: boolean;
        readonly instructions?: boolean;
        /**
         * Flag-only target (not GA): validates MCP server config files
         * (`.mcp.json`, `.vscode/mcp.json`). Never runs unless explicitly
         * set to `true`, even when `targets` is entirely omitted.
         */
        readonly mcpServers?: boolean;
    };
    readonly logger?: LintLogger;
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

async function lintSubagents(targetDir: string): Promise<LintOutput> {
    const gateway = createSubagentLintGateway();
    const useCase = new LintSubagentFrontmatterUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "subagent", output.totalSubagents);
}

async function lintMcpServers(targetDir: string): Promise<LintOutput> {
    const gateway = createMcpServersLintGateway();
    const useCase = new LintMcpServersUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "mcp-server", output.totalFiles);
}

async function lintHooks(targetDir: string): Promise<LintOutput> {
    const gateway = createHookConfigGateway();
    const useCase = new LintHookConfigUseCase(gateway);
    const output = await useCase.execute({ targetDir });
    return toLintOutput(output, "hook", output.totalFiles);
}

async function lintInstructions(
    targetDir: string,
    logger?: LintLogger,
): Promise<LintOutput> {
    const discoveryGateway = createInstructionFileDiscoveryGateway();
    const astGateway = createMarkdownAstGateway();
    const commandsGateway = createFeedbackLoopCommandsGateway(
        undefined,
        logger,
    );

    const useCase = new AnalyzeInstructionQualityUseCase(
        discoveryGateway,
        astGateway,
        commandsGateway,
        createClaudeInstructionImportExpander(),
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
    /**
     * Whether this target runs when no target flags are set at all.
     * `false` marks a flag-only (not GA) target — it only runs when its
     * flag is explicitly set to `true`, regardless of what else is set.
     */
    readonly defaultEnabled: boolean;
    readonly execute: (targetDir: string) => Promise<LintOutput>;
}

function isTargetEnabled(
    target: LintTargetDefinition,
    targets: LintOptions["targets"],
): boolean {
    if (!targets) {
        return target.defaultEnabled;
    }
    const hasAnyEnabled = Object.values(targets).some(Boolean);
    if (!hasAnyEnabled) {
        return target.defaultEnabled;
    }
    return targets[target.key] === true;
}

/**
 * Run lint checks on a project directory.
 *
 * Orchestrates all lint targets (skills, agents, hooks, instructions),
 * applies lint rule configuration, and returns structured results.
 *
 * When no targets are specified (or all are false), the default-enabled
 * targets are run (skills, agents, hooks, instructions). `subagents` and
 * `mcpServers` are flag-only (not yet GA): they only run when explicitly
 * set to `true`, even when no other target flags are set.
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

    const lintTargets: readonly LintTargetDefinition[] = [
        { key: "skills", defaultEnabled: true, execute: lintSkills },
        { key: "agents", defaultEnabled: true, execute: lintAgents },
        {
            key: "subagents",
            defaultEnabled: false,
            execute: lintSubagents,
        },
        { key: "hooks", defaultEnabled: true, execute: lintHooks },
        {
            key: "instructions",
            defaultEnabled: true,
            execute: (dir) => lintInstructions(dir, parsed.logger),
        },
        {
            key: "mcpServers",
            defaultEnabled: false,
            execute: lintMcpServers,
        },
    ];

    const enabledTargets = lintTargets.filter((t) =>
        isTargetEnabled(t, parsed.targets),
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
