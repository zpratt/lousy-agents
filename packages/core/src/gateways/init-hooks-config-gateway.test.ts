import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InitHooksConfigGateway } from "./init-hooks-config-gateway.js";

function tmpDir() {
    return join(process.cwd(), ".test-tmp", randomBytes(8).toString("hex"));
}

describe("InitHooksConfigGateway", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = tmpDir();
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when .claude/settings.json does not exist", () => {
        it("creates the file with PreToolUse, Stop, and SubagentStop hooks", async () => {
            const gateway = new InitHooksConfigGateway();

            const result = await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            expect(result.written).toHaveLength(1);
            expect(result.skipped).toHaveLength(0);

            const content = await readFile(
                join(testDir, ".claude", "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            expect(parsed.hooks.PreToolUse).toBeDefined();
            expect(parsed.hooks.Stop).toBeDefined();
            expect(parsed.hooks.SubagentStop).toBeDefined();
            expect(parsed.hooks.SessionStart).toBeUndefined();
        });
    });

    describe("when PreToolUse hooks are written", () => {
        it("restricts to Edit and Write matchers without shell-interpolated file paths", async () => {
            const gateway = new InitHooksConfigGateway();

            await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            const content = await readFile(
                join(testDir, ".claude", "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            const matchers = (
                parsed.hooks.PreToolUse as Array<{ matcher: string }>
            ).map((e) => e.matcher);
            expect(matchers).toContain("Edit");
            expect(matchers).toContain("Write");

            // Commands must not interpolate shell variables for file paths
            const commands = (
                parsed.hooks.PreToolUse as Array<{
                    hooks: Array<{ command: string }>;
                }>
            ).flatMap((e) => e.hooks.map((h) => h.command));
            for (const cmd of commands) {
                expect(cmd).not.toContain("$CLAUDE_TOOL_INPUT_FILE_PATHS");
                expect(cmd).not.toContain("--files");
            }
        });
    });

    describe("when --session-start is requested", () => {
        it("writes PreToolUse, Stop, SubagentStop, and SessionStart hooks", async () => {
            const gateway = new InitHooksConfigGateway();

            await gateway.initHooks(testDir, {
                addSessionStart: true,
                force: false,
            });

            const content = await readFile(
                join(testDir, ".claude", "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            expect(parsed.hooks.PreToolUse).toBeDefined();
            expect(parsed.hooks.Stop).toBeDefined();
            expect(parsed.hooks.SubagentStop).toBeDefined();
            expect(parsed.hooks.SessionStart).toBeDefined();
        });
    });

    describe("when settings.json already has all hooks and force is false", () => {
        it("skips the file", async () => {
            const gateway = new InitHooksConfigGateway();

            await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            const result = await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            expect(result.written).toHaveLength(0);
            expect(result.skipped).toHaveLength(1);
        });
    });

    describe("when settings.json already has all hooks but force is true", () => {
        it("overwrites the file", async () => {
            const gateway = new InitHooksConfigGateway();

            await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            const result = await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: true,
            });

            expect(result.written).toHaveLength(1);
            expect(result.skipped).toHaveLength(0);
        });
    });

    describe("when settings.json contains prototype pollution keys", () => {
        it("throws an error", async () => {
            const claudeDir = join(testDir, ".claude");
            await mkdir(claudeDir, { recursive: true });
            await import("node:fs/promises").then((fs) =>
                fs.writeFile(
                    join(claudeDir, "settings.json"),
                    '{"__proto__":{"admin":true}}',
                    "utf8",
                ),
            );

            const gateway = new InitHooksConfigGateway();

            await expect(
                gateway.initHooks(testDir, {
                    addSessionStart: false,
                    force: false,
                }),
            ).rejects.toThrow("dangerous prototype keys");
        });
    });

    describe("when settings.json has existing non-hook settings", () => {
        it("preserves existing settings while adding hooks", async () => {
            const claudeDir = join(testDir, ".claude");
            await mkdir(claudeDir, { recursive: true });
            await writeFile(
                join(claudeDir, "settings.json"),
                JSON.stringify({
                    model: "claude-opus-4-5",
                    someOtherKey: 42,
                }),
                "utf8",
            );

            const gateway = new InitHooksConfigGateway();
            await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            const content = await readFile(
                join(claudeDir, "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            expect(parsed.model).toBe("claude-opus-4-5");
            expect(parsed.someOtherKey).toBe(42);
            expect(parsed.hooks.PreToolUse).toBeDefined();
            expect(parsed.hooks.Stop).toBeDefined();
            expect(parsed.hooks.SubagentStop).toBeDefined();
        });
    });

    describe("when hooks are written, commands do not use npx prefix", () => {
        it("hook commands use lousy-agents directly without npx", async () => {
            const gateway = new InitHooksConfigGateway();

            await gateway.initHooks(testDir, {
                addSessionStart: true,
                force: false,
            });

            const content = await readFile(
                join(testDir, ".claude", "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            const allCommands: string[] = [];

            for (const event of [
                "PreToolUse",
                "Stop",
                "SubagentStop",
                "SessionStart",
            ] as const) {
                const entries = parsed.hooks[event];
                if (!Array.isArray(entries)) continue;
                for (const entry of entries as Array<{
                    hooks?: Array<{ command?: string }>;
                }>) {
                    for (const hook of entry.hooks ?? []) {
                        if (hook.command) allCommands.push(hook.command);
                    }
                }
            }

            expect(allCommands.length).toBeGreaterThan(0);
            for (const cmd of allCommands) {
                expect(cmd).not.toMatch(/^npx /);
            }
        });
    });

    describe("when settings.json already has a PreToolUse hook for Bash but not Edit or Write", () => {
        it("adds Edit and Write matchers while preserving the existing Bash matcher", async () => {
            const claudeDir = join(testDir, ".claude");
            await mkdir(claudeDir, { recursive: true });
            await writeFile(
                join(claudeDir, "settings.json"),
                JSON.stringify({
                    hooks: {
                        // biome-ignore lint/style/useNamingConvention: Claude settings JSON requires PascalCase hook event names
                        PreToolUse: [
                            {
                                matcher: "Bash",
                                hooks: [
                                    {
                                        type: "command",
                                        command: "bash-command",
                                    },
                                ],
                            },
                        ],
                    },
                }),
                "utf8",
            );

            const gateway = new InitHooksConfigGateway();
            const result = await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            expect(result.written).toHaveLength(1);

            const content = await readFile(
                join(claudeDir, "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            const matchers = (
                parsed.hooks.PreToolUse as Array<{ matcher: string }>
            ).map((e) => e.matcher);
            expect(matchers).toContain("Bash");
            expect(matchers).toContain("Edit");
            expect(matchers).toContain("Write");
        });
    });

    describe("when --force is used on a config that already has Edit/Write hooks", () => {
        it("replaces existing Edit/Write matchers without duplicating them", async () => {
            const gateway = new InitHooksConfigGateway();

            await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: false,
            });

            await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: true,
            });

            const content = await readFile(
                join(testDir, ".claude", "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            const matchers = (
                parsed.hooks.PreToolUse as Array<{ matcher: string }>
            ).map((e) => e.matcher);

            const editCount = matchers.filter((m) => m === "Edit").length;
            const writeCount = matchers.filter((m) => m === "Write").length;
            expect(editCount).toBe(1);
            expect(writeCount).toBe(1);
        });
    });

    describe("when --force is used on a config with Edit/Write and a third-party matcher", () => {
        it("replaces Edit/Write matchers without duplicating them and preserves the third-party matcher", async () => {
            const claudeDir = join(testDir, ".claude");
            await mkdir(claudeDir, { recursive: true });
            await writeFile(
                join(claudeDir, "settings.json"),
                JSON.stringify({
                    hooks: {
                        // biome-ignore lint/style/useNamingConvention: Claude settings JSON requires PascalCase hook event names
                        PreToolUse: [
                            {
                                matcher: "Bash",
                                hooks: [
                                    {
                                        type: "command",
                                        command: "some-other-command",
                                    },
                                ],
                            },
                            {
                                matcher: "Edit",
                                hooks: [
                                    {
                                        type: "command",
                                        command: "old-edit-command",
                                    },
                                ],
                            },
                            {
                                matcher: "Write",
                                hooks: [
                                    {
                                        type: "command",
                                        command: "old-write-command",
                                    },
                                ],
                            },
                        ],
                    },
                }),
                "utf8",
            );

            const gateway = new InitHooksConfigGateway();
            await gateway.initHooks(testDir, {
                addSessionStart: false,
                force: true,
            });

            const content = await readFile(
                join(claudeDir, "settings.json"),
                "utf8",
            );
            const parsed = JSON.parse(content);
            const matchers = (
                parsed.hooks.PreToolUse as Array<{ matcher: string }>
            ).map((e) => e.matcher);

            // Third-party Bash matcher must be preserved
            expect(matchers).toContain("Bash");
            // Edit and Write must appear exactly once (no duplicates)
            const editCount = matchers.filter((m) => m === "Edit").length;
            const writeCount = matchers.filter((m) => m === "Write").length;
            expect(editCount).toBe(1);
            expect(writeCount).toBe(1);
        });
    });
});
