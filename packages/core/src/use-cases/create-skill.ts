/**
 * Use case for creating GitHub Copilot Agent Skills.
 * Orchestrates entity logic with gateway operations.
 */

import { z } from "zod";
import { generateSkillContent, normalizeSkillName } from "../entities/skill.js";
import type { SkillFileGateway } from "../gateways/skill-file-gateway.js";

/**
 * Schema for validating skill name input
 * Validates that the input is a non-empty string with reasonable constraints
 */
const SkillNameSchema = z
    .string()
    .min(1, "Skill name is required")
    .max(100, "Skill name must be 100 characters or less")
    .regex(
        /^[a-zA-Z0-9\s_-]+$/,
        "Skill name can only contain letters, numbers, spaces, hyphens, and underscores",
    );

/**
 * Result of the create skill operation
 */
export interface CreateSkillResult {
    success: boolean;
    normalizedName?: string;
    skillDirectoryPath?: string;
    skillFilePath?: string;
    error?: string;
}

/**
 * Use case for creating a new Agent Skill
 */
export class CreateSkillUseCase {
    constructor(private readonly gateway: SkillFileGateway) {}

    /**
     * Executes the create skill operation
     * @param targetDir The root directory of the repository
     * @param skillName The name of the skill to create
     * @returns Result of the operation
     */
    async execute(
        targetDir: string,
        skillName: string,
    ): Promise<CreateSkillResult> {
        // Validate the skill name using Zod schema
        const validationResult = SkillNameSchema.safeParse(skillName);
        if (!validationResult.success) {
            const errorMessage =
                validationResult.error.issues[0]?.message ??
                "Invalid skill name";
            return {
                success: false,
                error: errorMessage,
            };
        }

        // Normalize the skill name
        const normalizedName = normalizeSkillName(validationResult.data);

        // Validate that the normalized name is not empty (handles whitespace-only input)
        if (!normalizedName) {
            return {
                success: false,
                error: "Skill name is required",
            };
        }

        // Get the paths
        const skillDirectoryPath = this.gateway.getSkillDirectoryPath(
            targetDir,
            normalizedName,
        );
        const skillFilePath = this.gateway.getSkillFilePath(
            targetDir,
            normalizedName,
        );

        // Check if the skill directory already exists
        if (
            await this.gateway.skillDirectoryExists(targetDir, normalizedName)
        ) {
            return {
                success: false,
                error: `Skill already exists: ${skillDirectoryPath}`,
                skillDirectoryPath,
            };
        }

        // Ensure the skill directory exists
        await this.gateway.ensureSkillDirectory(targetDir, normalizedName);

        // Generate the content
        const content = generateSkillContent(normalizedName);

        // Write the SKILL.md file
        await this.gateway.writeSkillFile(targetDir, normalizedName, content);

        return {
            success: true,
            normalizedName,
            skillDirectoryPath,
            skillFilePath,
        };
    }
}
