import { z } from "zod";
import type {
    DiscoveredSkillFile,
    ParsedFrontmatter,
    SkillLintDiagnostic,
    SkillLintResult,
} from "../entities/skill.js";

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
        .max(1024, "Description must be 1024 characters or fewer")
        .refine((s) => s.trim().length > 0, {
            message: "Description cannot be empty or whitespace-only",
        }),
    license: z.string().optional(),
    compatibility: z
        .string()
        .max(500, "Compatibility must be 500 characters or fewer")
        .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    "allowed-tools": z.string().optional(),
});

const RECOMMENDED_FIELDS = ["allowed-tools"] as const;

const RECOMMENDED_FIELD_RULE_IDS: Record<
    (typeof RECOMMENDED_FIELDS)[number],
    string
> = {
    "allowed-tools": "skill/missing-allowed-tools",
} as const;

export interface SkillLintGateway {
    discoverSkills(targetDir: string): Promise<DiscoveredSkillFile[]>;
    readSkillFileContent(filePath: string): Promise<string>;
    parseFrontmatter(content: string): ParsedFrontmatter | null;
}

export interface LintSkillFrontmatterInput {
    targetDir: string;
}

export interface LintSkillFrontmatterOutput {
    results: SkillLintResult[];
    totalSkills: number;
    totalErrors: number;
    totalWarnings: number;
}

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
        let parsed: ParsedFrontmatter | null = null;
        let diagnostics: SkillLintDiagnostic[] = [];

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
                ruleId: "skill/invalid-frontmatter",
            });
        }

        if (!parsed) {
            if (diagnostics.length === 0) {
                const hasDelimiters = hasFrontmatterDelimiters(content);
                const message = hasDelimiters
                    ? "Invalid YAML frontmatter. The content between --- delimiters could not be parsed as valid YAML."
                    : "Missing YAML frontmatter. Skill files must begin with --- delimited YAML frontmatter.";
                const ruleId = hasDelimiters
                    ? "skill/invalid-frontmatter"
                    : "skill/missing-frontmatter";
                diagnostics.push({
                    line: 1,
                    severity: "error",
                    message,
                    ruleId,
                });
            }

            return {
                filePath: skill.filePath,
                skillName: skill.skillName,
                diagnostics,
                valid: false,
            };
        }

        const frontmatterDiagnostics = this.validateFrontmatter(
            parsed,
            skill.skillName,
        );
        diagnostics = diagnostics.concat(frontmatterDiagnostics);

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

        const result = AgentSkillFrontmatterSchema.safeParse(parsed.data);

        if (!result.success) {
            for (const issue of result.error.issues) {
                const fieldName = issue.path[0]?.toString();
                const line = fieldName
                    ? (parsed.fieldLines.get(fieldName) ??
                      parsed.frontmatterStartLine)
                    : parsed.frontmatterStartLine;

                const ruleId = this.getRuleIdForField(
                    fieldName,
                    issue.code,
                    parsed.data,
                );

                diagnostics.push({
                    line,
                    severity: "error",
                    message: issue.message,
                    field: fieldName,
                    ruleId,
                });
            }
        }

        if (result.success && result.data.name !== parentDirName) {
            const nameLine =
                parsed.fieldLines.get("name") ?? parsed.frontmatterStartLine;
            diagnostics.push({
                line: nameLine,
                severity: "error",
                message: `Frontmatter name '${result.data.name}' must match parent directory name '${parentDirName}'`,
                field: "name",
                ruleId: "skill/name-mismatch",
            });
        }

        for (const field of RECOMMENDED_FIELDS) {
            if (parsed.data[field] === undefined) {
                diagnostics.push({
                    line: parsed.frontmatterStartLine,
                    severity: "warning",
                    message: `Recommended field '${field}' is missing`,
                    field,
                    ruleId: RECOMMENDED_FIELD_RULE_IDS[field],
                });
            }
        }

        return diagnostics;
    }

    private getRuleIdForField(
        fieldName: string | undefined,
        issueCode: string,
        inputData: Record<string, unknown>,
    ): string {
        // Check the actual input data for field presence rather than
        // relying on Zod message text which can change across versions.
        const isMissing =
            issueCode === "invalid_type" &&
            (fieldName === undefined || !Object.hasOwn(inputData, fieldName));

        if (fieldName === "name") {
            return isMissing
                ? "skill/missing-name"
                : "skill/invalid-name-format";
        }
        if (fieldName === "description") {
            return isMissing
                ? "skill/missing-description"
                : "skill/invalid-description";
        }
        return "skill/invalid-frontmatter";
    }
}

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
