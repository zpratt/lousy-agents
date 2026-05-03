import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
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
            await import("node:fs/promises").then((fs) =>
                fs.writeFile(
                    join(claudeDir, "settings.json"),
                    JSON.stringify({
                        model: "claude-opus-4-5",
                        someOtherKey: 42,
                    }),
                    "utf8",
                ),
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
});
