// biome-ignore-all lint/style/useNamingConvention: env var names use UPPER_SNAKE_CASE

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    readActionInputs,
    validateDirectory,
    validateFilterMode,
    validateLevel,
    validateReporter,
} from "./validate-inputs.js";

const chance = new Chance();

describe("Action input validation", () => {
    let tempDir: string;

    beforeAll(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "action-test-"));
    });

    afterAll(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("directory validation", () => {
        describe("given a valid relative path", () => {
            it("should accept the current directory marker", async () => {
                const result = await validateDirectory(".");
                expect(result).toBeTruthy();
            });

            it("should accept a simple directory name", async () => {
                const result = await validateDirectory("packages");
                expect(result).toContain("packages");
            });

            it("should accept a nested relative path", async () => {
                const result = await validateDirectory("packages/action/src");
                expect(result).toContain("packages/action/src");
            });

            it("should accept a path with underscores and dots", async () => {
                const result = await validateDirectory(".github");
                expect(result).toContain(".github");
            });
        });

        describe("given an empty directory", () => {
            it("should reject with an error", async () => {
                await expect(validateDirectory("")).rejects.toThrow(
                    "directory input must not be empty",
                );
            });

            it("should reject whitespace-only input", async () => {
                await expect(validateDirectory("   ")).rejects.toThrow(
                    "directory input must not be empty",
                );
            });
        });

        describe("given a path traversal attempt", () => {
            it("should reject paths containing double dots", async () => {
                await expect(validateDirectory("../secret")).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });

            it("should reject nested traversal", async () => {
                await expect(
                    validateDirectory("foo/../../bar"),
                ).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });
        });

        describe("given an absolute path", () => {
            it("should reject paths starting with /", async () => {
                await expect(validateDirectory("/etc/passwd")).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });
        });

        describe("given a home-relative path", () => {
            it("should reject paths starting with ~", async () => {
                await expect(validateDirectory("~/Documents")).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });
        });

        describe("given the special dash value", () => {
            it("should reject the cd-previous marker", async () => {
                await expect(validateDirectory("-")).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });
        });

        describe("given a path with disallowed characters", () => {
            it("should reject paths with spaces", async () => {
                await expect(validateDirectory("my project")).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });

            it("should reject paths with semicolons", async () => {
                await expect(
                    validateDirectory("dir; rm -rf /"),
                ).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });
        });

        describe("given a non-existent directory", () => {
            it("should reject with a clear error", async () => {
                await expect(
                    validateDirectory("does-not-exist-xyz"),
                ).rejects.toThrow("directory input does not exist");
            });
        });

        describe("given a path that is a file, not a directory", () => {
            it("should reject with a clear error", async () => {
                const filePath = join(tempDir, "not-a-dir.txt");
                await writeFile(filePath, "hello");

                const originalCwd = process.cwd();
                process.chdir(tempDir);
                try {
                    await expect(
                        validateDirectory("not-a-dir.txt"),
                    ).rejects.toThrow("directory input is not a directory");
                } finally {
                    process.chdir(originalCwd);
                }
            });
        });
    });

    describe("reporter validation", () => {
        describe("given a valid reporter", () => {
            it("should accept github-pr-check", () => {
                expect(validateReporter("github-pr-check")).toBe(
                    "github-pr-check",
                );
            });

            it("should accept github-pr-review", () => {
                expect(validateReporter("github-pr-review")).toBe(
                    "github-pr-review",
                );
            });

            it("should accept github-check", () => {
                expect(validateReporter("github-check")).toBe("github-check");
            });
        });

        describe("given an invalid reporter", () => {
            it("should reject unknown reporter values", () => {
                const invalidReporter = chance.word();
                expect(() => validateReporter(invalidReporter)).toThrow(
                    `invalid reporter: ${invalidReporter}`,
                );
            });
        });
    });

    describe("filter mode validation", () => {
        describe("given a valid filter mode", () => {
            it("should accept added", () => {
                expect(validateFilterMode("added")).toBe("added");
            });

            it("should accept diff_context", () => {
                expect(validateFilterMode("diff_context")).toBe("diff_context");
            });

            it("should accept file", () => {
                expect(validateFilterMode("file")).toBe("file");
            });

            it("should accept nofilter", () => {
                expect(validateFilterMode("nofilter")).toBe("nofilter");
            });
        });

        describe("given an invalid filter mode", () => {
            it("should reject unknown filter mode values", () => {
                const invalidMode = chance.word();
                expect(() => validateFilterMode(invalidMode)).toThrow(
                    `invalid filter_mode: ${invalidMode}`,
                );
            });
        });
    });

    describe("level validation", () => {
        describe("given a valid level", () => {
            it("should accept info", () => {
                expect(validateLevel("info")).toBe("info");
            });

            it("should accept warning", () => {
                expect(validateLevel("warning")).toBe("warning");
            });

            it("should accept error", () => {
                expect(validateLevel("error")).toBe("error");
            });
        });

        describe("given an invalid level", () => {
            it("should reject unknown level values", () => {
                const invalidLevel = chance.word();
                expect(() => validateLevel(invalidLevel)).toThrow(
                    `invalid level: ${invalidLevel}`,
                );
            });
        });
    });

    describe("reading action inputs from environment", () => {
        describe("given default environment values", () => {
            it("should return inputs with defaults applied", async () => {
                const env: Record<string, string | undefined> = {
                    INPUT_DIRECTORY: ".",
                    INPUT_SKILLS: "false",
                    INPUT_AGENTS: "false",
                    INPUT_INSTRUCTIONS: "false",
                    INPUT_REPORTER: "github-pr-check",
                    INPUT_FILTER_MODE: "added",
                    INPUT_LEVEL: "info",
                };

                const result = await readActionInputs(env);

                expect(result.skills).toBe(false);
                expect(result.agents).toBe(false);
                expect(result.instructions).toBe(false);
                expect(result.reporter).toBe("github-pr-check");
                expect(result.filterMode).toBe("added");
                expect(result.level).toBe("info");
            });
        });

        describe("given skills flag enabled", () => {
            it("should set skills to true", async () => {
                const env: Record<string, string | undefined> = {
                    INPUT_DIRECTORY: ".",
                    INPUT_SKILLS: "true",
                    INPUT_AGENTS: "false",
                    INPUT_INSTRUCTIONS: "false",
                    INPUT_REPORTER: "github-pr-check",
                    INPUT_FILTER_MODE: "added",
                    INPUT_LEVEL: "info",
                };

                const result = await readActionInputs(env);

                expect(result.skills).toBe(true);
            });
        });

        describe("given missing environment variables", () => {
            it("should use defaults for missing values", async () => {
                const env: Record<string, string | undefined> = {};

                const result = await readActionInputs(env);

                expect(result.skills).toBe(false);
                expect(result.agents).toBe(false);
                expect(result.instructions).toBe(false);
                expect(result.reporter).toBe("github-pr-check");
                expect(result.filterMode).toBe("added");
                expect(result.level).toBe("info");
            });
        });

        describe("given an invalid directory", () => {
            it("should throw a validation error", async () => {
                const env: Record<string, string | undefined> = {
                    INPUT_DIRECTORY: "../escape",
                };

                await expect(readActionInputs(env)).rejects.toThrow(
                    "directory input must be a relative path within the workspace",
                );
            });
        });

        describe("given an invalid reporter", () => {
            it("should throw a validation error", async () => {
                const invalidReporter = chance.word();
                const env: Record<string, string | undefined> = {
                    INPUT_DIRECTORY: ".",
                    INPUT_REPORTER: invalidReporter,
                };

                await expect(readActionInputs(env)).rejects.toThrow(
                    `invalid reporter: ${invalidReporter}`,
                );
            });
        });
    });
});
