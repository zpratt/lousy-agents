/**
 * CLI command for linting agent skill frontmatter.
 * Discovers skills, validates frontmatter, and reports diagnostics.
 */

import type { CommandContext } from "citty";
import { defineCommand } from "citty";
import { consola } from "consola";
import { createSkillLintGateway } from "../gateways/skill-lint-gateway.js";
import { LintSkillFrontmatterUseCase } from "../use-cases/lint-skill-frontmatter.js";

/**
 * The `lint` command for validating agent skill files.
 */
export const lintCommand = defineCommand({
    meta: {
        name: "lint",
        description:
            "Lint agent skill frontmatter. Validates required and recommended fields in SKILL.md files.",
    },
    run: async (context: CommandContext) => {
        const targetDir =
            typeof context.data?.targetDir === "string"
                ? context.data.targetDir
                : process.cwd();

        const gateway = createSkillLintGateway();
        const useCase = new LintSkillFrontmatterUseCase(gateway);

        const output = await useCase.execute({ targetDir });

        if (output.totalSkills === 0) {
            consola.info("No skills found in .github/skills/");
            return;
        }

        consola.info(`Discovered ${output.totalSkills} skill(s)`);

        for (const result of output.results) {
            if (result.diagnostics.length === 0) {
                consola.success(`${result.filePath}: OK`);
                continue;
            }

            for (const diagnostic of result.diagnostics) {
                const prefix = `${result.filePath}:${diagnostic.line}`;
                const fieldInfo = diagnostic.field
                    ? ` [${diagnostic.field}]`
                    : "";

                if (diagnostic.severity === "error") {
                    consola.error(
                        `${prefix}${fieldInfo}: ${diagnostic.message}`,
                    );
                } else {
                    consola.warn(
                        `${prefix}${fieldInfo}: ${diagnostic.message}`,
                    );
                }
            }
        }

        if (output.totalErrors > 0) {
            throw new Error(
                `Skill lint failed: ${output.totalErrors} error(s), ${output.totalWarnings} warning(s)`,
            );
        }

        if (output.totalWarnings > 0) {
            consola.warn(
                `Skill lint passed with ${output.totalWarnings} warning(s)`,
            );
        } else {
            consola.success("All skills passed lint checks");
        }
    },
});
