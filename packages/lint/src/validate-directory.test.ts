import {
    chmod,
    mkdir,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    LintValidationError,
    validateDirectory,
} from "./validate-directory.js";

const chance = new Chance();

describe("validateDirectory", () => {
    let canonicalTmpBase: string;
    let tempDir: string;

    beforeEach(async () => {
        canonicalTmpBase = await realpath(tmpdir());
        tempDir = join(
            canonicalTmpBase,
            `validate-dir-test-${chance.hash({ length: 8 })}`,
        );
        await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("given a valid directory", () => {
        it("returns the canonicalized path", async () => {
            const result = await validateDirectory(tempDir);
            expect(result).toBe(tempDir);
        });
    });

    describe("given an empty string", () => {
        it("rejects with a LintValidationError", async () => {
            await expect(validateDirectory("")).rejects.toThrow(
                LintValidationError,
            );
        });

        it("includes a descriptive message", async () => {
            await expect(validateDirectory("")).rejects.toThrow(
                "directory must not be empty",
            );
        });
    });

    describe("given a path with null bytes", () => {
        it("rejects with a control character error", async () => {
            await expect(
                validateDirectory("/tmp/valid\0/../../etc"),
            ).rejects.toThrow("control characters");
        });
    });

    describe("given a path with ANSI escape sequences", () => {
        it("rejects with a control character error", async () => {
            await expect(validateDirectory("/tmp/\x1b[2Jevil")).rejects.toThrow(
                "control characters",
            );
        });
    });

    describe("given a path with a carriage return", () => {
        it("rejects to prevent CI log spoofing", async () => {
            await expect(
                validateDirectory("/tmp/evil\rAll checks passed"),
            ).rejects.toThrow("control characters");
        });
    });

    describe("given a path with a tab character", () => {
        it("rejects with a control character error", async () => {
            await expect(validateDirectory("/tmp/has\ttab")).rejects.toThrow(
                "control characters",
            );
        });
    });

    describe("given a path with a newline character", () => {
        it("rejects with a control character error", async () => {
            await expect(validateDirectory("/tmp/has\nline")).rejects.toThrow(
                "control characters",
            );
        });
    });

    describe("given a path with a Unicode right-to-left override", () => {
        it("rejects with a control character error", async () => {
            await expect(
                validateDirectory("/tmp/\u202Egranted"),
            ).rejects.toThrow("control characters");
        });
    });

    describe("given a path with a Unicode line separator", () => {
        it("rejects with a control character error", async () => {
            await expect(
                validateDirectory("/tmp/has\u2028line"),
            ).rejects.toThrow("control characters");
        });
    });

    describe("given a path with a C1 control character (NEL)", () => {
        it("rejects with a control character error", async () => {
            await expect(
                validateDirectory("/tmp/has\u0085nel"),
            ).rejects.toThrow("control characters");
        });
    });

    describe("error message sanitization", () => {
        it("does not reflect raw control characters in the error message", async () => {
            const ansiPath = "/tmp/\x1b[2Jevil";
            try {
                await validateDirectory(ansiPath);
            } catch (error: unknown) {
                const message = (error as Error).message;
                expect(message).not.toContain("\x1b");
                return;
            }
            expect.unreachable("expected an error to be thrown");
        });
    });

    describe("given a path with traversal segments", () => {
        it("rejects with a path traversal error", async () => {
            await expect(
                validateDirectory("/tmp/../etc/passwd"),
            ).rejects.toThrow("path traversal");
        });
    });

    describe("given a path with double dots in a filename", () => {
        it("does not falsely reject legitimate names like data..v2", async () => {
            const legitimateDir = join(tempDir, "data..v2");
            await mkdir(legitimateDir, { recursive: true });

            const result = await validateDirectory(legitimateDir);
            expect(result).toBe(legitimateDir);
        });
    });

    describe("given a path where a segment is a file not a directory", () => {
        it("rejects with a LintValidationError", async () => {
            const filePath = join(
                tempDir,
                `a-file-${chance.hash({ length: 8 })}`,
            );
            await writeFile(filePath, "just a file");
            const childPath = join(filePath, "child");

            await expect(validateDirectory(childPath)).rejects.toThrow(
                LintValidationError,
            );
        });

        it("includes a not-a-directory message", async () => {
            const filePath = join(
                tempDir,
                `a-file-${chance.hash({ length: 8 })}`,
            );
            await writeFile(filePath, "just a file");
            const childPath = join(filePath, "child");

            await expect(validateDirectory(childPath)).rejects.toThrow(
                "not a directory",
            );
        });
    });

    describe("given a non-existent directory", () => {
        it("rejects with a descriptive error", async () => {
            const nonExistent = join(
                canonicalTmpBase,
                `nonexistent-${chance.hash({ length: 12 })}`,
            );

            await expect(validateDirectory(nonExistent)).rejects.toThrow(
                "Directory does not exist",
            );
        });
    });

    describe("given a file path instead of a directory", () => {
        it("rejects with a not-a-directory error", async () => {
            const filePath = join(
                tempDir,
                `not-a-dir-${chance.hash({ length: 8 })}`,
            );
            await writeFile(filePath, "just a file");

            await expect(validateDirectory(filePath)).rejects.toThrow(
                "not a directory",
            );
        });
    });

    describe("given a symbolic link to a real directory", () => {
        it.skipIf(process.platform === "win32")(
            "follows the symlink and returns the canonical path",
            async () => {
                const realDir = join(
                    canonicalTmpBase,
                    `real-${chance.hash({ length: 8 })}`,
                );
                const linkPath = join(
                    canonicalTmpBase,
                    `link-${chance.hash({ length: 8 })}`,
                );
                await mkdir(realDir, { recursive: true });

                try {
                    await symlink(realDir, linkPath);
                    const result = await validateDirectory(linkPath);
                    expect(result).toBe(realDir);
                } finally {
                    await rm(linkPath, { force: true });
                    await rm(realDir, { recursive: true, force: true });
                }
            },
        );
    });

    describe("given a path through a symlinked parent", () => {
        it.skipIf(process.platform === "win32")(
            "follows the parent symlink and returns the canonical path",
            async () => {
                const realParent = join(
                    canonicalTmpBase,
                    `real-parent-${chance.hash({ length: 8 })}`,
                );
                const childDir = join(realParent, "child");
                const symlinkToParent = join(
                    canonicalTmpBase,
                    `symlink-parent-${chance.hash({ length: 8 })}`,
                );
                await mkdir(childDir, { recursive: true });

                try {
                    await symlink(realParent, symlinkToParent);
                    const result = await validateDirectory(
                        join(symlinkToParent, "child"),
                    );
                    expect(result).toBe(childDir);
                } finally {
                    await rm(symlinkToParent, { force: true });
                    await rm(realParent, { recursive: true, force: true });
                }
            },
        );
    });

    describe("given a directory with restricted parent permissions", () => {
        it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
            "propagates the EACCES error",
            async () => {
                const parentDir = join(
                    canonicalTmpBase,
                    `restricted-parent-${chance.hash({ length: 8 })}`,
                );
                const childDir = join(parentDir, "child");
                await mkdir(childDir, { recursive: true });

                try {
                    await chmod(parentDir, 0o000);
                    await expect(validateDirectory(childDir)).rejects.toSatisfy(
                        (error: NodeJS.ErrnoException) => {
                            return error.code === "EACCES";
                        },
                    );
                } finally {
                    await chmod(parentDir, 0o755);
                    await rm(parentDir, { recursive: true, force: true });
                }
            },
        );
    });
});
