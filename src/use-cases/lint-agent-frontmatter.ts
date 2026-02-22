/**
 * Use case for linting GitHub Copilot custom agent frontmatter.
 * Validates required fields, name format, and filename matching.
 */

import { z } from "zod";
import type { ParsedFrontmatter } from "../entities/skill.js";

/**
 * Zod schema for validating agent frontmatter.
 * Based on the generateAgentContent() entity function.
 */
export const AgentFrontmatterSchema = z.object({
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
 * A discovered agent file on disk.
 */
export interface DiscoveredAgentFile {
    readonly filePath: string;
    readonly agentName: string;
}

/**
 * Severity levels for agent lint diagnostics.
 */
export type AgentLintSeverity = "error" | "warning";

/**
 * A single lint diagnostic for an agent file.
 */
export interface AgentLintDiagnostic {
    readonly line: number;
    readonly severity: AgentLintSeverity;
    readonly message: string;
    readonly field?: string;
    readonly ruleId: string;
}

/**
 * Lint result for a single agent file.
 */
export interface AgentLintResult {
    readonly filePath: string;
    readonly agentName: string;
    readonly diagnostics: readonly AgentLintDiagnostic[];
    readonly valid: boolean;
}

/**
 * Port for agent lint gateway operations.
 */
export interface AgentLintGateway {
    discoverAgents(targetDir: string): Promise<DiscoveredAgentFile[]>;
    readAgentFileContent(filePath: string): Promise<string>;
    parseFrontmatter(content: string): ParsedFrontmatter | null;
}

/**
 * Input for the lint agent frontmatter use case.
 */
export interface LintAgentFrontmatterInput {
    targetDir: string;
}

/**
 * Output from the lint agent frontmatter use case.
 */
export interface LintAgentFrontmatterOutput {
    results: AgentLintResult[];
    totalAgents: number;
    totalErrors: number;
    totalWarnings: number;
}

/**
 * Use case for linting agent frontmatter across a repository.
 */
export class LintAgentFrontmatterUseCase {
    constructor(private readonly gateway: AgentLintGateway) {}

    async execute(
        input: LintAgentFrontmatterInput,
    ): Promise<LintAgentFrontmatterOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        const agents = await this.gateway.discoverAgents(input.targetDir);

        const results: AgentLintResult[] = [];

        for (const agent of agents) {
            const content = await this.gateway.readAgentFileContent(
                agent.filePath,
            );
            const result = this.lintAgent(agent, content);
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
            totalAgents: agents.length,
            totalErrors,
            totalWarnings,
        };
    }

    private lintAgent(
        agent: DiscoveredAgentFile,
        content: string,
    ): AgentLintResult {
        let parsed: ParsedFrontmatter | null = null;
        let diagnostics: AgentLintDiagnostic[] = [];

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
                ruleId: "agent/invalid-frontmatter",
            });
        }

        if (!parsed) {
            if (diagnostics.length === 0) {
                const message = hasFrontmatterDelimiters(content)
                    ? "Invalid YAML frontmatter. The content between --- delimiters could not be parsed as valid YAML."
                    : "Missing YAML frontmatter. Agent files must begin with --- delimited YAML frontmatter.";
                const ruleId = hasFrontmatterDelimiters(content)
                    ? "agent/invalid-frontmatter"
                    : "agent/missing-frontmatter";
                diagnostics.push({
                    line: 1,
                    severity: "error",
                    message,
                    ruleId,
                });
            }

            return {
                filePath: agent.filePath,
                agentName: agent.agentName,
                diagnostics,
                valid: false,
            };
        }

        const frontmatterDiagnostics = this.validateFrontmatter(
            parsed,
            agent.agentName,
        );
        diagnostics = diagnostics.concat(frontmatterDiagnostics);

        return {
            filePath: agent.filePath,
            agentName: agent.agentName,
            diagnostics,
            valid: diagnostics.every((d) => d.severity !== "error"),
        };
    }

    private validateFrontmatter(
        parsed: ParsedFrontmatter,
        filenameStem: string,
    ): AgentLintDiagnostic[] {
        const diagnostics: AgentLintDiagnostic[] = [];

        const result = AgentFrontmatterSchema.safeParse(parsed.data);

        if (!result.success) {
            for (const issue of result.error.issues) {
                const fieldName = issue.path[0]?.toString();
                const line = fieldName
                    ? (parsed.fieldLines.get(fieldName) ??
                      parsed.frontmatterStartLine)
                    : parsed.frontmatterStartLine;

                const ruleId = this.getRuleIdForField(fieldName, issue.message);

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
                message: `Frontmatter name '${result.data.name}' must match filename '${filenameStem}'`,
                field: "name",
                ruleId: "agent/name-mismatch",
            });
        }

        return diagnostics;
    }

    private getRuleIdForField(
        fieldName: string | undefined,
        message: string,
    ): string {
        if (fieldName === "name") {
            if (
                message.includes("required") ||
                message.includes("expected string")
            ) {
                return "agent/missing-name";
            }
            return "agent/invalid-name-format";
        }
        if (fieldName === "description") {
            const lowerMessage = message.toLowerCase();
            if (
                lowerMessage.includes("required") ||
                lowerMessage.includes("expected string")
            ) {
                return "agent/missing-description";
            }
            return "agent/invalid-description";
        }
        return "agent/invalid-field";
    }
}

/**
 * Checks whether content has opening and closing --- frontmatter delimiters.
 */
function hasFrontmatterDelimiters(content: string): boolean {
    const lines = content.split("\n");
    if (lines[0]?.trim() !== "---") {
        return false;
    }
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
            return true;
        }
    }
    return false;
}
