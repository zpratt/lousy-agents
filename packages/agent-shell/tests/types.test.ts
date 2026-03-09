// biome-ignore-all lint/style/useNamingConvention: telemetry schema uses snake_case field names
import Chance from "chance";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, ScriptEventSchema } from "../src/types.js";

const chance = new Chance();

function buildScriptEndEvent(overrides: Record<string, unknown> = {}) {
    return {
        v: 1 as const,
        session_id: chance.guid(),
        event: "script_end" as const,
        command: chance.word(),
        actor: chance.word(),
        exit_code: chance.integer({ min: 0, max: 255 }),
        signal: null,
        duration_ms: chance.floating({ min: 0, max: 60000, fixed: 2 }),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

function buildShimErrorEvent(overrides: Record<string, unknown> = {}) {
    return {
        v: 1 as const,
        session_id: chance.guid(),
        event: "shim_error" as const,
        command: chance.word(),
        actor: chance.word(),
        timestamp: new Date().toISOString(),
        env: {},
        tags: {},
        ...overrides,
    };
}

describe("ScriptEvent schema", () => {
    describe("schema version constant", () => {
        it("should equal 1", () => {
            expect(SCHEMA_VERSION).toBe(1);
        });
    });

    describe("given a valid script_end event", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildScriptEndEvent();

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("script_end");
            expect(result.session_id).toBe(event.session_id);
        });

        it("should accept optional script, package, and package_version fields", () => {
            // Arrange
            const event = buildScriptEndEvent({
                script: chance.word(),
                package: chance.word(),
                package_version: chance.semver(),
            });

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("script_end");
        });
    });

    describe("given a valid shim_error event", () => {
        it("should parse successfully", () => {
            // Arrange
            const event = buildShimErrorEvent();

            // Act
            const result = ScriptEventSchema.parse(event);

            // Assert
            expect(result.event).toBe("shim_error");
            expect(result.session_id).toBe(event.session_id);
        });
    });

    describe("given a script_end event missing exit_code", () => {
        it("should fail validation", () => {
            // Arrange
            const event = buildScriptEndEvent();
            const { exit_code: _, ...withoutExitCode } = event;

            // Act & Assert
            expect(() => ScriptEventSchema.parse(withoutExitCode)).toThrow();
        });
    });

    describe("given a shim_error event with an exit_code field", () => {
        it("should fail validation because shim_error does not include exit_code", () => {
            // Arrange
            const event = buildShimErrorEvent({
                exit_code: chance.integer({ min: 0, max: 255 }),
            });

            // Act & Assert
            expect(() => ScriptEventSchema.parse(event)).toThrow();
        });
    });

    describe("given an invalid event type", () => {
        it("should fail validation", () => {
            // Arrange
            const event = {
                v: 1,
                session_id: chance.guid(),
                event: "unknown_event",
                command: chance.word(),
                actor: chance.word(),
                timestamp: new Date().toISOString(),
                env: {},
                tags: {},
            };

            // Act & Assert
            expect(() => ScriptEventSchema.parse(event)).toThrow();
        });
    });
});
