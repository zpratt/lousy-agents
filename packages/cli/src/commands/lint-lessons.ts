import { createLessonFileGateway } from "@lousy-agents/core/gateways/lesson-file-gateway.js";
import type { LessonFileGatewayPort } from "@lousy-agents/core/use-cases/lesson-file-gateway-port.js";
import { LintLessonsUseCase } from "@lousy-agents/core/use-cases/lint-lessons-use-case.js";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";

export const lintLessonsCommand = defineCommand({
    meta: {
        name: "lessons",
        description:
            "Validate lesson files in .lousy-agents/lessons/ against the lesson schema",
    },
    run: async (context: CommandContext) => {
        const rootDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const gateway: LessonFileGatewayPort =
            (context.data?.gateway as LessonFileGatewayPort | undefined) ??
            createLessonFileGateway();
        const useCase = new LintLessonsUseCase(gateway);

        let result: Awaited<ReturnType<typeof useCase.execute>>;
        try {
            result = await useCase.execute({ rootDir });
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error);
            consola.error(`lint-lessons failed: ${message}`);
            process.exitCode = 1;
            return;
        }

        if (result.totalFiles === 0 && result.errors.length === 0) {
            consola.info(
                result.message ??
                    "No lessons configured in .lousy-agents/lessons/",
            );
            return;
        }

        if (result.totalFiles > 0) {
            consola.info(`Discovered ${result.totalFiles} lesson file(s)`);
        }

        for (const error of result.errors) {
            consola.error(`${error.filePath}: ${error.reason}`);
        }

        if (!result.valid) {
            consola.error(
                `lint-lessons failed: ${result.errors.length} error(s)`,
            );
            process.exitCode = 1;
            return;
        }

        consola.success("All lesson files passed lint checks");
    },
});
