// biome-ignore-all lint/style/useNamingConvention: environment variable names use snake_case
import Chance from "chance";
import { describe, expect, it } from "vitest";
import { captureEnv, captureTags } from "../src/env-capture.js";

const chance = new Chance();

describe("captureEnv", () => {
    describe("allowlisted npm lifecycle variables", () => {
        it("should capture npm_lifecycle_event and npm_lifecycle_script", () => {
            // Arrange
            const lifecycleEvent = chance.word();
            const lifecycleScript = chance.sentence();
            const env = {
                npm_lifecycle_event: lifecycleEvent,
                npm_lifecycle_script: lifecycleScript,
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result.npm_lifecycle_event).toBe(lifecycleEvent);
            expect(result.npm_lifecycle_script).toBe(lifecycleScript);
        });

        it("should capture npm_package_name and npm_package_version", () => {
            // Arrange
            const packageName = chance.word();
            const packageVersion = chance.semver();
            const env = {
                npm_package_name: packageName,
                npm_package_version: packageVersion,
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result.npm_package_name).toBe(packageName);
            expect(result.npm_package_version).toBe(packageVersion);
        });
    });

    describe("allowlisted exact-match variables", () => {
        it("should capture NODE_ENV", () => {
            // Arrange
            const nodeEnv = chance.pickone([
                "production",
                "development",
                "test",
            ]);
            const env = { NODE_ENV: nodeEnv };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result.NODE_ENV).toBe(nodeEnv);
        });

        it("should capture CI", () => {
            // Arrange
            const env = { CI: "true" };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result.CI).toBe("true");
        });
    });

    describe("allowlisted prefix variables", () => {
        it("should capture GITHUB_* prefixed variables", () => {
            // Arrange
            const repoName = chance.word();
            const runId = String(chance.integer({ min: 1000, max: 9999 }));
            const env = {
                GITHUB_REPOSITORY: repoName,
                GITHUB_RUN_ID: runId,
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result.GITHUB_REPOSITORY).toBe(repoName);
            expect(result.GITHUB_RUN_ID).toBe(runId);
        });

        it("should capture AGENTSHELL_* prefixed variables except AGENTSHELL_TAG_*", () => {
            // Arrange
            const debugValue = chance.word();
            const env = {
                AGENTSHELL_DEBUG: debugValue,
                AGENTSHELL_LOG_LEVEL: "info",
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result.AGENTSHELL_DEBUG).toBe(debugValue);
            expect(result.AGENTSHELL_LOG_LEVEL).toBe("info");
        });
    });

    describe("AGENTSHELL_TAG_* exclusion from env", () => {
        it("should exclude AGENTSHELL_TAG_* variables from env capture", () => {
            // Arrange
            const env = {
                AGENTSHELL_TAG_pr: "1234",
                AGENTSHELL_TAG_team: "platform",
                AGENTSHELL_DEBUG: "true",
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result).not.toHaveProperty("AGENTSHELL_TAG_pr");
            expect(result).not.toHaveProperty("AGENTSHELL_TAG_team");
            expect(result.AGENTSHELL_DEBUG).toBe("true");
        });
    });

    describe("blocklist filtering", () => {
        it("should exclude variables containing SECRET (case-insensitive)", () => {
            // Arrange
            const env = {
                GITHUB_SECRET_VALUE: chance.hash(),
                GITHUB_REPOSITORY: chance.word(),
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result).not.toHaveProperty("GITHUB_SECRET_VALUE");
            expect(result).toHaveProperty("GITHUB_REPOSITORY");
        });

        it("should exclude variables containing TOKEN, KEY, PASSWORD, CREDENTIAL", () => {
            // Arrange
            const env = {
                GITHUB_TOKEN: chance.hash(),
                GITHUB_API_KEY: chance.hash(),
                GITHUB_PASSWORD: chance.hash(),
                GITHUB_CREDENTIAL: chance.hash(),
                GITHUB_ACTIONS: "true",
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result).not.toHaveProperty("GITHUB_TOKEN");
            expect(result).not.toHaveProperty("GITHUB_API_KEY");
            expect(result).not.toHaveProperty("GITHUB_PASSWORD");
            expect(result).not.toHaveProperty("GITHUB_CREDENTIAL");
            expect(result.GITHUB_ACTIONS).toBe("true");
        });

        it("should match blocklist patterns case-insensitively", () => {
            // Arrange
            const env = {
                GITHUB_Secret_KEY: chance.hash(),
                GITHUB_REPOSITORY: chance.word(),
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result).not.toHaveProperty("GITHUB_Secret_KEY");
            expect(result).toHaveProperty("GITHUB_REPOSITORY");
        });
    });

    describe("non-allowlisted variables", () => {
        it("should exclude variables not matching any allowlist pattern", () => {
            // Arrange
            const env = {
                HOME: "/home/user",
                PATH: "/usr/bin",
                RANDOM_VAR: chance.word(),
                NODE_ENV: "test",
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result).not.toHaveProperty("HOME");
            expect(result).not.toHaveProperty("PATH");
            expect(result).not.toHaveProperty("RANDOM_VAR");
            expect(result.NODE_ENV).toBe("test");
        });
    });

    describe("value truncation", () => {
        it("should truncate values exceeding 1024 bytes and set _env_truncated flag", () => {
            // Arrange
            const longValue = "x".repeat(2000);
            const env = {
                GITHUB_LONG_VAR: longValue,
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result.GITHUB_LONG_VAR.length).toBeLessThan(
                longValue.length,
            );
            expect(result.GITHUB_LONG_VAR).toMatch(/…\[truncated\]$/);
            expect(result.GITHUB_LONG_VAR.length).toBe(
                1024 + "…[truncated]".length,
            );
            expect(result._env_truncated).toBe("true");
        });

        it("should not include _env_truncated when no values are truncated", () => {
            // Arrange
            const env = {
                NODE_ENV: "test",
                CI: "true",
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result).not.toHaveProperty("_env_truncated");
        });
    });

    describe("undefined values", () => {
        it("should skip environment variables with undefined values", () => {
            // Arrange
            const env: Record<string, string | undefined> = {
                NODE_ENV: undefined,
                CI: "true",
            };

            // Act
            const result = captureEnv(env);

            // Assert
            expect(result).not.toHaveProperty("NODE_ENV");
            expect(result.CI).toBe("true");
        });
    });
});

describe("captureTags", () => {
    describe("tag extraction", () => {
        it("should extract AGENTSHELL_TAG_* variables as tags", () => {
            // Arrange
            const prNumber = String(chance.integer({ min: 1, max: 9999 }));
            const env = {
                AGENTSHELL_TAG_pr: prNumber,
            };

            // Act
            const result = captureTags(env);

            // Assert
            expect(result.pr).toBe(prNumber);
        });

        it("should lowercase tag keys", () => {
            // Arrange
            const team = chance.word();
            const env = {
                AGENTSHELL_TAG_PR: "1234",
                AGENTSHELL_TAG_TEAM: team,
            };

            // Act
            const result = captureTags(env);

            // Assert
            expect(result.pr).toBe("1234");
            expect(result.team).toBe(team);
        });
    });

    describe("prototype pollution protection", () => {
        it("should return a null-prototype object", () => {
            // Arrange
            const env = {
                AGENTSHELL_TAG_safe: "value",
            };

            // Act
            const result = captureTags(env);

            // Assert
            expect(Object.getPrototypeOf(result)).toBeNull();
        });

        it("should drop __proto__, constructor, and prototype keys", () => {
            // Arrange
            const env = {
                AGENTSHELL_TAG___proto__: "evil",
                AGENTSHELL_TAG_constructor: "evil",
                AGENTSHELL_TAG_prototype: "evil",
                AGENTSHELL_TAG_safe: "value",
            };

            // Act
            const result = captureTags(env);

            // Assert
            expect(result).not.toHaveProperty("__proto__");
            expect(result).not.toHaveProperty("constructor");
            expect(result).not.toHaveProperty("prototype");
            expect(result.safe).toBe("value");
        });
    });

    describe("tag limits", () => {
        it("should limit to 50 tags sorted alphabetically", () => {
            // Arrange
            const env: Record<string, string> = {};
            const tagNames: string[] = [];
            for (let i = 0; i < 60; i++) {
                const tagName = `tag_${String(i).padStart(3, "0")}`;
                tagNames.push(tagName);
                env[`AGENTSHELL_TAG_${tagName}`] = chance.word();
            }

            // Act
            const result = captureTags(env);

            // Assert — should have 50 tags + _tags_truncated
            const keys = Object.keys(result).filter(
                (k) => k !== "_tags_truncated",
            );
            expect(keys.length).toBe(50);
            expect(result._tags_truncated).toBe("true");
        });

        it("should keep the first 50 tags when sorted alphabetically", () => {
            // Arrange
            const env: Record<string, string> = {};
            for (let i = 0; i < 55; i++) {
                const tagName = `tag_${String(i).padStart(3, "0")}`;
                env[`AGENTSHELL_TAG_${tagName}`] = `val_${i}`;
            }

            // Act
            const result = captureTags(env);

            // Assert — tag_050 through tag_054 should be excluded
            expect(result).toHaveProperty("tag_000");
            expect(result).toHaveProperty("tag_049");
            expect(result).not.toHaveProperty("tag_050");
        });
    });

    describe("tag value truncation", () => {
        it("should truncate tag values exceeding 1024 bytes", () => {
            // Arrange
            const longValue = "y".repeat(2000);
            const env = {
                AGENTSHELL_TAG_big: longValue,
            };

            // Act
            const result = captureTags(env);

            // Assert
            expect(result.big).toMatch(/…\[truncated\]$/);
            expect(result.big.length).toBe(1024 + "…[truncated]".length);
            expect(result._tags_truncated).toBe("true");
        });
    });

    describe("empty input", () => {
        it("should return empty null-prototype object when no AGENTSHELL_TAG_* vars present", () => {
            // Arrange
            const env = {
                NODE_ENV: "test",
                GITHUB_ACTIONS: "true",
            };

            // Act
            const result = captureTags(env);

            // Assert
            expect(Object.keys(result).length).toBe(0);
            expect(Object.getPrototypeOf(result)).toBeNull();
        });
    });

    describe("undefined values", () => {
        it("should skip tag variables with undefined values", () => {
            // Arrange
            const env: Record<string, string | undefined> = {
                AGENTSHELL_TAG_present: "yes",
                AGENTSHELL_TAG_missing: undefined,
            };

            // Act
            const result = captureTags(env);

            // Assert
            expect(result.present).toBe("yes");
            expect(result).not.toHaveProperty("missing");
        });
    });
});
