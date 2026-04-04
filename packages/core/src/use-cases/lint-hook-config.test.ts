// biome-ignore-all lint/style/useNamingConvention: Claude Code API uses PascalCase hook event names (PreToolUse)
import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveredHookFile } from "../entities/hook.js";
import {
    type HookConfigLintGateway,
    LintHookConfigUseCase,
} from "./lint-hook-config.js";

const chance = new Chance();

function createMockGateway(
    overrides: Partial<HookConfigLintGateway> = {},
): HookConfigLintGateway {
    return {
        discoverHookFiles: vi.fn().mockResolvedValue([]),
        readFileContent: vi.fn().mockResolvedValue(""),
        ...overrides,
    };
}

describe("LintHookConfigUseCase", () => {
    describe("given no hook files discovered", () => {
        it("should return empty results", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintHookConfigUseCase(gateway);
            const targetDir = chance.word();

            // Act
            const result = await useCase.execute({ targetDir });

            // Assert
            expect(result.results).toEqual([]);
            expect(result.totalFiles).toBe(0);
            expect(result.totalErrors).toBe(0);
            expect(result.totalWarnings).toBe(0);
        });
    });

    describe("given an empty target directory", () => {
        it("should throw an error", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new LintHookConfigUseCase(gateway);

            // Act & Assert
            await expect(useCase.execute({ targetDir: "" })).rejects.toThrow(
                "Target directory is required",
            );
        });
    });

    describe("given a valid copilot hook configuration", () => {
        it("should return valid result with timeout warning", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command",
                            bash: "./policy-check.sh",
                        },
                    ],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalFiles).toBe(1);
            expect(result.results[0]?.valid).toBe(true);
            expect(result.totalWarnings).toBe(1);
            const timeoutWarning = result.results[0]?.diagnostics.find(
                (d) => d.ruleId === "hook/missing-timeout",
            );
            expect(timeoutWarning).toBeDefined();
            expect(timeoutWarning?.severity).toBe("warning");
        });
    });

    describe("given a copilot hook config with all recommended fields", () => {
        it("should return valid result with no diagnostics", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command",
                            bash: "./policy-check.sh",
                            timeoutSec: 5,
                        },
                    ],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalFiles).toBe(1);
            expect(result.results[0]?.valid).toBe(true);
            expect(result.results[0]?.diagnostics).toHaveLength(0);
            expect(result.totalErrors).toBe(0);
            expect(result.totalWarnings).toBe(0);
        });
    });

    describe("given a copilot hook config with invalid JSON", () => {
        it("should return an error diagnostic with the parse error detail", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue("{not valid json"),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalErrors).toBe(1);
            expect(result.results[0]?.valid).toBe(false);
            expect(result.results[0]?.diagnostics[0]?.ruleId).toBe(
                "hook/invalid-json",
            );
            expect(result.results[0]?.diagnostics[0]?.message).toMatch(
                /Invalid JSON in hook configuration file:/,
            );
        });
    });

    describe("given a copilot hook config missing version field", () => {
        it("should return an error diagnostic", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                hooks: {
                    preToolUse: [{ type: "command", bash: "./check.sh" }],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalErrors).toBeGreaterThan(0);
            expect(result.results[0]?.valid).toBe(false);
            const errorDiag = result.results[0]?.diagnostics.find(
                (d) => d.severity === "error",
            );
            expect(errorDiag?.ruleId).toBe("hook/invalid-config");
        });
    });

    describe("given a copilot hook config missing shell command", () => {
        it("should return an error diagnostic with hook/missing-command rule", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [{ type: "command" }],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalErrors).toBeGreaterThan(0);
            expect(result.results[0]?.valid).toBe(false);
            const missingCmd = result.results[0]?.diagnostics.find(
                (d) => d.ruleId === "hook/missing-command",
            );
            expect(missingCmd).toBeDefined();
        });
    });

    describe("given a copilot hook config with empty bash string", () => {
        it("should return an error diagnostic for empty command", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [{ type: "command", bash: "" }],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalErrors).toBeGreaterThan(0);
            expect(result.results[0]?.valid).toBe(false);
        });

        it("should emit hook/missing-command (not hook/invalid-config) so severity can be configured consistently", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [{ type: "command", bash: "" }],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            const errorDiags = result.results[0]?.diagnostics.filter(
                (d) => d.severity === "error",
            );
            expect(
                errorDiags?.every((d) => d.ruleId === "hook/missing-command"),
            ).toBe(true);
        });
    });

    describe("given a copilot hook config with empty powershell string", () => {
        it("should emit hook/missing-command so severity can be configured consistently", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [{ type: "command", powershell: "" }],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            const errorDiags = result.results[0]?.diagnostics.filter(
                (d) => d.severity === "error",
            );
            expect(
                errorDiags?.every((d) => d.ruleId === "hook/missing-command"),
            ).toBe(true);
        });
    });

    describe("given a valid claude hook configuration with matcher", () => {
        it("should return valid result with no diagnostics", async () => {
            // Arrange
            const filePath = `/repo/.claude/settings.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "claude" },
            ];
            const config = JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            matcher: "Bash|Edit",
                            hooks: [
                                {
                                    type: "command",
                                    command: "/path/to/check.sh",
                                },
                            ],
                        },
                    ],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalFiles).toBe(1);
            expect(result.results[0]?.valid).toBe(true);
            expect(result.results[0]?.diagnostics).toHaveLength(0);
            expect(result.totalErrors).toBe(0);
            expect(result.totalWarnings).toBe(0);
        });
    });

    describe("given a claude hook configuration without matcher", () => {
        it("should return a warning for missing matcher", async () => {
            // Arrange
            const filePath = `/repo/.claude/settings.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "claude" },
            ];
            const config = JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            hooks: [
                                {
                                    type: "command",
                                    command: "/path/to/check.sh",
                                },
                            ],
                        },
                    ],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalFiles).toBe(1);
            expect(result.results[0]?.valid).toBe(true);
            expect(result.totalWarnings).toBe(1);
            const matcherWarning = result.results[0]?.diagnostics.find(
                (d) => d.ruleId === "hook/missing-matcher",
            );
            expect(matcherWarning).toBeDefined();
            expect(matcherWarning?.severity).toBe("warning");
        });
    });

    describe("given a claude hook config with invalid JSON", () => {
        it("should return an error diagnostic with the parse error detail", async () => {
            // Arrange
            const filePath = `/repo/.claude/settings.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "claude" },
            ];

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue("not json"),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalErrors).toBe(1);
            expect(result.results[0]?.valid).toBe(false);
            expect(result.results[0]?.diagnostics[0]?.ruleId).toBe(
                "hook/invalid-json",
            );
            expect(result.results[0]?.diagnostics[0]?.message).toMatch(
                /Invalid JSON in hook configuration file:/,
            );
        });
    });

    describe("given a claude hook config missing hooks field", () => {
        it("should return an error diagnostic", async () => {
            // Arrange
            const filePath = `/repo/.claude/settings.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "claude" },
            ];
            const config = JSON.stringify({
                permissions: {},
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalErrors).toBeGreaterThan(0);
            expect(result.results[0]?.valid).toBe(false);
        });
    });

    describe("given a claude hook config with empty command", () => {
        it("should return an error diagnostic for empty command", async () => {
            // Arrange
            const filePath = `/repo/.claude/settings.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "claude" },
            ];
            const config = JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            matcher: "Bash",
                            hooks: [
                                {
                                    type: "command",
                                    command: "",
                                },
                            ],
                        },
                    ],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalErrors).toBeGreaterThan(0);
            expect(result.results[0]?.valid).toBe(false);
            const missingCmd = result.results[0]?.diagnostics.find(
                (d) => d.ruleId === "hook/missing-command",
            );
            expect(missingCmd).toBeDefined();
        });
    });

    describe("given a claude hook config with wrong-typed command", () => {
        it("should emit hook/missing-command (not hook/invalid-config) so severity can be configured consistently", async () => {
            // Arrange
            const filePath = `/repo/.claude/settings.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "claude" },
            ];
            // command: 123 triggers invalid_type rather than too_small
            const config = `{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":123}]}]}}`;

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: chance.word() });

            // Assert
            expect(result.totalErrors).toBeGreaterThan(0);
            const missingCmd = result.results[0]?.diagnostics.find(
                (d) => d.ruleId === "hook/missing-command",
            );
            expect(missingCmd).toBeDefined();
        });
    });

    describe("given multiple hook files from both platforms", () => {
        it("should validate each file independently", async () => {
            // Arrange
            const copilotFile: DiscoveredHookFile = {
                filePath: "/repo/.github/hooks/agent-shell/hooks.json",
                platform: "copilot",
            };
            const claudeFile: DiscoveredHookFile = {
                filePath: "/repo/.claude/settings.json",
                platform: "claude",
            };

            const copilotConfig = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: [
                        {
                            type: "command",
                            bash: "./check.sh",
                            timeoutSec: 5,
                        },
                    ],
                },
            });
            const claudeConfig = JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            matcher: "Bash",
                            hooks: [
                                {
                                    type: "command",
                                    command: "/path/to/check.sh",
                                },
                            ],
                        },
                    ],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi
                    .fn()
                    .mockResolvedValue([copilotFile, claudeFile]),
                readFileContent: vi.fn().mockImplementation((path: string) => {
                    if (path === copilotFile.filePath) {
                        return Promise.resolve(copilotConfig);
                    }
                    if (path === claudeFile.filePath) {
                        return Promise.resolve(claudeConfig);
                    }
                    throw new Error(`Unexpected path: ${path}`);
                }),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.totalFiles).toBe(2);
            expect(result.results).toHaveLength(2);
            expect(result.results[0]?.platform).toBe("copilot");
            expect(result.results[1]?.platform).toBe("claude");
            expect(result.totalErrors).toBe(0);
        });
    });

    describe("given a copilot hook config with sessionStart hook missing timeoutSec", () => {
        it("should return a missing-timeout warning for sessionStart hooks", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    sessionStart: [{ type: "command", bash: "./on-start.sh" }],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: chance.word() });

            // Assert
            expect(result.results[0]?.valid).toBe(true);
            expect(result.totalWarnings).toBe(1);
            const warning = result.results[0]?.diagnostics.find(
                (d) => d.ruleId === "hook/missing-timeout",
            );
            expect(warning).toBeDefined();
            expect(warning?.severity).toBe("warning");
        });
    });

    describe("given a copilot hook config with all five event types each missing timeoutSec", () => {
        it("should emit one missing-timeout warning per hook command across all event types", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const hookEntry = { type: "command", bash: "./check.sh" };
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    sessionStart: [hookEntry],
                    userPromptSubmitted: [hookEntry],
                    preToolUse: [hookEntry],
                    postToolUse: [hookEntry],
                    sessionEnd: [hookEntry],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: chance.word() });

            // Assert
            expect(result.results[0]?.valid).toBe(true);
            expect(result.totalWarnings).toBe(5);
        });
    });

    describe("given a copilot hook config with a prototype-polluting env key", () => {
        it("should parse successfully with the polluting key stripped from env output", async () => {
            // Zod 4 strips invalid record keys from output rather than failing, so
            // the hook is considered valid and __proto__ never reaches downstream spreads.
            // The raw JSON string simulates attacker-controlled file content — a JS
            // object literal { __proto__: "..." } would silently set prototype instead
            // of creating an own key, so it would not reach the JSON serialization.
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const config = `{"version":1,"hooks":{"preToolUse":[{"type":"command","bash":"./check.sh","env":{"__proto__":"polluted"}}]}}`;

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: chance.word() });

            // Assert — config is valid; __proto__ key is silently dropped by Zod
            expect(result.results[0]?.valid).toBe(true);
            expect(result.totalErrors).toBe(0);
        });
    });

    describe("given a copilot hook config exceeding the maximum hooks per event", () => {
        it("should return an error diagnostic for the oversized array", async () => {
            // Arrange
            const filePath = `/repo/.github/hooks/agent-shell/hooks.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "copilot" },
            ];
            const hookEntry = {
                type: "command",
                bash: "./check.sh",
                timeoutSec: 5,
            };
            const config = JSON.stringify({
                version: 1,
                hooks: {
                    preToolUse: Array.from({ length: 101 }, () => hookEntry),
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({ targetDir: chance.word() });

            // Assert
            expect(result.results[0]?.valid).toBe(false);
            expect(result.totalErrors).toBeGreaterThan(0);
        });
    });

    describe("given a claude settings file with additional properties", () => {
        it("should pass validation when hooks section is valid", async () => {
            // Arrange
            const filePath = `/repo/.claude/settings.json`;
            const discovered: DiscoveredHookFile[] = [
                { filePath, platform: "claude" },
            ];
            const config = JSON.stringify({
                permissions: { allow: ["Read"] },
                hooks: {
                    PreToolUse: [
                        {
                            matcher: "Bash",
                            hooks: [
                                {
                                    type: "command",
                                    command: "/path/to/check.sh",
                                },
                            ],
                        },
                    ],
                    PostToolUse: [
                        {
                            matcher: "Edit|Write",
                            hooks: [
                                {
                                    type: "command",
                                    command: "/path/to/lint.sh",
                                },
                            ],
                        },
                    ],
                },
            });

            const gateway = createMockGateway({
                discoverHookFiles: vi.fn().mockResolvedValue(discovered),
                readFileContent: vi.fn().mockResolvedValue(config),
            });
            const useCase = new LintHookConfigUseCase(gateway);

            // Act
            const result = await useCase.execute({
                targetDir: chance.word(),
            });

            // Assert
            expect(result.results[0]?.valid).toBe(true);
            expect(result.totalErrors).toBe(0);
        });
    });
});
