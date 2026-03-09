// biome-ignore-all lint/style/useNamingConvention: env var names use UPPER_SNAKE_CASE and event schema uses snake_case
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const chance = new Chance();

const testDir = dirname(fileURLToPath(import.meta.url));
const SHIM_SRC = resolve(testDir, "../../src/index.ts");
const TSX_BIN = resolve(testDir, "../../../../node_modules/.bin/tsx");

const ACTOR_ENV_KEYS = [
    "AGENTSHELL_ACTOR",
    "GITHUB_ACTIONS",
    "CLAUDE_CODE",
    "COPILOT_AGENT",
];

const AGENTSHELL_ENV_KEYS = [
    "AGENTSHELL_PASSTHROUGH",
    "AGENTSHELL_SESSION_ID",
    "AGENTSHELL_LOG_DIR",
];

function buildCleanEnv(
    overrides: Record<string, string> = {},
): Record<string, string> {
    const base: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined) continue;
        if (ACTOR_ENV_KEYS.includes(key)) continue;
        if (AGENTSHELL_ENV_KEYS.includes(key)) continue;
        base[key] = value;
    }
    return { ...base, ...overrides };
}

interface RunResult {
    status: number;
    stdout: string;
    stderr: string;
}

function runLog(
    cwd: string,
    args: string[],
    env?: Record<string, string>,
): RunResult {
    const result = spawnSync(TSX_BIN, [SHIM_SRC, "log", ...args], {
        env: buildCleanEnv({ HOME: cwd, ...env }),
        cwd,
        encoding: "utf-8",
        timeout: 15_000,
    });
    return {
        status: result.status ?? 1,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
    };
}

function runShim(
    cwd: string,
    args: string[],
    env?: Record<string, string>,
): RunResult {
    const result = spawnSync(TSX_BIN, [SHIM_SRC, ...args], {
        env: buildCleanEnv({ HOME: cwd, ...env }),
        cwd,
        encoding: "utf-8",
        timeout: 15_000,
    });
    return {
        status: result.status ?? 1,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
    };
}

function defaultEventsDir(tmpDir: string): string {
    return join(tmpDir, ".agent-shell", "events");
}

async function writeEventFile(
    eventsDir: string,
    sessionId: string,
    events: object[],
): Promise<void> {
    await mkdir(eventsDir, { recursive: true });
    const lines = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
    await writeFile(join(eventsDir, `${sessionId}.jsonl`), lines);
}

function makeScriptEndEvent(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        v: 1,
        session_id: chance.guid(),
        event: "script_end",
        script: "test",
        command: `echo ${chance.word()}`,
        package: chance.word(),
        package_version: "1.0.0",
        actor: "human",
        exit_code: 0,
        signal: null,
        duration_ms: chance.integer({ min: 100, max: 5000 }),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

describe("Log query integration", { timeout: 30_000 }, () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "agent-shell-log-test-"));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    describe("given no events directory exists", () => {
        it("displays guidance on enabling instrumentation", () => {
            // Act
            const result = runLog(tmpDir, []);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain("No events recorded");
            expect(result.stdout).toContain("script-shell");
            expect(result.stdout).toContain(".npmrc");
        });
    });

    describe("given events from multiple sessions", () => {
        it("displays events from the most recent session only", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const oldSessionId = chance.guid();
            const recentSessionId = chance.guid();

            const oldCommand = `echo ${chance.word()}`;
            const recentCommand = `echo ${chance.word()}`;

            const oldEvent = makeScriptEndEvent({
                session_id: oldSessionId,
                command: oldCommand,
                timestamp: new Date(Date.now() - 60_000).toISOString(),
            });
            const recentEvent = makeScriptEndEvent({
                session_id: recentSessionId,
                command: recentCommand,
                timestamp: new Date().toISOString(),
            });

            await writeEventFile(eventsDir, oldSessionId, [oldEvent]);

            // Set mtime on old file to the past
            const oldFilePath = join(eventsDir, `${oldSessionId}.jsonl`);
            const pastDate = new Date(Date.now() - 120_000);
            await utimes(oldFilePath, pastDate, pastDate);

            await writeEventFile(eventsDir, recentSessionId, [recentEvent]);

            // Act — no --last flag, so it reads the most recent session
            const result = runLog(tmpDir, []);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(recentCommand);
            expect(result.stdout).not.toContain(oldCommand);
        });
    });

    describe("given events from different actors", () => {
        it("filters by --actor flag", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const sessionId = chance.guid();
            const targetActor = "claude-code";
            const otherActor = "human";

            const targetCommand = `echo ${chance.word()}`;
            const otherCommand = `echo ${chance.word()}`;

            const targetEvent = makeScriptEndEvent({
                session_id: sessionId,
                actor: targetActor,
                command: targetCommand,
            });
            const otherEvent = makeScriptEndEvent({
                session_id: sessionId,
                actor: otherActor,
                command: otherCommand,
            });

            await writeEventFile(eventsDir, sessionId, [
                targetEvent,
                otherEvent,
            ]);

            // Act
            const result = runLog(tmpDir, [
                "--actor",
                targetActor,
                "--last",
                "1d",
            ]);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(targetCommand);
            expect(result.stdout).not.toContain(otherCommand);
        });
    });

    describe("given events with mixed exit codes", () => {
        it("shows only failures with --failures flag", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const sessionId = chance.guid();

            const failureCommand = `echo ${chance.word()}`;
            const successCommand = `echo ${chance.word()}`;

            const failureEvent = makeScriptEndEvent({
                session_id: sessionId,
                command: failureCommand,
                exit_code: 1,
            });
            const successEvent = makeScriptEndEvent({
                session_id: sessionId,
                command: successCommand,
                exit_code: 0,
            });

            await writeEventFile(eventsDir, sessionId, [
                failureEvent,
                successEvent,
            ]);

            // Act
            const result = runLog(tmpDir, ["--failures", "--last", "1d"]);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(failureCommand);
            expect(result.stdout).not.toContain(successCommand);
        });
    });

    describe("given events from different scripts", () => {
        it("filters by --script flag", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const sessionId = chance.guid();
            const targetScript = "test";
            const otherScript = "build";

            const targetCommand = `echo ${chance.word()}`;
            const otherCommand = `echo ${chance.word()}`;

            const targetEvent = makeScriptEndEvent({
                session_id: sessionId,
                script: targetScript,
                command: targetCommand,
            });
            const otherEvent = makeScriptEndEvent({
                session_id: sessionId,
                script: otherScript,
                command: otherCommand,
            });

            await writeEventFile(eventsDir, sessionId, [
                targetEvent,
                otherEvent,
            ]);

            // Act
            const result = runLog(tmpDir, [
                "--script",
                targetScript,
                "--last",
                "1d",
            ]);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(targetCommand);
            expect(result.stdout).not.toContain(otherCommand);
        });
    });

    describe("given events across a time range", () => {
        it("filters by --last duration", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const sessionId = chance.guid();

            const recentCommand = `echo ${chance.word()}`;
            const oldCommand = `echo ${chance.word()}`;

            const recentEvent = makeScriptEndEvent({
                session_id: sessionId,
                command: recentCommand,
                timestamp: new Date().toISOString(),
            });
            const oldEvent = makeScriptEndEvent({
                session_id: sessionId,
                command: oldCommand,
                timestamp: new Date(
                    Date.now() - 3 * 60 * 60 * 1000,
                ).toISOString(),
            });

            await writeEventFile(eventsDir, sessionId, [recentEvent, oldEvent]);

            // Act
            const result = runLog(tmpDir, ["--last", "1h"]);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(recentCommand);
            expect(result.stdout).not.toContain(oldCommand);
        });
    });

    describe("given --json flag", () => {
        it("outputs valid JSON array with expected fields", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const sessionId = chance.guid();
            const event = makeScriptEndEvent({ session_id: sessionId });

            await writeEventFile(eventsDir, sessionId, [event]);

            // Act
            const result = runLog(tmpDir, ["--json", "--last", "1d"]);

            // Assert
            expect(result.status).toBe(0);

            const parsed = JSON.parse(result.stdout);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed.length).toBeGreaterThan(0);
            expect(parsed[0]).toHaveProperty("event", "script_end");
            expect(parsed[0]).toHaveProperty("session_id");
            expect(parsed[0]).toHaveProperty("command");
            expect(parsed[0]).toHaveProperty("actor");
            expect(parsed[0]).toHaveProperty("exit_code");
            expect(parsed[0]).toHaveProperty("timestamp");
        });
    });

    describe("given --list-sessions flag", () => {
        it("displays session summary table", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const sessionIdA = chance.guid();
            const sessionIdB = chance.guid();

            const eventA = makeScriptEndEvent({ session_id: sessionIdA });
            const eventB1 = makeScriptEndEvent({ session_id: sessionIdB });
            const eventB2 = makeScriptEndEvent({ session_id: sessionIdB });

            await writeEventFile(eventsDir, sessionIdA, [eventA]);
            await writeEventFile(eventsDir, sessionIdB, [eventB1, eventB2]);

            // Act
            const result = runLog(tmpDir, ["--list-sessions"]);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain("SESSION");
            expect(result.stdout).toContain(sessionIdA.slice(0, 8));
            expect(result.stdout).toContain(sessionIdB.slice(0, 8));
            // Session B has 2 events
            expect(result.stdout).toContain("2");
        });
    });

    describe("given multiple filter flags", () => {
        it("applies all filters with AND logic", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            const sessionId = chance.guid();

            const matchCommand = `echo ${chance.word()}`;
            const wrongActorCommand = `echo ${chance.word()}`;
            const successCommand = `echo ${chance.word()}`;

            const matchingEvent = makeScriptEndEvent({
                session_id: sessionId,
                actor: "human",
                exit_code: 1,
                command: matchCommand,
            });
            const wrongActorEvent = makeScriptEndEvent({
                session_id: sessionId,
                actor: "claude-code",
                exit_code: 1,
                command: wrongActorCommand,
            });
            const successEvent = makeScriptEndEvent({
                session_id: sessionId,
                actor: "human",
                exit_code: 0,
                command: successCommand,
            });

            await writeEventFile(eventsDir, sessionId, [
                matchingEvent,
                wrongActorEvent,
                successEvent,
            ]);

            // Act
            const result = runLog(tmpDir, [
                "--actor",
                "human",
                "--failures",
                "--last",
                "1d",
            ]);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(matchCommand);
            expect(result.stdout).not.toContain(wrongActorCommand);
            expect(result.stdout).not.toContain(successCommand);
        });
    });

    describe("given AGENTSHELL_LOG_DIR is set", () => {
        it("reads events from the custom directory", async () => {
            // Arrange
            const customDir = join(tmpDir, "custom-logs");
            const sessionId = chance.guid();
            const customCommand = `echo ${chance.word()}`;

            const event = makeScriptEndEvent({
                session_id: sessionId,
                command: customCommand,
            });
            await writeEventFile(customDir, sessionId, [event]);

            // Act
            const result = runLog(tmpDir, ["--last", "1d"], {
                AGENTSHELL_LOG_DIR: customDir,
            });

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(customCommand);
        });
    });

    describe("given invalid --last duration", () => {
        it("prints error and exits 1", async () => {
            // Arrange — need an events dir to exist so we get past the "no events" check
            const eventsDir = defaultEventsDir(tmpDir);
            await mkdir(eventsDir, { recursive: true });

            // Act
            const result = runLog(tmpDir, ["--last", "abc"]);

            // Assert
            expect(result.status).toBe(1);
            expect(result.stderr).toContain("Invalid duration format");
        });
    });

    describe("given events written by the shim", () => {
        it("reads them correctly via log subcommand", async () => {
            // Arrange
            const sessionId = chance.guid().replace(/-/g, "");

            // Write real events through the shim
            runShim(tmpDir, ["-c", "echo test1"], {
                AGENTSHELL_SESSION_ID: sessionId,
            });
            runShim(tmpDir, ["-c", "exit 1"], {
                AGENTSHELL_SESSION_ID: sessionId,
            });

            // Act
            const result = runLog(tmpDir, ["--json", "--last", "1d"]);

            // Assert
            expect(result.status).toBe(0);

            const events = JSON.parse(result.stdout);
            expect(events).toHaveLength(2);

            const commands = events.map(
                (e: Record<string, unknown>) => e.command,
            );
            expect(commands).toContain("echo test1");
            expect(commands).toContain("exit 1");

            const exitCodes = events.map(
                (e: Record<string, unknown>) => e.exit_code,
            );
            expect(exitCodes).toContain(0);
            expect(exitCodes).toContain(1);
        });
    });
});
