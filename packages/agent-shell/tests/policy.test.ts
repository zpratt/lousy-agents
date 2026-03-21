// biome-ignore-all lint/style/useNamingConvention: env var names use SCREAMING_SNAKE_CASE
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import { evaluatePolicy, loadPolicy, type PolicyDeps } from "../src/policy.js";
import type { PolicyConfig } from "../src/types.js";

const chance = new Chance();

const DEFAULT_POLICY_PATH = ".github/hooks/agent-shell/policy.json";

function buildPolicyDeps(overrides: Partial<PolicyDeps> = {}): PolicyDeps {
    const repoRoot = "/fake/repo";
    return {
        realpath: vi.fn(async (p: string) => p),
        readFile: vi.fn(async () => "{}"),
        getRepositoryRoot: vi.fn(() => repoRoot),
        ...overrides,
    };
}

function enoentError(): Error {
    const err = new Error("ENOENT: no such file or directory") as Error & {
        code: string;
    };
    err.code = "ENOENT";
    return err;
}

describe("evaluatePolicy", () => {
    describe("given a null policy (no file)", () => {
        it("should allow the command", () => {
            // Arrange
            const command = chance.sentence();

            // Act
            const result = evaluatePolicy(null, command);

            // Assert
            expect(result).toEqual({ decision: "allow", matchedRule: null });
        });
    });

    describe("given an empty policy (no deny, no allow)", () => {
        it("should allow the command", () => {
            // Arrange
            const policy: PolicyConfig = { deny: [] };
            const command = chance.sentence();

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({ decision: "allow", matchedRule: null });
        });
    });

    describe("given a command that exactly matches a deny rule", () => {
        it("should deny with the matched rule", () => {
            // Arrange
            const denyRule = `npm run ${chance.word()}`;
            const policy: PolicyConfig = { deny: [denyRule] };

            // Act
            const result = evaluatePolicy(policy, denyRule);

            // Assert
            expect(result).toEqual({
                decision: "deny",
                matchedRule: denyRule,
            });
        });
    });

    describe("given a command that matches a deny rule with glob wildcard", () => {
        it("should deny with the matched rule", () => {
            // Arrange
            const suffix = chance.word();
            const denyRule = "npm run deploy*";
            const command = `npm run deploy${suffix}`;
            const policy: PolicyConfig = { deny: [denyRule] };

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({
                decision: "deny",
                matchedRule: denyRule,
            });
        });
    });

    describe("given a command that does not match any deny rule", () => {
        it("should allow the command", () => {
            // Arrange
            const policy: PolicyConfig = {
                deny: ["rm -rf *", "terraform destroy*"],
            };
            const command = "npm test";

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({ decision: "allow", matchedRule: null });
        });
    });

    describe("given an allow list and a command that matches an allow rule", () => {
        it("should allow the command", () => {
            // Arrange
            const command = "npm test";
            const policy: PolicyConfig = {
                allow: ["npm test", "npm run lint*"],
                deny: [],
            };

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({ decision: "allow", matchedRule: null });
        });
    });

    describe("given an allow list and a command that does not match any allow rule", () => {
        it("should deny with null matchedRule", () => {
            // Arrange
            const command = "npm run deploy production";
            const policy: PolicyConfig = {
                allow: ["npm test", "npm run lint*"],
                deny: [],
            };

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({ decision: "deny", matchedRule: null });
        });
    });

    describe("given a command that matches both a deny rule and an allow rule", () => {
        it("should deny because deny takes precedence", () => {
            // Arrange
            const command = "npm run deploy";
            const policy: PolicyConfig = {
                allow: ["npm run *"],
                deny: ["npm run deploy"],
            };

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({
                decision: "deny",
                matchedRule: "npm run deploy",
            });
        });
    });

    describe("given a command with leading and trailing whitespace", () => {
        it("should trim the command before matching", () => {
            // Arrange
            const denyRule = "rm -rf /";
            const policy: PolicyConfig = { deny: [denyRule] };
            const command = "  rm -rf /  ";

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({
                decision: "deny",
                matchedRule: denyRule,
            });
        });
    });

    describe("given a command with Unicode whitespace", () => {
        it("should trim Unicode whitespace before matching", () => {
            // Arrange
            const denyRule = "rm -rf /";
            const policy: PolicyConfig = { deny: [denyRule] };
            // \u2003 = em space, \u00A0 = no-break space
            const command = "\u2003rm -rf /\u00A0";

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({
                decision: "deny",
                matchedRule: denyRule,
            });
        });
    });

    describe("given a deny rule containing regex special characters", () => {
        it("should treat them as literal characters, not regex operators", () => {
            // Arrange
            const denyRule = "echo hello.world (test)";
            const policy: PolicyConfig = { deny: [denyRule] };

            // Act
            const result = evaluatePolicy(policy, denyRule);

            // Assert
            expect(result).toEqual({
                decision: "deny",
                matchedRule: denyRule,
            });
        });
    });

    describe("given a deny rule with a glob that should not match a substring", () => {
        it("should require the entire command to match, not just a prefix", () => {
            // Arrange — rule "npm test" should NOT match "npm test && rm -rf /"
            const policy: PolicyConfig = { deny: ["npm test"] };
            const command = "npm test && rm -rf /";

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert — exact match fails, so it's allowed
            expect(result).toEqual({ decision: "allow", matchedRule: null });
        });
    });

    describe("given an allow list with a glob pattern", () => {
        it("should allow commands matching the glob", () => {
            // Arrange
            const policy: PolicyConfig = {
                allow: ["npm run lint*"],
                deny: [],
            };
            const command = "npm run lint:fix";

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({ decision: "allow", matchedRule: null });
        });
    });

    describe("given allow is undefined (absent) and no deny match", () => {
        it("should allow (no allow-list filtering)", () => {
            // Arrange — allow is undefined, not empty array
            const policy: PolicyConfig = { deny: ["rm -rf *"] };
            const command = "npm test";

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({ decision: "allow", matchedRule: null });
        });
    });

    describe("given allow is an empty array and no deny match", () => {
        it("should deny because empty allow list matches nothing", () => {
            // Arrange — allow is [] (empty), distinct from undefined
            const policy: PolicyConfig = { allow: [], deny: [] };
            const command = "npm test";

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert
            expect(result).toEqual({ decision: "deny", matchedRule: null });
        });
    });
});

describe("loadPolicy", () => {
    describe("given a valid policy file at the default location", () => {
        it("should return the parsed policy", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const expectedPolicy: PolicyConfig = {
                deny: ["rm -rf *"],
            };
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () =>
                    JSON.stringify({ deny: ["rm -rf *"] }),
                ),
            });

            // Act
            const result = await loadPolicy({}, deps);

            // Assert
            expect(result).toEqual(expectedPolicy);
            expect(deps.readFile).toHaveBeenCalledWith(
                `${repoRoot}/${DEFAULT_POLICY_PATH}`,
                "utf-8",
            );
        });
    });

    describe("given the policy file does not exist", () => {
        it("should return null", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => {
                    if (p === repoRoot) return repoRoot;
                    throw enoentError();
                }),
            });

            // Act
            const result = await loadPolicy({}, deps);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("given the policy file contains invalid JSON", () => {
        it("should throw a descriptive error", async () => {
            // Arrange
            const deps = buildPolicyDeps({
                readFile: vi.fn(async () => "not valid json{{{"),
            });

            // Act & Assert
            await expect(loadPolicy({}, deps)).rejects.toThrow(
                /invalid.*json/i,
            );
        });
    });

    describe("given AGENTSHELL_POLICY_PATH points to a non-existent file", () => {
        it("should throw an error instead of silently returning null", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const customPath = "custom/missing-policy.json";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => {
                    if (p === repoRoot) return repoRoot;
                    throw enoentError();
                }),
            });

            // Act & Assert
            await expect(
                loadPolicy({ AGENTSHELL_POLICY_PATH: customPath }, deps),
            ).rejects.toThrow(/does not exist/i);
        });
    });

    describe("given AGENTSHELL_POLICY_PATH env var overrides the default path", () => {
        it("should use the overridden path relative to repo root", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const customPath = "custom/policy.json";
            const expectedFullPath = `${repoRoot}/${customPath}`;
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () => JSON.stringify({ deny: [] })),
            });

            // Act
            await loadPolicy({ AGENTSHELL_POLICY_PATH: customPath }, deps);

            // Assert
            expect(deps.realpath).toHaveBeenCalledWith(expectedFullPath);
        });
    });

    describe("given AGENTSHELL_POLICY_PATH is an absolute path within repo root", () => {
        it("should resolve and accept the path", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const absolutePath = "/fake/repo/custom/policy.json";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () => JSON.stringify({ deny: [] })),
            });

            // Act
            const result = await loadPolicy(
                { AGENTSHELL_POLICY_PATH: absolutePath },
                deps,
            );

            // Assert
            expect(result).toEqual({ deny: [] });
        });
    });

    describe("given the resolved policy path is outside the repository root", () => {
        it("should throw a descriptive error", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => {
                    if (p === repoRoot) return repoRoot;
                    return "/etc/evil-policy.json";
                }),
            });

            // Act & Assert
            await expect(loadPolicy({}, deps)).rejects.toThrow(
                /outside.*repository/i,
            );
        });
    });

    describe("given a symlink that points outside the repository root", () => {
        it("should throw a descriptive error", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => {
                    if (p === repoRoot) return repoRoot;
                    return "/other/repo/policy.json";
                }),
            });

            // Act & Assert
            await expect(loadPolicy({}, deps)).rejects.toThrow(
                /outside.*repository/i,
            );
        });
    });

    describe("given AGENTSHELL_POLICY_PATH with path traversal", () => {
        it("should throw after realpath resolves outside repo", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => {
                    if (p === repoRoot) return repoRoot;
                    return "/etc/passwd";
                }),
            });

            // Act & Assert
            await expect(
                loadPolicy(
                    { AGENTSHELL_POLICY_PATH: "../../etc/passwd" },
                    deps,
                ),
            ).rejects.toThrow(/outside.*repository/i);
        });
    });

    describe("given the policy file has valid JSON but invalid schema", () => {
        it("should throw a descriptive error", async () => {
            // Arrange
            const deps = buildPolicyDeps({
                readFile: vi.fn(async () =>
                    JSON.stringify({ deny: [123, true] }),
                ),
            });

            // Act & Assert
            await expect(loadPolicy({}, deps)).rejects.toThrow();
        });
    });

    describe("given realpath throws a non-ENOENT error", () => {
        it("should propagate the error", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const permError = new Error(
                "EACCES: permission denied",
            ) as Error & {
                code: string;
            };
            permError.code = "EACCES";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => {
                    if (p === repoRoot) return repoRoot;
                    throw permError;
                }),
            });

            // Act & Assert
            await expect(loadPolicy({}, deps)).rejects.toThrow(
                /permission denied/i,
            );
        });
    });

    describe("given AGENTSHELL_POLICY_PATH is an empty string", () => {
        it("should fall back to the default path", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () => JSON.stringify({ deny: [] })),
            });

            // Act
            await loadPolicy({ AGENTSHELL_POLICY_PATH: "" }, deps);

            // Assert
            expect(deps.realpath).toHaveBeenCalledWith(
                `${repoRoot}/${DEFAULT_POLICY_PATH}`,
            );
        });
    });
});

describe("matchesRule (via evaluatePolicy) ReDoS resistance", () => {
    describe("given a rule with many wildcards and a long non-matching command", () => {
        it("should complete without hanging and return the correct decision", () => {
            // Arrange — this pattern causes catastrophic backtracking with regex
            const rule = `${"a*".repeat(20)}b`;
            const command = "a".repeat(100);
            const policy: PolicyConfig = { deny: [rule] };

            // Act
            const result = evaluatePolicy(policy, command);

            // Assert — should not hang, and should allow the non-matching command
            expect(result.decision).toBe("allow");
            expect(result.matchedRule).toBeNull();
        });
    });
});

describe("loadPolicy TOCTOU and error propagation", () => {
    describe("given realpath succeeds but readFile throws ENOENT (TOCTOU race, default path)", () => {
        it("should return null gracefully", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () => {
                    throw enoentError();
                }),
            });

            // Act
            const result = await loadPolicy({}, deps);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe("given realpath succeeds but readFile throws ENOENT with AGENTSHELL_POLICY_PATH set (TOCTOU race, override path)", () => {
        it("should throw instead of returning null (fail-closed)", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const customPath = "custom/policy.json";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () => {
                    throw enoentError();
                }),
            });

            // Act & Assert
            await expect(
                loadPolicy({ AGENTSHELL_POLICY_PATH: customPath }, deps),
            ).rejects.toThrow(/does not exist/i);
        });
    });

    describe("given AGENTSHELL_POLICY_PATH contains control characters (log injection attempt)", () => {
        it("should not embed raw control characters in the error message when realpath fails", async () => {
            // Arrange — newline in the override path is the canonical log-injection payload
            const maliciousPath = "custom/policy.json\nINJECTED: fake log line";
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => {
                    if (p === repoRoot) return repoRoot;
                    throw enoentError();
                }),
            });

            // Act & Assert — message must not contain a raw newline
            const error = await loadPolicy(
                { AGENTSHELL_POLICY_PATH: maliciousPath },
                deps,
            ).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).not.toMatch(/\n/);
        });

        it("should not embed raw control characters in the error message when path escapes repo root", async () => {
            // Arrange
            const maliciousPath = "/outside/repo\nINJECTED: fake log line";
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
            });

            // Act & Assert
            const error = await loadPolicy(
                { AGENTSHELL_POLICY_PATH: maliciousPath },
                deps,
            ).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).not.toMatch(/\n/);
        });

        it("should not embed raw control characters in the error message on TOCTOU readFile ENOENT", async () => {
            // Arrange
            const maliciousPath = "custom/policy.json\nINJECTED: fake log line";
            const repoRoot = "/fake/repo";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () => {
                    throw enoentError();
                }),
            });

            // Act & Assert
            const error = await loadPolicy(
                { AGENTSHELL_POLICY_PATH: maliciousPath },
                deps,
            ).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).not.toMatch(/\n/);
        });
    });

    describe("given readFile throws a non-ENOENT error", () => {
        it("should propagate the error", async () => {
            // Arrange
            const repoRoot = "/fake/repo";
            const permError = new Error(
                "EACCES: permission denied",
            ) as Error & {
                code: string;
            };
            permError.code = "EACCES";
            const deps = buildPolicyDeps({
                getRepositoryRoot: vi.fn(() => repoRoot),
                realpath: vi.fn(async (p: string) => p),
                readFile: vi.fn(async () => {
                    throw permError;
                }),
            });

            // Act & Assert
            await expect(loadPolicy({}, deps)).rejects.toThrow(
                /permission denied/i,
            );
        });
    });
});
