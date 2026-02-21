import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import {
    type ExecFunction,
    type OctokitFactory,
    OctokitRulesetGateway,
    parseRepoFromRemoteUrl,
} from "./github-ruleset-gateway.js";

const chance = new Chance();

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
        const token = chance.hash();

        function createMockExec(
            overrides: Partial<Record<string, string>> = {},
        ): ExecFunction {
            return vi.fn().mockImplementation((cmd: string, args: string[]) => {
                if (cmd === "gh" && args[0] === "auth" && args[1] === "token") {
                    if (overrides.token !== undefined) {
                        return Promise.resolve({
                            stdout: overrides.token,
                            stderr: "",
                        });
                    }
                    return Promise.resolve({
                        stdout: `${token}\n`,
                        stderr: "",
                    });
                }
                if (
                    cmd === "git" &&
                    args[0] === "remote" &&
                    args[1] === "get-url"
                ) {
                    if (overrides.remoteUrl !== undefined) {
                        return Promise.resolve({
                            stdout: overrides.remoteUrl,
                            stderr: "",
                        });
                    }
                    return Promise.reject(new Error("no remote"));
                }
                return Promise.reject(new Error(`unexpected call: ${cmd}`));
            });
        }

        describe("isAuthenticated", () => {
            describe("when gh auth token returns a token", () => {
                it("should return true", async () => {
                    // Arrange
                    const mockExec = createMockExec();
                    const gateway = new OctokitRulesetGateway(mockExec);

                    // Act
                    const result = await gateway.isAuthenticated();

                    // Assert
                    expect(result).toBe(true);
                    expect(mockExec).toHaveBeenCalledWith("gh", [
                        "auth",
                        "token",
                    ]);
                });
            });

            describe("when gh auth token fails", () => {
                it("should return false", async () => {
                    // Arrange
                    const mockExec: ExecFunction = vi
                        .fn()
                        .mockRejectedValue(new Error("not logged in"));
                    const gateway = new OctokitRulesetGateway(mockExec);

                    // Act
                    const result = await gateway.isAuthenticated();

                    // Assert
                    expect(result).toBe(false);
                });
            });

            describe("when gh auth token returns an empty string", () => {
                it("should return false", async () => {
                    // Arrange
                    const mockExec = createMockExec({ token: "" });
                    const gateway = new OctokitRulesetGateway(mockExec);

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
                    const mockExec = createMockExec({
                        remoteUrl: `https://github.com/${owner}/${repo}.git\n`,
                    });
                    const gateway = new OctokitRulesetGateway(mockExec);
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
                    const mockExec = createMockExec({
                        remoteUrl: "not-a-github-url\n",
                    });
                    const gateway = new OctokitRulesetGateway(mockExec);
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
                    const gateway = new OctokitRulesetGateway(mockExec);
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
                    const mockOctokitFactory: OctokitFactory = () =>
                        ({
                            rest: {
                                repos: {
                                    getRepoRulesets: mockGetRepoRulesets,
                                },
                            },
                        }) as never;
                    const mockExec = createMockExec();
                    const gateway = new OctokitRulesetGateway(
                        mockExec,
                        mockOctokitFactory,
                    );

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
                    const mockGetRepoRulesets = vi
                        .fn()
                        .mockRejectedValue(
                            new Error(
                                "HttpError: Resource not accessible by integration",
                            ),
                        );
                    const mockOctokitFactory: OctokitFactory = () =>
                        ({
                            rest: {
                                repos: {
                                    getRepoRulesets: mockGetRepoRulesets,
                                },
                            },
                        }) as never;
                    const mockExec = createMockExec();
                    const gateway = new OctokitRulesetGateway(
                        mockExec,
                        mockOctokitFactory,
                    );

                    // Act & Assert
                    await expect(
                        gateway.listRulesets(owner, repo),
                    ).rejects.toThrow(
                        `Failed to list rulesets for ${owner}/${repo}`,
                    );
                });
            });

            describe("when the API returns an invalid response shape", () => {
                it("should throw an error with a descriptive message", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const invalidData = [
                        { invalid: "missing required fields" },
                    ];
                    const mockGetRepoRulesets = vi
                        .fn()
                        .mockResolvedValue({ data: invalidData });
                    const mockOctokitFactory: OctokitFactory = () =>
                        ({
                            rest: {
                                repos: {
                                    getRepoRulesets: mockGetRepoRulesets,
                                },
                            },
                        }) as never;
                    const mockExec = createMockExec();
                    const gateway = new OctokitRulesetGateway(
                        mockExec,
                        mockOctokitFactory,
                    );

                    // Act & Assert
                    await expect(
                        gateway.listRulesets(owner, repo),
                    ).rejects.toThrow(
                        `Failed to list rulesets for ${owner}/${repo}`,
                    );
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
                    const mockOctokitFactory: OctokitFactory = () =>
                        ({
                            rest: {
                                repos: {
                                    createRepoRuleset: mockCreateRepoRuleset,
                                },
                            },
                        }) as never;
                    const mockExec = createMockExec();
                    const gateway = new OctokitRulesetGateway(
                        mockExec,
                        mockOctokitFactory,
                    );

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
                    const mockCreateRepoRuleset = vi
                        .fn()
                        .mockRejectedValue(new Error("HttpError: 403"));
                    const mockOctokitFactory: OctokitFactory = () =>
                        ({
                            rest: {
                                repos: {
                                    createRepoRuleset: mockCreateRepoRuleset,
                                },
                            },
                        }) as never;
                    const mockExec = createMockExec();
                    const gateway = new OctokitRulesetGateway(
                        mockExec,
                        mockOctokitFactory,
                    );

                    // Act & Assert
                    await expect(
                        gateway.createRuleset(owner, repo, payload),
                    ).rejects.toThrow(
                        `Failed to create ruleset for ${owner}/${repo}`,
                    );
                });
            });
        });
    });
});
