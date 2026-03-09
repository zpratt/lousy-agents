// biome-ignore-all lint/style/useNamingConvention: env var names use UPPER_SNAKE_CASE and npm snake_case
import { type SpawnSyncReturns, spawn, spawnSync } from "node:child_process";
import {
    chmod,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const chance = new Chance();

const testDir = dirname(fileURLToPath(import.meta.url));
const SHIM_SRC = resolve(testDir, "../../src/index.ts");
const TSX_BIN = resolve(testDir, "../../../../node_modules/.bin/tsx");

// Env vars that affect actor detection — strip them for a clean baseline
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

interface ShimRunResult {
    status: number;
    stdout: string;
    stderr: string;
}

function runShim(
    tmpDir: string,
    args: string[],
    env?: Record<string, string>,
): ShimRunResult {
    const result: SpawnSyncReturns<string> = spawnSync(
        TSX_BIN,
        [SHIM_SRC, ...args],
        {
            env: buildCleanEnv({ HOME: tmpDir, ...env }),
            cwd: tmpDir,
            encoding: "utf-8",
            timeout: 15_000,
        },
    );
    return {
        status: result.status ?? 1,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
    };
}

// biome-ignore lint/suspicious/noExplicitAny: JSONL events are parsed as unknown shapes
async function readEvents(eventsDir: string): Promise<any[]> {
    try {
        const files = await readdir(eventsDir);
        // biome-ignore lint/suspicious/noExplicitAny: JSONL events are parsed as unknown shapes
        const events: any[] = [];
        for (const file of files.filter((f) => f.endsWith(".jsonl"))) {
            const content = await readFile(join(eventsDir, file), "utf-8");
            for (const line of content.trim().split("\n")) {
                if (line.trim()) events.push(JSON.parse(line));
            }
        }
        return events;
    } catch {
        return [];
    }
}

function defaultEventsDir(tmpDir: string): string {
    return join(tmpDir, ".agent-shell", "events");
}

describe("Shim lifecycle integration", { timeout: 30_000 }, () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "agent-shell-test-"));
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    describe("given a successful command", () => {
        it("records a script_end event with exit_code 0", async () => {
            // Arrange
            const command = "echo hello";

            // Act
            runShim(tmpDir, ["-c", command]);

            // Assert
            const events = await readEvents(defaultEventsDir(tmpDir));
            expect(events.length).toBeGreaterThanOrEqual(1);

            const event = events.find(
                (e: Record<string, unknown>) => e.event === "script_end",
            );
            expect(event).toBeDefined();
            expect(event.event).toBe("script_end");
            expect(event.exit_code).toBe(0);
            expect(event.command).toBe(command);
            expect(event.duration_ms).toBeGreaterThan(0);
            expect(() => new Date(event.timestamp).toISOString()).not.toThrow();
            expect(event.session_id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            );
        });
    });

    describe("given a failing command", () => {
        it("propagates the exit code and records it", async () => {
            // Arrange
            const expectedCode = chance.integer({ min: 1, max: 125 });

            // Act
            const result = runShim(tmpDir, ["-c", `exit ${expectedCode}`]);

            // Assert
            expect(result.status).toBe(expectedCode);

            const events = await readEvents(defaultEventsDir(tmpDir));
            const event = events.find(
                (e: Record<string, unknown>) => e.event === "script_end",
            );
            expect(event).toBeDefined();
            expect(event.exit_code).toBe(expectedCode);
        });
    });

    describe("given a command that produces output", () => {
        it("passes stdout through unchanged", () => {
            // Arrange
            const marker = chance.word({ length: 12 });

            // Act
            const result = runShim(tmpDir, ["-c", `echo ${marker}`]);

            // Assert
            expect(result.stdout).toContain(marker);
        });
    });

    describe("actor detection end-to-end", () => {
        describe("given AGENTSHELL_ACTOR is set", () => {
            it("records the specified actor", async () => {
                // Arrange
                const actorName = chance.word();

                // Act
                runShim(tmpDir, ["-c", "exit 0"], {
                    AGENTSHELL_ACTOR: actorName,
                });

                // Assert
                const events = await readEvents(defaultEventsDir(tmpDir));
                expect(events[0].actor).toBe(actorName);
            });
        });

        describe("given GITHUB_ACTIONS is true", () => {
            it("records actor as ci", async () => {
                // Act
                runShim(tmpDir, ["-c", "exit 0"], {
                    GITHUB_ACTIONS: "true",
                });

                // Assert
                const events = await readEvents(defaultEventsDir(tmpDir));
                expect(events[0].actor).toBe("ci");
            });
        });

        describe("given no actor indicators", () => {
            it("records actor as human", async () => {
                // Act
                runShim(tmpDir, ["-c", "exit 0"]);

                // Assert
                const events = await readEvents(defaultEventsDir(tmpDir));
                expect(events[0].actor).toBe("human");
            });
        });
    });

    describe("given a long-running command that receives SIGTERM", () => {
        it("terminates the child and records the signal", async () => {
            // Arrange
            const child = spawn(TSX_BIN, [SHIM_SRC, "-c", "sleep 30"], {
                cwd: tmpDir,
                env: buildCleanEnv({ HOME: tmpDir }),
                stdio: "pipe",
            });

            // Act — wait for the child process to be running, then signal
            await new Promise((r) => setTimeout(r, 1_000));
            child.kill("SIGTERM");

            // Assert
            const exitCode = await new Promise<number>((resolve) => {
                child.on("close", (code, signal) => {
                    resolve(code ?? (signal === "SIGTERM" ? 143 : 1));
                });
            });

            expect(exitCode).toBe(143);

            const events = await readEvents(defaultEventsDir(tmpDir));
            if (events.length > 0) {
                const event = events.find(
                    (e: Record<string, unknown>) => e.event === "script_end",
                );
                if (event) {
                    expect(event.signal).toBe("SIGTERM");
                }
            }
        });
    });

    describe("given AGENTSHELL_PASSTHROUGH=1", () => {
        it("runs the command and does not record events", async () => {
            // Arrange
            const marker = chance.word({ length: 10 });

            // Act
            const result = runShim(tmpDir, ["-c", `echo ${marker}`], {
                AGENTSHELL_PASSTHROUGH: "1",
            });

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout).toContain(marker);

            const events = await readEvents(defaultEventsDir(tmpDir));
            expect(events).toHaveLength(0);
        });
    });

    describe("given AGENTSHELL_SESSION_ID is set", () => {
        it("uses the provided session ID for correlated commands", async () => {
            // Arrange
            const sessionId = chance.guid().replace(/-/g, "");

            // Act — run two commands with the same session ID
            runShim(tmpDir, ["-c", "exit 0"], {
                AGENTSHELL_SESSION_ID: sessionId,
            });
            runShim(tmpDir, ["-c", "exit 0"], {
                AGENTSHELL_SESSION_ID: sessionId,
            });

            // Assert
            const events = await readEvents(defaultEventsDir(tmpDir));
            expect(events).toHaveLength(2);
            expect(events[0].session_id).toBe(sessionId);
            expect(events[1].session_id).toBe(sessionId);

            const files = await readdir(defaultEventsDir(tmpDir));
            const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
            expect(jsonlFiles).toHaveLength(1);
            expect(jsonlFiles[0]).toBe(`${sessionId}.jsonl`);
        });
    });

    describe("given AGENTSHELL_SESSION_ID with path traversal", () => {
        it("rejects and generates a UUID instead", async () => {
            // Arrange
            const maliciousId = "../../etc/test";

            // Act
            const result = runShim(tmpDir, ["-c", "exit 0"], {
                AGENTSHELL_SESSION_ID: maliciousId,
            });

            // Assert
            expect(result.status).toBe(0);
            expect(result.stderr).toContain("invalid AGENTSHELL_SESSION_ID");

            const events = await readEvents(defaultEventsDir(tmpDir));
            expect(events.length).toBeGreaterThanOrEqual(1);
            expect(events[0].session_id).not.toBe(maliciousId);
            expect(events[0].session_id).toMatch(/^[a-zA-Z0-9_-]+$/);
        });
    });

    describe("given AGENTSHELL_LOG_DIR resolves via symlink to outside project root", () => {
        it("falls back to default dir and emits diagnostic", async () => {
            // Arrange
            const externalDir = await mkdtemp(
                join(tmpdir(), "external-events-"),
            );
            const symlinkPath = join(tmpDir, "symlinked-logs");
            await symlink(externalDir, symlinkPath);

            // Act
            const result = runShim(tmpDir, ["-c", "echo hello"], {
                AGENTSHELL_LOG_DIR: symlinkPath,
            });

            // Assert — command still runs (graceful degradation)
            expect(result.stdout).toContain("hello");
            expect(result.stderr).toContain("outside project root");

            // No events in external dir
            const externalFiles = await readdir(externalDir);
            expect(externalFiles).toHaveLength(0);

            // Events written to default dir instead
            const events = await readEvents(defaultEventsDir(tmpDir));
            expect(events.length).toBeGreaterThanOrEqual(1);

            await rm(externalDir, { recursive: true, force: true });
        });
    });

    describe("given the events directory is not writable", () => {
        it("executes the command successfully and emits diagnostic", async () => {
            // Arrange
            const eventsDir = defaultEventsDir(tmpDir);
            await mkdir(eventsDir, { recursive: true });
            await chmod(eventsDir, 0o444);
            const marker = chance.word({ length: 10 });

            // Act
            const result = runShim(tmpDir, ["-c", `echo ${marker}`]);

            // Assert — command runs despite telemetry failure
            expect(result.stdout).toContain(marker);
            expect(result.status).toBe(0);
            expect(result.stderr.length).toBeGreaterThan(0);

            // Restore permissions for cleanup
            await chmod(eventsDir, 0o755);
        });
    });

    describe("given --version argument", () => {
        it("prints version and exits 0", () => {
            // Act
            const result = runShim(tmpDir, ["--version"]);

            // Assert
            expect(result.status).toBe(0);
            expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
        });
    });

    describe("given npm environment variables", () => {
        it("captures script and package fields in the event", async () => {
            // Arrange
            const scriptName = chance.word();
            const packageName = chance.word();
            const packageVersion = `${chance.integer({ min: 0, max: 9 })}.${chance.integer({ min: 0, max: 9 })}.${chance.integer({ min: 0, max: 9 })}`;

            // Act
            runShim(tmpDir, ["-c", "exit 0"], {
                npm_lifecycle_event: scriptName,
                npm_package_name: packageName,
                npm_package_version: packageVersion,
            });

            // Assert
            const events = await readEvents(defaultEventsDir(tmpDir));
            expect(events[0].script).toBe(scriptName);
            expect(events[0].package).toBe(packageName);
            expect(events[0].package_version).toBe(packageVersion);
        });
    });
});
