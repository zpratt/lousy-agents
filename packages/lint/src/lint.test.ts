import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LintOptions } from "./lint.js";
import { runLint } from "./lint.js";
import { LintValidationError } from "./validate-directory.js";

const chance = new Chance();

describe("runLint", () => {
    let tempDir: string;
    let canonicalTmpBase: string;

    beforeEach(async () => {
        canonicalTmpBase = await realpath(tmpdir());
        tempDir = join(
            canonicalTmpBase,
            `lint-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("given a valid empty project directory", () => {
        it("returns a result with no errors", async () => {
            const options: LintOptions = { directory: tempDir };

            const result = await runLint(options);

            expect(result.hasErrors).toBe(false);
            expect(result.outputs).toBeInstanceOf(Array);
            expect(result.outputs.length).toBe(4);
        });
    });

    describe("given selective targets", () => {
        it("lints only the specified targets", async () => {
            const options: LintOptions = {
                directory: tempDir,
                targets: { skills: true },
            };

            const result = await runLint(options);

            expect(result.outputs).toHaveLength(1);
            expect(result.outputs[0]?.target).toBe("skill");
        });

        it("lints multiple specified targets", async () => {
            const options: LintOptions = {
                directory: tempDir,
                targets: { skills: true, agents: true },
            };

            const result = await runLint(options);

            expect(result.outputs).toHaveLength(2);
            const targets = result.outputs.map((o) => o.target);
            expect(targets).toContain("skill");
            expect(targets).toContain("agent");
        });
    });

    describe("given a project with lint errors", () => {
        it("reports hasErrors as true when skill frontmatter is invalid", async () => {
            const skillDir = join(tempDir, ".github", "skills", "bad-skill");
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                "---\n---\n# No frontmatter fields",
            );

            const options: LintOptions = {
                directory: tempDir,
                targets: { skills: true },
            };

            const result = await runLint(options);

            expect(result.hasErrors).toBe(true);
            expect(result.outputs[0]?.diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe("given a project with only warnings and no errors", () => {
        it("reports hasErrors as false", async () => {
            const skillName = `warning-skill-${chance.hash({ length: 6 })}`;
            const skillDir = join(tempDir, ".github", "skills", skillName);
            await mkdir(skillDir, { recursive: true });
            await writeFile(
                join(skillDir, "SKILL.md"),
                [
                    "---",
                    `name: ${skillName}`,
                    `description: ${chance.sentence()}`,
                    "---",
                    "# Skill content",
                ].join("\n"),
            );

            const options: LintOptions = {
                directory: tempDir,
                targets: { skills: true },
            };

            const result = await runLint(options);

            expect(result.hasErrors).toBe(false);
            const warningCount = result.outputs[0]?.summary.totalWarnings ?? 0;
            expect(warningCount).toBeGreaterThan(0);
        });
    });

    describe("given an empty string directory", () => {
        it("rejects with a LintValidationError", async () => {
            await expect(runLint({ directory: "" })).rejects.toThrow(
                LintValidationError,
            );
        });
    });

    describe("given a directory with path traversal", () => {
        it("rejects with a LintValidationError", async () => {
            await expect(
                runLint({ directory: "/tmp/../etc/passwd" }),
            ).rejects.toThrow(LintValidationError);
        });
    });

    describe("given a non-existent directory", () => {
        it("rejects with a descriptive error about the missing directory", async () => {
            const nonExistent = join(
                canonicalTmpBase,
                `nonexistent-${chance.hash({ length: 12 })}`,
            );

            await expect(runLint({ directory: nonExistent })).rejects.toThrow(
                "Directory does not exist",
            );
        });
    });

    describe("given no targets specified (defaults to all)", () => {
        it("runs all four lint targets", async () => {
            const result = await runLint({ directory: tempDir });

            const targets = result.outputs.map((o) => o.target);
            expect(targets).toContain("skill");
            expect(targets).toContain("agent");
            expect(targets).toContain("hook");
            expect(targets).toContain("instruction");
        });
    });

    describe("given all targets explicitly set to false", () => {
        it("runs all four lint targets (same as no flags)", async () => {
            const options: LintOptions = {
                directory: tempDir,
                targets: {
                    skills: false,
                    agents: false,
                    hooks: false,
                    instructions: false,
                },
            };

            const result = await runLint(options);

            expect(result.outputs).toHaveLength(4);
        });
    });

    describe("result structure", () => {
        it("each output contains expected summary fields", async () => {
            const result = await runLint({ directory: tempDir });

            for (const output of result.outputs) {
                expect(output.summary).toHaveProperty("totalFiles");
                expect(output.summary).toHaveProperty("totalErrors");
                expect(output.summary).toHaveProperty("totalWarnings");
                expect(output.summary).toHaveProperty("totalInfos");
                expect(output).toHaveProperty("diagnostics");
                expect(output).toHaveProperty("target");
                expect(output).toHaveProperty("filesAnalyzed");
            }
        });
    });

    describe("given unknown keys in targets", () => {
        it("rejects with a LintValidationError (.strict() enforcement)", async () => {
            const options = {
                directory: tempDir,
                targets: { skills: true, unknown: true },
            } as LintOptions;

            await expect(runLint(options)).rejects.toThrow(LintValidationError);
        });
    });

    describe("given a directory path containing a null byte", () => {
        it("rejects with a control character error", async () => {
            await expect(
                runLint({ directory: `/tmp/valid\0/../../etc` }),
            ).rejects.toThrow("control characters");
        });
    });

    describe("given a directory path containing ANSI escape sequences", () => {
        it("rejects with a control character error", async () => {
            await expect(
                runLint({ directory: "/tmp/\x1b[2Jevil" }),
            ).rejects.toThrow("control characters");
        });
    });

    describe("given unknown keys at the top level", () => {
        it("rejects with a LintValidationError (.strict() enforcement)", async () => {
            const options = {
                directory: tempDir,
                extraKey: "should-fail",
            } as LintOptions;

            await expect(runLint(options)).rejects.toThrow(LintValidationError);
        });
    });
});
