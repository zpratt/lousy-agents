/**
 * Use case for linting Claude Code subagent frontmatter.
 * Validates required fields, name format, and filename matching.
 */

import { z } from "zod";
import type { ParsedFrontmatter } from "../entities/skill.js";

/**
 * Zod schema for validating subagent frontmatter.
 * Claude Code subagents require `name` and `description`, mirroring the
 * Copilot custom agent contract (see AgentFrontmatterSchema).
 */
export const SubagentFrontmatterSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(64, "Name must be 64 characters or fewer")
        .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Name must contain only lowercase letters, numbers, and hyphens",
        ),
    description: z
        .string()
        .min(1, "Description is required")
        .max(1024, "Description must be 1024 characters or fewer")
        .refine((s) => s.trim().length > 0, {
            message: "Description cannot be empty or whitespace-only",
        }),
});

/**
 * A discovered subagent file on disk.
 */
export interface DiscoveredSubagentFile {
    readonly filePath: string;
    readonly subagentName: string;
}

/**
 * Severity levels for subagent lint diagnostics.
 */
export type SubagentLintSeverity = "error" | "warning";

/**
 * A single lint diagnostic for a subagent file.
 */
export interface SubagentLintDiagnostic {
    readonly line: number;
    readonly severity: SubagentLintSeverity;
    readonly message: string;
    readonly field?: string;
    readonly ruleId: string;
}

/**
 * Lint result for a single subagent file.
 */
export interface SubagentLintResult {
    readonly filePath: string;
    readonly subagentName: string;
    readonly diagnostics: readonly SubagentLintDiagnostic[];
    readonly valid: boolean;
}

/**
 * Port for subagent lint gateway operations.
 */
export interface SubagentLintGateway {
    discoverSubagents(targetDir: string): Promise<DiscoveredSubagentFile[]>;
    readSubagentFileContent(filePath: string): Promise<string>;
    parseFrontmatter(content: string): ParsedFrontmatter | null;
}

/**
 * Input for the lint subagent frontmatter use case.
 */
export interface LintSubagentFrontmatterInput {
    targetDir: string;
}

/**
 * Output from the lint subagent frontmatter use case.
 */
export interface LintSubagentFrontmatterOutput {
    results: SubagentLintResult[];
    totalSubagents: number;
    totalErrors: number;
    totalWarnings: number;
}

/**
 * Use case for linting subagent frontmatter across a repository.
 */
export class LintSubagentFrontmatterUseCase {
    constructor(private readonly gateway: SubagentLintGateway) {}

    async execute(
        input: LintSubagentFrontmatterInput,
    ): Promise<LintSubagentFrontmatterOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        const subagents = await this.gateway.discoverSubagents(input.targetDir);

        const results: SubagentLintResult[] = [];

        for (const subagent of subagents) {
            const content = await this.gateway.readSubagentFileContent(
                subagent.filePath,
            );
            const result = this.lintSubagent(subagent, content);
            results.push(result);
        }

        const totalErrors = results.reduce(
            (sum, r) =>
                sum +
                r.diagnostics.filter((d) => d.severity === "error").length,
            0,
        );
        const totalWarnings = results.reduce(
            (sum, r) =>
                sum +
                r.diagnostics.filter((d) => d.severity === "warning").length,
            0,
        );

        return {
            results,
            totalSubagents: subagents.length,
            totalErrors,
            totalWarnings,
        };
    }

    private lintSubagent(
        subagent: DiscoveredSubagentFile,
        content: string,
    ): SubagentLintResult {
        let parsed: ParsedFrontmatter | null = null;
        let diagnostics: SubagentLintDiagnostic[] = [];

        try {
            parsed = this.gateway.parseFrontmatter(content);
        } catch (error) {
            const messagePrefix = "Invalid YAML frontmatter";
            const errorMessage =
                error instanceof Error && error.message
                    ? `${messagePrefix}: ${error.message}`
                    : `${messagePrefix}.`;

            diagnostics.push({
                line: 1,
                severity: "error",
                message: errorMessage,
                ruleId: "subagent/invalid-frontmatter",
            });
        }

        if (!parsed) {
            if (diagnostics.length === 0) {
                const message = hasOpeningDelimiter(content)
                    ? "Invalid YAML frontmatter. The content between --- delimiters could not be parsed as valid YAML."
                    : "Missing YAML frontmatter. Subagent files must begin with --- delimited YAML frontmatter.";
                const ruleId = hasOpeningDelimiter(content)
                    ? "subagent/invalid-frontmatter"
                    : "subagent/missing-frontmatter";
                diagnostics.push({
                    line: 1,
                    severity: "error",
                    message,
                    ruleId,
                });
            }

            return {
                filePath: subagent.filePath,
                subagentName: subagent.subagentName,
                diagnostics,
                valid: false,
            };
        }

        const frontmatterDiagnostics = this.validateFrontmatter(
            parsed,
            subagent.subagentName,
        );
        diagnostics = diagnostics.concat(frontmatterDiagnostics);

        return {
            filePath: subagent.filePath,
            subagentName: subagent.subagentName,
            diagnostics,
            valid: diagnostics.every((d) => d.severity !== "error"),
        };
    }

    private validateFrontmatter(
        parsed: ParsedFrontmatter,
        filenameStem: string,
    ): SubagentLintDiagnostic[] {
        const diagnostics: SubagentLintDiagnostic[] = [];

        const result = SubagentFrontmatterSchema.safeParse(parsed.data);

        if (!result.success) {
            for (const issue of result.error.issues) {
                const fieldName = issue.path[0]?.toString();
                const line = fieldName
                    ? (parsed.fieldLines.get(fieldName) ??
                      parsed.frontmatterStartLine)
                    : parsed.frontmatterStartLine;

                const isMissing =
                    fieldName !== undefined &&
                    parsed.data[fieldName] === undefined;
                const ruleId = this.getRuleIdForField(fieldName, isMissing);

                diagnostics.push({
                    line,
                    severity: "error",
                    message: issue.message,
                    field: fieldName,
                    ruleId,
                });
            }
        }

        // Check name matches filename stem
        if (result.success && result.data.name !== filenameStem) {
            const nameLine =
                parsed.fieldLines.get("name") ?? parsed.frontmatterStartLine;
            diagnostics.push({
                line: nameLine,
                severity: "error",
                message: `Frontmatter name '${result.data.name}' does not match filename '${filenameStem}'. Claude Code identifies subagents by the name field, not the filename, but matching them is a helpful convention.`,
                field: "name",
                ruleId: "subagent/name-mismatch",
            });
        }

        return diagnostics;
    }

    private getRuleIdForField(
        fieldName: string | undefined,
        isMissing: boolean,
    ): string {
        if (fieldName === "name") {
            return isMissing
                ? "subagent/missing-name"
                : "subagent/invalid-name-format";
        }
        if (fieldName === "description") {
            return isMissing
                ? "subagent/missing-description"
                : "subagent/invalid-description";
        }
        return "subagent/invalid-field";
    }
}

/**
 * Checks whether content has an opening --- frontmatter delimiter.
 */
function hasOpeningDelimiter(content: string): boolean {
    const lines = content.split("\n");
    return lines[0]?.trim() === "---";
}
