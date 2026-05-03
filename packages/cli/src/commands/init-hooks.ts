import { createInitHooksConfigGateway } from "@lousy-agents/core/gateways/init-hooks-config-gateway.js";
import { InitHooksUseCase } from "@lousy-agents/core/use-cases/init-hooks-use-case.js";
import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";

export const initHooksCommand = defineCommand({
    meta: {
        name: "init-hooks",
        description:
            "Initialize Claude Code hook configuration for lousy-agents context injection",
    },
    args: {
        force: {
            type: "boolean",
            description:
                "Overwrite existing hook configuration even if already present",
            default: false,
        },
        "no-session-start": {
            type: "boolean",
            description:
                "Disable the SessionStart hook for invariant lesson injection (enabled by default)",
            default: false,
        },
    },
    run: async (context: CommandContext) => {
        const rootDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const force = context.args?.force === true;
        const noSessionStart = context.args?.["no-session-start"] === true;
        const addSessionStart = !noSessionStart;

        const gateway = createInitHooksConfigGateway();
        const useCase = new InitHooksUseCase(gateway);

        let result: Awaited<ReturnType<typeof useCase.execute>>;
        try {
            result = await useCase.execute({ rootDir, addSessionStart, force });
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error);
            consola.error(`init-hooks failed: ${message}`);
            process.exitCode = 1;
            return;
        }

        for (const filePath of result.written) {
            consola.success(`Written: ${filePath}`);
        }

        for (const filePath of result.skipped) {
            consola.info(
                `Skipped (already configured): ${filePath}. Use --force to overwrite.`,
            );
        }

        if (result.written.length === 0 && result.skipped.length === 0) {
            consola.info("No hook configuration files found to update.");
        }
    },
});
