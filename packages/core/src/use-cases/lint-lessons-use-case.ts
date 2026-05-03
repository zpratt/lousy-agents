import type { LessonFileGatewayPort } from "./lesson-file-gateway-port.js";

export interface LintLessonsInput {
    rootDir: string;
}

export interface LintLessonsError {
    filePath: string;
    reason: string;
}

export interface LintLessonsOutput {
    valid: boolean;
    errors: LintLessonsError[];
    totalFiles: number;
    message?: string;
}

export class LintLessonsUseCase {
    constructor(private readonly gateway: LessonFileGatewayPort) {}

    async execute(input: LintLessonsInput): Promise<LintLessonsOutput> {
        if (!input.rootDir) {
            throw new Error("Root directory is required");
        }

        let result: Awaited<ReturnType<typeof this.gateway.readLessons>>;
        try {
            result = await this.gateway.readLessons(input.rootDir);
        } catch (error: unknown) {
            const reason =
                error instanceof Error ? error.message : String(error);
            return {
                valid: false,
                errors: [{ filePath: input.rootDir, reason }],
                totalFiles: 0,
            };
        }

        const totalFiles = result.lessons.length + result.errors.length;
        const errors = result.errors.map((e) => ({
            filePath: e.filePath,
            reason: e.reason,
        }));

        if (totalFiles === 0) {
            return {
                valid: true,
                errors: [],
                totalFiles: 0,
                message: "No lessons configured in .lousy-agents/lessons/",
            };
        }

        return {
            valid: errors.length === 0,
            errors,
            totalFiles,
        };
    }
}
