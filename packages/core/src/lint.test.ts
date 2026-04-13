/**
 * Tests for the public lint API facade.
 * Validates that runLint orchestrates lint targets, applies config,
 * and provides a clean abstraction over internal lint infrastructure.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LintOptions, LintResult } from "./lint.js";
import { runLint } from "./lint.js";

const chance = new Chance();

describe("runLint", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = join(tmpdir(), `lint-test-${chance.hash({ length: 8 })}`);
        await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("given a valid empty project directory", () => {
        it("returns a result with no errors", async () => {
            // Arrange
            const options: LintOptions = { directory: tempDir };

            // Act
            const result = await runLint(options);

            // Assert
            expect(result.hasErrors).toBe(false);
            expect(result.outputs).toBeInstanceOf(Array);
            expect(result.outputs.length).toBe(4);
        });
    });

    describe("given selective targets", () => {
        it("lints only the specified targets", async () => {
            // Arrange
            const options: LintOptions = {
                directory: tempDir,
                targets: { skills: true },
            };

            // Act
            const result = await runLint(options);

            // Assert
            expect(result.outputs).toHaveLength(1);
            expect(result.outputs[0]?.target).toBe("skill");
        });

        it("lints multiple specified targets", async () => {
            // Arrange
            const options: LintOptions = {
                directory: tempDir,
                targets: { skills: true, agents: true },
            };

            // Act
            const result = await runLint(options);

            // Assert
            expect(result.outputs).toHaveLength(2);
            const targets = result.outputs.map((o) => o.target);
            expect(targets).toContain("skill");
            expect(targets).toContain("agent");
        });
    });

    describe("given a project with lint errors", () => {
        it("reports hasErrors as true when skill frontmatter is invalid", async () => {
            // Arrange — create a skill with missing required fields
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

            // Act
            const result = await runLint(options);

            // Assert
            expect(result.hasErrors).toBe(true);
            expect(result.outputs[0]?.diagnostics.length).toBeGreaterThan(0);
        });
    });

    describe("given an empty string directory", () => {
        it("rejects with a validation error", async () => {
            // Arrange
            const options: LintOptions = { directory: "" };

            // Act & Assert
            await expect(runLint(options)).rejects.toThrow();
        });
    });

    describe("given a directory with path traversal", () => {
        it("rejects with a validation error", async () => {
            // Arrange
            const options: LintOptions = { directory: "/tmp/../etc/passwd" };

            // Act & Assert
            await expect(runLint(options)).rejects.toThrow();
        });
    });

    describe("given a non-existent directory", () => {
        it("rejects with a validation error", async () => {
            // Arrange
            const nonExistent = join(
                tmpdir(),
                `nonexistent-${chance.hash({ length: 12 })}`,
            );

            // Act & Assert
            await expect(runLint({ directory: nonExistent })).rejects.toThrow();
        });
    });

    describe("given no targets specified (defaults to all)", () => {
        it("runs all four lint targets", async () => {
            // Arrange
            const options: LintOptions = { directory: tempDir };

            // Act
            const result = await runLint(options);

            // Assert
            const targets = result.outputs.map((o) => o.target);
            expect(targets).toContain("skill");
            expect(targets).toContain("agent");
            expect(targets).toContain("hook");
            expect(targets).toContain("instruction");
        });
    });

    describe("given all targets explicitly set to false", () => {
        it("runs all four lint targets (same as no flags)", async () => {
            // Arrange
            const options: LintOptions = {
                directory: tempDir,
                targets: {
                    skills: false,
                    agents: false,
                    hooks: false,
                    instructions: false,
                },
            };

            // Act
            const result = await runLint(options);

            // Assert
            expect(result.outputs).toHaveLength(4);
        });
    });

    describe("result structure", () => {
        it("each output contains expected summary fields", async () => {
            // Arrange & Act
            const result = await runLint({ directory: tempDir });

            // Assert
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
});
