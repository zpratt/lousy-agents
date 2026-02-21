import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import {
    type ExecFunction,
    GhCliRulesetGateway,
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

    describe("GhCliRulesetGateway", () => {
        describe("isAuthenticated", () => {
            describe("when gh auth status succeeds", () => {
                it("should return true", async () => {
                    // Arrange
                    const mockExec: ExecFunction = vi
                        .fn()
                        .mockResolvedValue({ stdout: "", stderr: "" });
                    const gateway = new GhCliRulesetGateway(mockExec);

                    // Act
                    const result = await gateway.isAuthenticated();

                    // Assert
                    expect(result).toBe(true);
                    expect(mockExec).toHaveBeenCalledWith("gh", [
                        "auth",
                        "status",
                    ]);
                });
            });

            describe("when gh auth status fails", () => {
                it("should return false", async () => {
                    // Arrange
                    const mockExec: ExecFunction = vi
                        .fn()
                        .mockRejectedValue(new Error("not logged in"));
                    const gateway = new GhCliRulesetGateway(mockExec);

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
                    const gateway = new GhCliRulesetGateway(mockExec);
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
                    const gateway = new GhCliRulesetGateway(mockExec);
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
                    const gateway = new GhCliRulesetGateway(mockExec);
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
                it("should return parsed rulesets", async () => {
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
                    const mockExec: ExecFunction = vi.fn().mockResolvedValue({
                        stdout: JSON.stringify(rulesets),
                        stderr: "",
                    });
                    const gateway = new GhCliRulesetGateway(mockExec);

                    // Act
                    const result = await gateway.listRulesets(owner, repo);

                    // Assert
                    expect(result).toEqual(rulesets);
                    expect(mockExec).toHaveBeenCalledWith("gh", [
                        "api",
                        `repos/${owner}/${repo}/rulesets`,
                        "--paginate",
                    ]);
                });
            });

            describe("when the API returns an error", () => {
                it("should throw an error with a descriptive message", async () => {
                    // Arrange
                    const owner = chance.word();
                    const repo = chance.word();
                    const mockExec: ExecFunction = vi
                        .fn()
                        .mockRejectedValue(
                            new Error(
                                "HTTP 403: Resource not accessible by integration",
                            ),
                        );
                    const gateway = new GhCliRulesetGateway(mockExec);

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
                    const mockExec: ExecFunction = vi.fn().mockResolvedValue({
                        stdout: JSON.stringify(invalidData),
                        stderr: "",
                    });
                    const gateway = new GhCliRulesetGateway(mockExec);

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
                it("should create the ruleset without error", async () => {
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
                    const mockExec: ExecFunction = vi.fn().mockResolvedValue({
                        stdout: JSON.stringify({ id: chance.natural() }),
                        stderr: "",
                    });
                    const gateway = new GhCliRulesetGateway(mockExec);

                    // Act & Assert
                    await expect(
                        gateway.createRuleset(owner, repo, payload),
                    ).resolves.toBeUndefined();
                    expect(mockExec).toHaveBeenCalledWith(
                        "gh",
                        [
                            "api",
                            `repos/${owner}/${repo}/rulesets`,
                            "-X",
                            "POST",
                            "--input",
                            "-",
                        ],
                        expect.objectContaining({
                            input: JSON.stringify(payload),
                        }),
                    );
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
                    const mockExec: ExecFunction = vi
                        .fn()
                        .mockRejectedValue(new Error("HTTP 403"));
                    const gateway = new GhCliRulesetGateway(mockExec);

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
