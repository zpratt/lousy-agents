import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import type { RulesetRule } from "../entities/copilot-setup.js";
import { copilotSetupCommand } from "./copilot-setup.js";

const chance = new Chance();

/**
 * Builds a code_scanning rule with a Copilot tool for test data.
 */
function buildCopilotRule(): RulesetRule {
    return {
        type: "code_scanning",
        parameters: {
            // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
            code_scanning_tools: [
                {
                    tool: "Copilot Autofix",
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    security_alerts_threshold: "high_or_higher",
                    // biome-ignore lint/style/useNamingConvention: GitHub API schema requires snake_case
                    alerts_threshold: "errors",
                },
            ],
        },
    };
}

interface MockRulesetGateway {
    isAuthenticated(): Promise<boolean>;
    getRepoInfo(
        targetDir: string,
    ): Promise<{ owner: string; repo: string } | null>;
    hasAdvancedSecurity(owner: string, repo: string): Promise<boolean>;
    listRulesets(owner: string, repo: string): Promise<unknown[]>;
    createRuleset(owner: string, repo: string, payload: unknown): Promise<void>;
}

function createMockRulesetGateway(
    overrides: Partial<MockRulesetGateway> = {},
): MockRulesetGateway {
    return {
        isAuthenticated:
            overrides.isAuthenticated ?? (() => Promise.resolve(false)),
        getRepoInfo: overrides.getRepoInfo ?? (() => Promise.resolve(null)),
        hasAdvancedSecurity:
            overrides.hasAdvancedSecurity ?? (() => Promise.resolve(false)),
        listRulesets: overrides.listRulesets ?? (() => Promise.resolve([])),
        createRuleset:
            overrides.createRuleset ?? (() => Promise.resolve(undefined)),
    };
}

describe("Copilot Setup command", () => {
    let testDir: string;
    let workflowsDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-copilot-setup-${chance.guid()}`);
        workflowsDir = join(testDir, ".github", "workflows");
        await mkdir(workflowsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when creating a new workflow", () => {
        it("should create copilot-setup-steps.yml when it does not exist", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            expect(parsed.name).toBe("Copilot Setup Steps");
        });

        it("should include checkout step as first step", async () => {
            // Arrange - empty repo

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[0].uses).toContain("actions/checkout");
        });

        it("should include setup-node when .nvmrc is detected", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-node"),
                ),
            ).toBe(true);
        });

        it("should include mise-action when mise.toml is detected", async () => {
            // Arrange
            await writeFile(join(testDir, "mise.toml"), '[tools]\nnode = "20"');

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("jdx/mise-action"),
                ),
            ).toBe(true);
        });

        it("should prioritize mise-action over individual setup actions when mise.toml exists", async () => {
            // Arrange
            await writeFile(join(testDir, "mise.toml"), '[tools]\nnode = "20"');
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;

            // Should have mise-action but not setup-node
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("jdx/mise-action"),
                ),
            ).toBe(true);
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-node"),
                ),
            ).toBe(false);
        });

        it("should include setup actions detected in existing workflows", async () => {
            // Arrange
            const ciWorkflow = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
`;
            await writeFile(join(workflowsDir, "ci.yml"), ciWorkflow);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-python"),
                ),
            ).toBe(true);
        });
    });

    describe("when updating an existing workflow", () => {
        it("should append missing setup steps to existing workflow", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps).toHaveLength(2);
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-node"),
                ),
            ).toBe(true);
        });

        it("should not duplicate existing setup steps", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            const nodeSteps = steps.filter((s: { uses: string }) =>
                s.uses.includes("actions/setup-node"),
            );
            expect(nodeSteps).toHaveLength(1);
        });

        it("should preserve existing workflow configuration", async () => {
            // Arrange
            const existingWorkflow = `---
name: My Custom Copilot Setup
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: self-hosted
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            expect(parsed.name).toBe("My Custom Copilot Setup");
            expect(parsed.jobs["copilot-setup-steps"]["runs-on"]).toBe(
                "self-hosted",
            );
            expect(parsed.jobs["copilot-setup-steps"]["timeout-minutes"]).toBe(
                60,
            );
        });
    });

    describe("when no configuration is detected", () => {
        it("should create minimal workflow with only checkout step", async () => {
            // Arrange - empty repo (no version files)

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: createMockRulesetGateway(),
                },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps).toHaveLength(1);
            expect(steps[0].uses).toContain("actions/checkout");
        });
    });

    describe("when workflows directory does not exist", () => {
        it("should create workflows directory and workflow file", async () => {
            // Arrange
            const emptyDir = join(tmpdir(), `empty-${chance.guid()}`);
            await mkdir(emptyDir, { recursive: true });
            await writeFile(join(emptyDir, ".nvmrc"), "20.0.0");

            try {
                // Act
                await copilotSetupCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: copilotSetupCommand,
                    data: {
                        targetDir: emptyDir,
                        rulesetGateway: createMockRulesetGateway(),
                    },
                });

                // Assert
                const workflowPath = join(
                    emptyDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                );
                const content = await readFile(workflowPath, "utf-8");
                expect(content).toContain("Copilot Setup Steps");
            } finally {
                await rm(emptyDir, { recursive: true, force: true });
            }
        });
    });

    describe("when checking Copilot PR review rulesets", () => {
        it("should warn when no valid GitHub token is available", async () => {
            // Arrange
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(false),
            });

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                },
            });

            // Assert - command completes without error (warning is logged)
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("Copilot Setup Steps");
        });

        it("should show success when a Copilot review ruleset already exists", async () => {
            // Arrange
            const rulesetName = chance.word();
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(true),
                getRepoInfo: () =>
                    Promise.resolve({
                        owner: chance.word(),
                        repo: chance.word(),
                    }),
                listRulesets: () =>
                    Promise.resolve([
                        {
                            id: chance.natural(),
                            name: rulesetName,
                            enforcement: "active",
                            rules: [buildCopilotRule()],
                        },
                    ]),
            });

            // Act & Assert - should complete without prompting
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                },
            });

            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("Copilot Setup Steps");
        });

        it("should prompt to create a ruleset when none exists and user confirms", async () => {
            // Arrange
            const owner = chance.word();
            const repo = chance.word();
            const createRuleset = vi.fn().mockResolvedValue(undefined);
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(true),
                getRepoInfo: () => Promise.resolve({ owner, repo }),
                listRulesets: () => Promise.resolve([]),
                createRuleset,
            });
            const mockPrompt = vi.fn().mockResolvedValue(true);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                    prompt: mockPrompt,
                },
            });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                "No Copilot PR review ruleset found. Would you like to create one?",
                { type: "confirm" },
            );
            expect(createRuleset).toHaveBeenCalledWith(
                owner,
                repo,
                expect.objectContaining({ name: "Copilot Code Review" }),
            );
        });

        it("should include code_scanning rule with CodeQL when advanced security is enabled", async () => {
            // Arrange
            const owner = chance.word();
            const repo = chance.word();
            const createRuleset = vi.fn().mockResolvedValue(undefined);
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(true),
                getRepoInfo: () => Promise.resolve({ owner, repo }),
                hasAdvancedSecurity: () => Promise.resolve(true),
                listRulesets: () => Promise.resolve([]),
                createRuleset,
            });
            const mockPrompt = vi.fn().mockResolvedValue(true);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                    prompt: mockPrompt,
                },
            });

            // Assert
            const payload = createRuleset.mock.calls[0][2] as {
                rules: Array<{
                    type: string;
                    parameters?: Record<string, unknown>;
                }>;
            };
            const codeScanningRule = payload.rules.find(
                (r) => r.type === "code_scanning",
            );
            expect(codeScanningRule).toBeDefined();
            const tools = codeScanningRule?.parameters
                ?.code_scanning_tools as Array<{ tool: string }>;
            expect(tools).toContainEqual(
                expect.objectContaining({ tool: "CodeQL" }),
            );
        });

        it("should not include code_scanning rule when advanced security is not enabled", async () => {
            // Arrange
            const owner = chance.word();
            const repo = chance.word();
            const createRuleset = vi.fn().mockResolvedValue(undefined);
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(true),
                getRepoInfo: () => Promise.resolve({ owner, repo }),
                hasAdvancedSecurity: () => Promise.resolve(false),
                listRulesets: () => Promise.resolve([]),
                createRuleset,
            });
            const mockPrompt = vi.fn().mockResolvedValue(true);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                    prompt: mockPrompt,
                },
            });

            // Assert
            const payload = createRuleset.mock.calls[0][2] as {
                rules: Array<{ type: string }>;
            };
            const codeScanningRules = payload.rules.filter(
                (r) => r.type === "code_scanning",
            );
            expect(codeScanningRules).toHaveLength(0);
        });

        it("should skip ruleset creation when user declines", async () => {
            // Arrange
            const createRuleset = vi.fn().mockResolvedValue(undefined);
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(true),
                getRepoInfo: () =>
                    Promise.resolve({
                        owner: chance.word(),
                        repo: chance.word(),
                    }),
                listRulesets: () => Promise.resolve([]),
                createRuleset,
            });
            const mockPrompt = vi.fn().mockResolvedValue(false);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                    prompt: mockPrompt,
                },
            });

            // Assert
            expect(createRuleset).not.toHaveBeenCalled();
        });

        it("should handle errors during ruleset check gracefully", async () => {
            // Arrange
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(true),
                getRepoInfo: () =>
                    Promise.resolve({
                        owner: chance.word(),
                        repo: chance.word(),
                    }),
                listRulesets: () =>
                    Promise.reject(new Error("HTTP 403: Forbidden")),
            });

            // Act & Assert - should complete without throwing
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                },
            });

            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("Copilot Setup Steps");
        });

        it("should handle errors during ruleset creation gracefully", async () => {
            // Arrange
            const mockGateway = createMockRulesetGateway({
                isAuthenticated: () => Promise.resolve(true),
                getRepoInfo: () =>
                    Promise.resolve({
                        owner: chance.word(),
                        repo: chance.word(),
                    }),
                listRulesets: () => Promise.resolve([]),
                createRuleset: () =>
                    Promise.reject(
                        new Error("HTTP 403: admin access required"),
                    ),
            });
            const mockPrompt = vi.fn().mockResolvedValue(true);

            // Act & Assert - should complete without throwing
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: {
                    targetDir: testDir,
                    rulesetGateway: mockGateway,
                    prompt: mockPrompt,
                },
            });

            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("Copilot Setup Steps");
        });
    });
});
