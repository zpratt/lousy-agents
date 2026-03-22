// biome-ignore-all lint/style/useNamingConvention: env var names use UPPER_SNAKE_CASE
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import {
    createGetRepositoryRoot,
    type GitCommandExecutor,
} from "../src/git-utils.js";

const chance = new Chance();

describe("Repository root discovery", () => {
    describe("given a successful git command returning an absolute path", () => {
        it("returns the trimmed repository root", () => {
            // Arrange
            const expectedRoot = `/home/${chance.word()}/${chance.word()}`;
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue(`${expectedRoot}\n`);

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);
            const result = getRepositoryRoot();

            // Assert
            expect(result).toBe(expectedRoot);
        });
    });

    describe("given the git command fails", () => {
        it("throws a descriptive error", () => {
            // Arrange
            const executor: GitCommandExecutor = vi
                .fn()
                .mockImplementation(() => {
                    throw new Error("git command failed");
                });

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Assert
            expect(() => getRepositoryRoot()).toThrow(
                "Failed to discover repository root",
            );
        });
    });

    describe("given the git command returns a non-absolute path", () => {
        it("throws a descriptive error", () => {
            // Arrange
            const relativePath = `${chance.word()}/${chance.word()}`;
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue(relativePath);

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Assert
            expect(() => getRepositoryRoot()).toThrow(
                "Expected an absolute path from git but received:",
            );
        });
    });

    describe("given the git command returns an empty string", () => {
        it("throws a descriptive error", () => {
            // Arrange
            const executor: GitCommandExecutor = vi.fn().mockReturnValue("");

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Assert
            expect(() => getRepositoryRoot()).toThrow(
                "Expected an absolute path from git but received:",
            );
        });
    });

    describe("given the git command returns output with embedded newlines", () => {
        it("throws a descriptive error about control characters", () => {
            // Arrange
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue("/valid/path\n/evil/path");

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Assert
            expect(() => getRepositoryRoot()).toThrow(
                "Repository root path contains unexpected control characters",
            );
        });
    });

    describe("given the git command returns output with embedded carriage returns", () => {
        it("throws a descriptive error about control characters", () => {
            // Arrange
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue("/valid/path\r/evil/path");

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Assert
            expect(() => getRepositoryRoot()).toThrow(
                "Repository root path contains unexpected control characters",
            );
        });
    });

    describe("given the git command returns output with other ASCII control characters", () => {
        it("throws a descriptive error about control characters, not the raw output", () => {
            // Arrange — ESC (\x1b) is a control character that is not \n or \r
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue("/valid/path\x1b[31minjected");

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Assert
            expect(() => getRepositoryRoot()).toThrow(
                "Repository root path contains unexpected control characters",
            );
        });
    });

    describe("given the git command returns a non-absolute path with embedded newlines", () => {
        it("throws a descriptive error about control characters, not the raw output", () => {
            // Arrange
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue("relative\n/evil/path");

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Assert
            expect(() => getRepositoryRoot()).toThrow(
                "Repository root path contains unexpected control characters",
            );
        });
    });

    describe("given the git command returns a path with traversal sequences", () => {
        it("normalizes the path by resolving traversal sequences", () => {
            // Arrange
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue("/home/user/../user/project\n");

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);
            const result = getRepositoryRoot();

            // Assert
            expect(result).toBe("/home/user/project");
        });
    });

    describe("given the git command has already succeeded", () => {
        it("returns the cached result without re-executing", () => {
            // Arrange
            const expectedRoot = `/home/${chance.word()}`;
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue(`${expectedRoot}\n`);

            const getRepositoryRoot = createGetRepositoryRoot(executor);

            // Act
            getRepositoryRoot();
            const secondResult = getRepositoryRoot();

            // Assert
            expect(secondResult).toBe(expectedRoot);
            expect(executor).toHaveBeenCalledTimes(1);
        });
    });

    describe("given environment contains git-related variables", () => {
        it("removes all git-related environment variables from the executor environment", () => {
            // Arrange
            const expectedRoot = `/home/${chance.word()}`;
            let capturedEnv: Record<string, string | undefined> = {};
            const executor: GitCommandExecutor = vi
                .fn()
                .mockImplementation(
                    (env: Record<string, string | undefined>) => {
                        capturedEnv = env;
                        return expectedRoot;
                    },
                );

            const env: Record<string, string | undefined> = {
                HOME: `/home/${chance.word()}`,
                PATH: "/usr/bin",
                GIT_DIR: "/some/git/dir",
                GIT_WORK_TREE: "/some/work/tree",
                GIT_COMMON_DIR: "/some/common/dir",
                GIT_INDEX_FILE: "/some/index/file",
                GIT_CONFIG_GLOBAL: "/some/config/global",
                GIT_CONFIG_SYSTEM: "/some/config/system",
                GIT_CONFIG_NOSYSTEM: "1",
            };

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor, env);
            getRepositoryRoot();

            // Assert
            expect(capturedEnv).not.toHaveProperty("GIT_DIR");
            expect(capturedEnv).not.toHaveProperty("GIT_WORK_TREE");
            expect(capturedEnv).not.toHaveProperty("GIT_COMMON_DIR");
            expect(capturedEnv).not.toHaveProperty("GIT_INDEX_FILE");
            expect(capturedEnv).not.toHaveProperty("GIT_CONFIG_GLOBAL");
            expect(capturedEnv).not.toHaveProperty("GIT_CONFIG_SYSTEM");
            expect(capturedEnv).not.toHaveProperty("GIT_CONFIG_NOSYSTEM");
            expect(capturedEnv).toHaveProperty("HOME");
            expect(capturedEnv).toHaveProperty("PATH");
        });
    });

    describe("given the git command returns output with extra whitespace", () => {
        it("trims leading and trailing whitespace from the result", () => {
            // Arrange
            const expectedRoot = `/home/${chance.word()}`;
            const executor: GitCommandExecutor = vi
                .fn()
                .mockReturnValue(`  ${expectedRoot}  \n`);

            // Act
            const getRepositoryRoot = createGetRepositoryRoot(executor);
            const result = getRepositoryRoot();

            // Assert
            expect(result).toBe(expectedRoot);
        });
    });
});
