import type { Octokit } from "@octokit/rest";
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import {
    type ExecFunction,
    OctokitRulesetGateway,
    parseRepoFromRemoteUrl,
} from "./github-ruleset-gateway.js";

const chance = new Chance();

/**
 * Creates a mock Octokit instance with the specified method overrides.
 */
function createMockOctokit(
    overrides: {
        getAuthenticated?: () => Promise<unknown>;
        getRepoRulesets?: (args: unknown) => Promise<unknown>;
        createRepoRuleset?: (args: unknown) => Promise<unknown>;
        get?: (args: unknown) => Promise<unknown>;
    } = {},
): Octokit {
    return {
        rest: {
            users: {
                getAuthenticated:
                    overrides.getAuthenticated ??
                    vi.fn().mockResolvedValue({ data: {} }),
            },
            repos: {
                getRepoRulesets:
                    overrides.getRepoRulesets ??
                    vi.fn().mockResolvedValue({ data: [] }),
                createRepoRuleset:
                    overrides.createRepoRuleset ??
                    vi.fn().mockResolvedValue({ data: {} }),
                get:
                    overrides.get ??
                    vi.fn().mockResolvedValue({ data: {} }),
            },
        },
    } as never;
}

describe("GitHub Ruleset Gateway", () => {
    describe("parseRepoFromRemoteUrl", () => {
        describe("when given an HTTPS remote URL", () => {
            it("should extract owner and repo", () => {
                // Arrange
                const owner = chance.word();
                const repo = chance.word();

                // Act
                const result = parseRepoFromRemoteUrl(
                    `https://github.com/${owner}/${repo}.git`,
                );

                // Assert
                expect(result).toEqual({ owner, repo });
            });
        });

        describe("when given an HTTPS URL without .git suffix", () => {
            it("should extract owner and repo", () => {
                // Arrange
                const owner = chance.word();
                const repo = chance.word();

                // Act
                const result = parseRepoFromRemoteUrl(
                    `https://github.com/${owner}/${repo}`,
                );

                // Assert
                expect(result).toEqual({ owner, repo });
            });
        });

        describe("when given an SSH remote URL", () => {
            it("should extract owner and repo", () => {
                // Arrange
                const owner = chance.word();
                const repo = chance.word();

                // Act
                const result = parseRepoFromRemoteUrl(
                    `git@github.com:${owner}/${repo}.git`,
                );

                // Assert
                expect(result).toEqual({ owner, repo });
            });
        });

        describe("when given an invalid URL", () => {
            it("should return null", () => {
                // Act
                const result = parseRepoFromRemoteUrl("not-a-url");

                // Assert
                expect(result).toBeNull();
            });
        });
    });

    describe("OctokitRulesetGateway", () => {
        describe("isAuthenticated", () => {
            describe("when Octokit is authenticated", () => {
                it("should return true", async () => {
                    // Arrange
                    const mockOctokit = createMockOctokit({
                        getAuthenticated: vi
                            .fn()
                            .mockResolvedValue({ data: { login: "user" } }),
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act
                    const result = await gateway.isAuthenticated();

                    // Assert
                    expect(result).toBe(true);
                });
            });

            describe("when Octokit authentication fails", () => {
                it("should return false", async () => {
                    // Arrange
                    const mockOctokit = createMockOctokit({
                        getAuthenticated: vi
                            .fn()
                            .mockRejectedValue(new Error("Bad credentials")),
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act
                    const result = await gateway.isAuthenticated();

                    // Assert
                    expect(result).toBe(false);
                });
            });

            describe("when no Octokit instance is provided", () => {
                it("should return false", async () => {
                    // Arrange
                    const gateway = new OctokitRulesetGateway(null);

                    // Act
                    const result = await gateway.isAuthenticated();

                    // Assert
                    expect(result).toBe(false);
                });
            });
        });

        describe("getRepoInfo", () => {
            describe("when git remote returns a valid GitHub URL", () => {
                it("should return owner and repo", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const mockExec: ExecFunction = vi.fn().mockResolvedValue({
                        stdout: `https://github.com/${owner}/${repo}.git\n`,
                        stderr: "",
                    });
                    const gateway = new OctokitRulesetGateway(null, mockExec);
                    const targetDir = chance.word();

                    // Act
                    const result = await gateway.getRepoInfo(targetDir);

                    // Assert
                    expect(result).toEqual({ owner, repo });
                });
            });

            describe("when git remote returns an invalid URL", () => {
                it("should return null", async () => {
                    // Arrange
                    const mockExec: ExecFunction = vi.fn().mockResolvedValue({
                        stdout: "not-a-github-url\n",
                        stderr: "",
                    });
                    const gateway = new OctokitRulesetGateway(null, mockExec);
                    const targetDir = chance.word();

                    // Act
                    const result = await gateway.getRepoInfo(targetDir);

                    // Assert
                    expect(result).toBeNull();
                });
            });

            describe("when git remote fails", () => {
                it("should return null", async () => {
                    // Arrange
                    const mockExec: ExecFunction = vi
                        .fn()
                        .mockRejectedValue(new Error("not a git repository"));
                    const gateway = new OctokitRulesetGateway(null, mockExec);
                    const targetDir = chance.word();

                    // Act
                    const result = await gateway.getRepoInfo(targetDir);

                    // Assert
                    expect(result).toBeNull();
                });
            });
        });

        describe("listRulesets", () => {
            describe("when the API returns rulesets", () => {
                it("should return parsed rulesets via Octokit", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const rulesetId = chance.natural();
                    const rulesetName = chance.word();
                    const rulesets = [
                        {
                            id: rulesetId,
                            name: rulesetName,
                            enforcement: "active",
                        },
                    ];
                    const mockGetRepoRulesets = vi
                        .fn()
                        .mockResolvedValue({ data: rulesets });
                    const mockOctokit = createMockOctokit({
                        getRepoRulesets: mockGetRepoRulesets,
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act
                    const result = await gateway.listRulesets(owner, repo);

                    // Assert
                    expect(result).toEqual(rulesets);
                    expect(mockGetRepoRulesets).toHaveBeenCalledWith({
                        owner,
                        repo,
                    });
                });
            });

            describe("when the API returns an error", () => {
                it("should throw an error with a descriptive message", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const mockOctokit = createMockOctokit({
                        getRepoRulesets: vi
                            .fn()
                            .mockRejectedValue(
                                new Error(
                                    "HttpError: Resource not accessible by integration",
                                ),
                            ),
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act & Assert
                    await expect(
                        gateway.listRulesets(owner, repo),
                    ).rejects.toThrow(
                        `Failed to list rulesets for ${owner}/${repo}`,
                    );
                });
            });

            describe("when the API returns an error with a status code", () => {
                it("should include the HTTP status code in the error message", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const octokitError = Object.assign(
                        new Error("Resource not accessible by integration"),
                        { status: 403 },
                    );
                    const mockOctokit = createMockOctokit({
                        getRepoRulesets: vi
                            .fn()
                            .mockRejectedValue(octokitError),
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act & Assert
                    await expect(
                        gateway.listRulesets(owner, repo),
                    ).rejects.toThrow("status 403");
                });
            });

            describe("when the API returns an invalid response shape", () => {
                it("should throw an error with a descriptive message", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const mockOctokit = createMockOctokit({
                        getRepoRulesets: vi.fn().mockResolvedValue({
                            data: [{ invalid: "missing required fields" }],
                        }),
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act & Assert
                    await expect(
                        gateway.listRulesets(owner, repo),
                    ).rejects.toThrow(
                        `Failed to list rulesets for ${owner}/${repo}`,
                    );
                });
            });

            describe("when no Octokit instance is available", () => {
                it("should throw a not authenticated error", async () => {
                    // Arrange
                    const gateway = new OctokitRulesetGateway(null);

                    // Act & Assert
                    await expect(
                        gateway.listRulesets(chance.word(), chance.word()),
                    ).rejects.toThrow("Not authenticated");
                });
            });
        });

        describe("createRuleset", () => {
            describe("when the API call succeeds", () => {
                it("should create the ruleset via Octokit", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const payload = {
                        name: chance.word(),
                        enforcement: "active",
                        target: "branch",
                        // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                        bypass_actors: [],
                        conditions: {},
                        rules: [],
                    };
                    const mockCreateRepoRuleset = vi
                        .fn()
                        .mockResolvedValue({ data: { id: chance.natural() } });
                    const mockOctokit = createMockOctokit({
                        createRepoRuleset: mockCreateRepoRuleset,
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act & Assert
                    await expect(
                        gateway.createRuleset(owner, repo, payload),
                    ).resolves.toBeUndefined();
                    expect(mockCreateRepoRuleset).toHaveBeenCalledWith({
                        owner,
                        repo,
                        ...payload,
                    });
                });
            });

            describe("when the API call fails", () => {
                it("should throw an error with a descriptive message", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const payload = {
                        name: chance.word(),
                        enforcement: "active",
                        target: "branch",
                        // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                        bypass_actors: [],
                        conditions: {},
                        rules: [],
                    };
                    const mockOctokit = createMockOctokit({
                        createRepoRuleset: vi
                            .fn()
                            .mockRejectedValue(new Error("HttpError: 403")),
                    });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act & Assert
                    await expect(
                        gateway.createRuleset(owner, repo, payload),
                    ).rejects.toThrow(
                        `Failed to create ruleset for ${owner}/${repo}`,
                    );
                });
            });

            describe("when no Octokit instance is available", () => {
                it("should throw a not authenticated error", async () => {
                    // Arrange
                    const gateway = new OctokitRulesetGateway(null);
                    const payload = {
                        name: chance.word(),
                        enforcement: "active",
                        target: "branch",
                        // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                        bypass_actors: [],
                        conditions: {},
                        rules: [],
                    };

                    // Act & Assert
                    await expect(
                        gateway.createRuleset(
                            chance.word(),
                            chance.word(),
                            payload,
                        ),
                    ).rejects.toThrow("Not authenticated");
                });
            });
        });

        describe("hasAdvancedSecurity", () => {
            describe("when the repository has advanced security enabled", () => {
                it("should return true", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const mockGet = vi.fn().mockResolvedValue({
                        data: {
                            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                            security_and_analysis: {
                                // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                                advanced_security: { status: "enabled" },
                            },
                        },
                    });
                    const mockOctokit = createMockOctokit({ get: mockGet });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act
                    const result = await gateway.hasAdvancedSecurity(
                        owner,
                        repo,
                    );

                    // Assert
                    expect(result).toBe(true);
                    expect(mockGet).toHaveBeenCalledWith({ owner, repo });
                });
            });

            describe("when the repository has advanced security disabled", () => {
                it("should return false", async () => {
                    // Arrange
                    const mockGet = vi.fn().mockResolvedValue({
                        data: {
                            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                            security_and_analysis: {
                                // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                                advanced_security: { status: "disabled" },
                            },
                        },
                    });
                    const mockOctokit = createMockOctokit({ get: mockGet });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act
                    const result = await gateway.hasAdvancedSecurity(
                        chance.word(),
                        chance.word(),
                    );

                    // Assert
                    expect(result).toBe(false);
                });
            });

            describe("when the response does not include security_and_analysis", () => {
                it("should return false", async () => {
                    // Arrange
                    const mockGet = vi.fn().mockResolvedValue({
                        data: {},
                    });
                    const mockOctokit = createMockOctokit({ get: mockGet });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act
                    const result = await gateway.hasAdvancedSecurity(
                        chance.word(),
                        chance.word(),
                    );

                    // Assert
                    expect(result).toBe(false);
                });
            });

            describe("when the API call fails", () => {
                it("should return false", async () => {
                    // Arrange
                    const mockGet = vi
                        .fn()
                        .mockRejectedValue(new Error("HTTP 403: Forbidden"));
                    const mockOctokit = createMockOctokit({ get: mockGet });
                    const gateway = new OctokitRulesetGateway(mockOctokit);

                    // Act
                    const result = await gateway.hasAdvancedSecurity(
                        chance.word(),
                        chance.word(),
                    );

                    // Assert
                    expect(result).toBe(false);
                });
            });

            describe("when no Octokit instance is available", () => {
                it("should return false", async () => {
                    // Arrange
                    const gateway = new OctokitRulesetGateway(null);

                    // Act
                    const result = await gateway.hasAdvancedSecurity(
                        chance.word(),
                        chance.word(),
                    );

                    // Assert
                    expect(result).toBe(false);
                });
            });
        });
    });
});
