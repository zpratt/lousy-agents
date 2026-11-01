import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { CoachRun } from "./coach-verdict.js";
import { GateError } from "./gate-error.js";
import {
    COACH_ARGUMENTS,
    POLICY_PATH,
    runArchitectureGate,
} from "./run-gate.js";

const chance = new Chance();

describe("COACH_ARGUMENTS", () => {
    it("should scan every tracked file at HEAD against the committed policy and fail on incomplete coverage", () => {
        // Act
        const argumentsPassed = [...COACH_ARGUMENTS];

        // Assert
        expect(argumentsPassed).toEqual([
            "codesignal",
            "--baseline",
            "--project-config",
            POLICY_PATH,
            "--project-language",
            "typescript",
            "--no-interactive",
            "--fail-on-incomplete-coverage",
            "--format",
            "json",
        ]);
    });
});

describe("runArchitectureGate", () => {
    describe("when coach completes with no layer violations", () => {
        it("should run coach once with the fixed arguments and pass", async () => {
            // Arrange
            const calls: Array<readonly string[]> = [];
            const run: CoachRun = {
                exitCode: 0,
                // biome-ignore lint/style/useNamingConvention: coach's report format
                stdout: JSON.stringify({ schema_version: "2", signals: [] }),
                stderr: "",
            };

            // Act
            const verdict = await runArchitectureGate(async (args) => {
                calls.push(args);
                return run;
            });

            // Assert
            expect(verdict.passed).toBe(true);
            expect(calls).toEqual([COACH_ARGUMENTS]);
        });
    });

    describe("when coach exits non-zero", () => {
        it("should fail with coach's own message", async () => {
            // Arrange
            const stderr = chance.sentence({ words: 5 });

            // Act
            const verdict = await runArchitectureGate(async () => ({
                exitCode: 2,
                stdout: "",
                stderr,
            }));

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain(stderr);
        });
    });

    describe("when coach cannot be started", () => {
        it("should let the error through rather than report a pass", async () => {
            // Arrange
            const reason = `could not start coach: ${chance.word()}`;

            // Act
            const result = runArchitectureGate(async () => {
                throw new GateError(reason);
            });

            // Assert
            await expect(result).rejects.toThrow(reason);
        });
    });
});
