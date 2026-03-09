// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    formatEventsJson,
    formatEventsTable,
    formatSessionsTable,
} from "../../src/log/format.js";
import { parseLogArgs } from "../../src/log/index.js";
import type { SessionSummary } from "../../src/log/query.js";
import type {
    ScriptEndEvent,
    ScriptEvent,
    ShimErrorEvent,
} from "../../src/types.js";

const chance = new Chance();

function buildScriptEndEvent(
    overrides: Partial<ScriptEndEvent> = {},
): ScriptEndEvent {
    return {
        v: 1,
        session_id: chance.guid(),
        event: "script_end",
        command: chance.word(),
        actor: chance.word(),
        exit_code: chance.integer({ min: 0, max: 255 }),
        signal: null,
        duration_ms: chance.floating({ min: 0, max: 60000, fixed: 2 }),
        timestamp: new Date().toISOString(),
        script: chance.word(),
        env: {},
        tags: {},
        ...overrides,
    };
}

function buildShimErrorEvent(
    overrides: Partial<ShimErrorEvent> = {},
): ShimErrorEvent {
    return {
        v: 1,
        session_id: chance.guid(),
        event: "shim_error",
        command: chance.word(),
        actor: chance.word(),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

describe("event table formatting", () => {
    it("should format events in a table with correct column headers", () => {
        // Arrange
        const actor = chance.word();
        const script = chance.word();
        const event = buildScriptEndEvent({
            actor,
            script,
            exit_code: 0,
            duration_ms: 3400,
            command: "vitest run",
            timestamp: "2026-03-08T14:32:01.123Z",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        const lines = result.split("\n");
        expect(lines[0]).toContain("TIMESTAMP");
        expect(lines[0]).toContain("SCRIPT");
        expect(lines[0]).toContain("ACTOR");
        expect(lines[0]).toContain("EXIT");
        expect(lines[0]).toContain("DURATION");
        expect(lines[0]).toContain("COMMAND");
    });

    it("should include event data in the formatted row", () => {
        // Arrange
        const actor = chance.word();
        const script = chance.word();
        const event = buildScriptEndEvent({
            actor,
            script,
            exit_code: 1,
            duration_ms: 3400,
            command: "vitest run",
            timestamp: "2026-03-08T14:32:01.123Z",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        const lines = result.split("\n");
        const dataLine = lines[1];
        expect(dataLine).toContain("2026-03-08 14:32:01");
        expect(dataLine).toContain(script);
        expect(dataLine).toContain(actor);
        expect(dataLine).toContain("1");
        expect(dataLine).toContain("3.4s");
        expect(dataLine).toContain("vitest run");
    });

    it("should show '-' for script field when absent on shim_error events", () => {
        // Arrange
        const event: ScriptEvent = buildShimErrorEvent({
            timestamp: "2026-03-08T14:32:01.123Z",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        const lines = result.split("\n");
        const dataLine = lines[1];
        expect(dataLine).toContain("-");
    });

    it("should show '-' for exit code and duration on shim_error events", () => {
        // Arrange
        const event: ScriptEvent = buildShimErrorEvent({
            timestamp: "2026-03-08T14:32:01.123Z",
            command: "some-cmd",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        const lines = result.split("\n");
        const dataLine = lines[1];
        // The columns for EXIT and DURATION should contain "-"
        const columns = dataLine.split(/\s{2,}/);
        // TIMESTAMP, SCRIPT(-), ACTOR, EXIT(-), DURATION(-), COMMAND
        const exitCol = columns.find((_col, idx) => idx === 3);
        const durationCol = columns.find((_col, idx) => idx === 4);
        expect(exitCol?.trim()).toBe("-");
        expect(durationCol?.trim()).toBe("-");
    });

    it("should truncate long commands with '...'", () => {
        // Arrange
        const longCommand = "a".repeat(60);
        const event = buildScriptEndEvent({
            command: longCommand,
            timestamp: "2026-03-08T14:32:01.123Z",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        const lines = result.split("\n");
        const dataLine = lines[1];
        expect(dataLine).toContain(`${"a".repeat(47)}...`);
        expect(dataLine).not.toContain("a".repeat(51));
    });

    it("should format duration in milliseconds for short durations", () => {
        // Arrange
        const event = buildScriptEndEvent({
            duration_ms: 142,
            timestamp: "2026-03-08T14:32:01.123Z",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        expect(result).toContain("142ms");
    });

    it("should format duration in seconds for medium durations", () => {
        // Arrange
        const event = buildScriptEndEvent({
            duration_ms: 3400,
            timestamp: "2026-03-08T14:32:01.123Z",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        expect(result).toContain("3.4s");
    });

    it("should format duration in minutes for long durations", () => {
        // Arrange
        const event = buildScriptEndEvent({
            duration_ms: 120000,
            timestamp: "2026-03-08T14:32:01.123Z",
        });

        // Act
        const result = formatEventsTable([event]);

        // Assert
        expect(result).toContain("2.0m");
    });

    it("should return header only when events array is empty", () => {
        // Arrange & Act
        const result = formatEventsTable([]);

        // Assert
        const lines = result.split("\n").filter((l) => l.trim() !== "");
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain("TIMESTAMP");
    });
});

describe("session table formatting", () => {
    it("should format sessions with truncated session IDs", () => {
        // Arrange
        const sessionId = chance.guid();
        const session: SessionSummary = {
            sessionId,
            firstEvent: "2026-03-08T14:00:00.000Z",
            lastEvent: "2026-03-08T15:00:00.000Z",
            eventCount: 42,
            actors: ["claude-code"],
        };

        // Act
        const result = formatSessionsTable([session]);

        // Assert
        const lines = result.split("\n");
        expect(lines[0]).toContain("SESSION");
        expect(lines[1]).toContain(sessionId.slice(0, 8));
        expect(lines[1]).not.toContain(sessionId);
    });

    it("should show comma-separated actors", () => {
        // Arrange
        const actor1 = chance.word();
        const actor2 = chance.word();
        const session: SessionSummary = {
            sessionId: chance.guid(),
            firstEvent: "2026-03-08T14:00:00.000Z",
            lastEvent: "2026-03-08T15:00:00.000Z",
            eventCount: 10,
            actors: [actor1, actor2],
        };

        // Act
        const result = formatSessionsTable([session]);

        // Assert
        const lines = result.split("\n");
        expect(lines[1]).toContain(`${actor1}, ${actor2}`);
    });
});

describe("JSON formatting", () => {
    it("should output valid JSON array", () => {
        // Arrange
        const event = buildScriptEndEvent();

        // Act
        const result = formatEventsJson([event]);

        // Assert
        const parsed = JSON.parse(result);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed).toHaveLength(1);
    });

    it("should output empty array for no events", () => {
        // Arrange & Act
        const result = formatEventsJson([]);

        // Assert
        const parsed = JSON.parse(result);
        expect(parsed).toEqual([]);
    });
});

describe("log argument parsing", () => {
    it("should parse --last flag with value", () => {
        // Arrange
        const args = ["--last", "30m"];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.last).toBe("30m");
    });

    it("should parse --actor flag with value", () => {
        // Arrange
        const actorName = chance.word();
        const args = ["--actor", actorName];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.actor).toBe(actorName);
    });

    it("should parse --failures flag", () => {
        // Arrange
        const args = ["--failures"];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.failures).toBe(true);
    });

    it("should parse --script flag with value", () => {
        // Arrange
        const scriptName = chance.word();
        const args = ["--script", scriptName];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.script).toBe(scriptName);
    });

    it("should parse --list-sessions flag", () => {
        // Arrange
        const args = ["--list-sessions"];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.listSessions).toBe(true);
    });

    it("should parse --json flag", () => {
        // Arrange
        const args = ["--json"];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.json).toBe(true);
    });

    it("should combine multiple flags", () => {
        // Arrange
        const actorName = chance.word();
        const args = [
            "--last",
            "1h",
            "--actor",
            actorName,
            "--failures",
            "--json",
        ];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.last).toBe("1h");
        expect(result.actor).toBe(actorName);
        expect(result.failures).toBe(true);
        expect(result.json).toBe(true);
    });

    it("should default all flags to off or undefined", () => {
        // Arrange
        const args: string[] = [];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.last).toBeUndefined();
        expect(result.actor).toBeUndefined();
        expect(result.failures).toBe(false);
        expect(result.script).toBeUndefined();
        expect(result.listSessions).toBe(false);
        expect(result.json).toBe(false);
    });

    it("should record an error when --last has no following value", () => {
        // Arrange
        const args = ["--last"];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.errors).toBeDefined();
        expect(result.errors).toEqual(
            expect.arrayContaining([expect.stringContaining("--last")]),
        );
    });

    it("should record an error when --actor has no following value", () => {
        // Arrange
        const args = ["--actor"];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.errors).toBeDefined();
        expect(result.errors).toEqual(
            expect.arrayContaining([expect.stringContaining("--actor")]),
        );
    });

    it("should record an error when --script has no following value", () => {
        // Arrange
        const args = ["--script"];

        // Act
        const result = parseLogArgs(args);

        // Assert
        expect(result.errors).toBeDefined();
        expect(result.errors).toEqual(
            expect.arrayContaining([expect.stringContaining("--script")]),
        );
    });
});
