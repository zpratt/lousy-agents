/**
 * Use case for linting GitHub Copilot Agent Skill frontmatter.
 * Validates required and recommended fields, name format, and directory naming.
 */

import { z } from "zod";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
    SkillLintDiagnostic,
    SkillLintResult,
} from "../entities/skill.js";

/**
 * Zod schema for validating agent skill frontmatter.
 * Based on the agentskills.io specification.
 */
export const AgentSkillFrontmatterSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(64, "Name must be 64 characters or fewer")
        .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Name must contain only lowercase letters, numbers, and hyphens. It cannot start/end with a hyphen or contain consecutive hyphens.",
        ),
    description: z
        .string()
        .min(1, "Description is required")
        .max(1024, "Description must be 1024 characters or fewer"),
    license: z.string().optional(),
    compatibility: z
        .string()
        .max(500, "Compatibility must be 500 characters or fewer")
        .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    "allowed-tools": z.string().optional(),
});

/**
 * Recommended (optional) fields that produce warnings when missing.
 */
const RECOMMENDED_FIELDS = ["allowed-tools"] as const;

/**
 * Port for skill lint gateway operations.
 */
export interface SkillLintGateway {
    discoverSkills(targetDir: string): Promise<DiscoveredSkillFile[]>;
    readSkillFileContent(filePath: string): Promise<string>;
    parseFrontmatter(content: string): ParsedFrontmatter | null;
}

/**
 * Input for the lint skill frontmatter use case.
 */
export interface LintSkillFrontmatterInput {
    targetDir: string;
}

/**
 * Output from the lint skill frontmatter use case.
 */
export interface LintSkillFrontmatterOutput {
    results: SkillLintResult[];
    totalSkills: number;
    totalErrors: number;
    totalWarnings: number;
}

/**
 * Use case for linting skill frontmatter across a repository.
 */
export class LintSkillFrontmatterUseCase {
    constructor(private readonly gateway: SkillLintGateway) {}

    async execute(
        input: LintSkillFrontmatterInput,
    ): Promise<LintSkillFrontmatterOutput> {
        if (!input.targetDir) {
            throw new Error("Target directory is required");
        }

        const skills = await this.gateway.discoverSkills(input.targetDir);

        const results: SkillLintResult[] = [];

        for (const skill of skills) {
            const content = await this.gateway.readSkillFileContent(
                skill.filePath,
            );
            const result = this.lintSkill(skill, content);
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
            totalSkills: skills.length,
            totalErrors,
            totalWarnings,
        };
    }

    private lintSkill(
        skill: DiscoveredSkillFile,
        content: string,
    ): SkillLintResult {
        const parsed = this.gateway.parseFrontmatter(content);

        if (!parsed) {
            return {
                filePath: skill.filePath,
                skillName: skill.skillName,
                diagnostics: [
                    {
                        line: 1,
                        severity: "error",
                        message:
                            "Missing YAML frontmatter. Skill files must begin with --- delimited YAML frontmatter.",
                    },
                ],
                valid: false,
            };
        }

        const diagnostics = this.validateFrontmatter(parsed, skill.skillName);

        return {
            filePath: skill.filePath,
            skillName: skill.skillName,
            diagnostics,
            valid: diagnostics.every((d) => d.severity !== "error"),
        };
    }

    private validateFrontmatter(
        parsed: ParsedFrontmatter,
        parentDirName: string,
    ): SkillLintDiagnostic[] {
        const diagnostics: SkillLintDiagnostic[] = [];

        // Validate against Zod schema
        const result = AgentSkillFrontmatterSchema.safeParse(parsed.data);

        if (!result.success) {
            for (const issue of result.error.issues) {
                const fieldName = issue.path[0]?.toString();
                const line = fieldName
                    ? (parsed.fieldLines.get(fieldName) ??
                      parsed.frontmatterStartLine)
                    : parsed.frontmatterStartLine;

                diagnostics.push({
                    line,
                    severity: "error",
                    message: issue.message,
                    field: fieldName,
                });
            }
        }

        // Check name matches parent directory
        if (result.success && result.data.name !== parentDirName) {
            const nameLine =
                parsed.fieldLines.get("name") ?? parsed.frontmatterStartLine;
            diagnostics.push({
                line: nameLine,
                severity: "error",
                message: `Frontmatter name '${result.data.name}' must match parent directory name '${parentDirName}'`,
                field: "name",
            });
        }

        // Check recommended fields
        for (const field of RECOMMENDED_FIELDS) {
            if (parsed.data[field] === undefined) {
                diagnostics.push({
                    line: parsed.frontmatterStartLine,
                    severity: "warning",
                    message: `Recommended field '${field}' is missing`,
                    field,
                });
            }
        }

        return diagnostics;
    }
}
