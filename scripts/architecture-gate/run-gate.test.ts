import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { CoachRun } from "./coach-verdict.js";
import { GateError } from "./gate-error.js";
import { POLICY_PATH } from "./policy-path.js";
import {
    COACH_ARGUMENTS,
    COACH_VERSION_ARGUMENTS,
    REQUIRED_COACH_VERSION,
    type RunCoach,
    runArchitectureGate,
} from "./run-gate.js";

const chance = new Chance();

const CLEAN_RUN: CoachRun = {
    exitCode: 0,
    stdout: JSON.stringify({
        // biome-ignore lint/style/useNamingConvention: coach's report format
        schema_version: "2",
        signals: [],
        // biome-ignore lint/style/useNamingConvention: coach's report format
        layer_membership: {
            // biome-ignore lint/style/useNamingConvention: coach's report format
            head: { analyzed_files: 1, files_outside_layers: 0 },
        },
    }),
    stderr: "",
};

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

const REPOSITORY_ROOT = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
);

const PINNED_VERSION = "0.12.0";
const VERSION_RUN: CoachRun = {
    exitCode: 0,
    stdout: `${PINNED_VERSION}\n`,
    stderr: "",
};

/** A coach that answers `--version` and the scan with the given runs. */
function coachAnswering(
    scan: CoachRun,
    version: CoachRun = VERSION_RUN,
): RunCoach {
    return async (args) => (args[0] === "--version" ? version : scan);
}

describe("REQUIRED_COACH_VERSION", () => {
    it("should be the version mise.toml pins, so a bump of one is a bump of both", () => {
        // Arrange
        const pin = /^"github:lousy-agents\/coach" = "([^"]+)"$/m.exec(
            readFileSync(resolve(REPOSITORY_ROOT, "mise.toml"), "utf8"),
        );

        // Assert
        expect(REQUIRED_COACH_VERSION).toBe(PINNED_VERSION);
        expect(pin?.[1]).toBe(REQUIRED_COACH_VERSION);
    });
});

describe("COACH_VERSION_ARGUMENTS", () => {
    it("should ask for the version as the first and only argument, where coach reads it", () => {
        // Assert
        expect([...COACH_VERSION_ARGUMENTS]).toEqual(["--version"]);
    });
});

describe("runArchitectureGate", () => {
    describe("when coach is the pinned version and completes with no layer violations", () => {
        it("should ask for its version, then run the scan with the fixed arguments, and pass", async () => {
            // Arrange
            const calls: Array<readonly string[]> = [];

            // Act
            const verdict = await runArchitectureGate(async (args) => {
                calls.push(args);
                return args[0] === "--version" ? VERSION_RUN : CLEAN_RUN;
            });

            // Assert
            expect(verdict.passed).toBe(true);
            expect(calls).toEqual([COACH_VERSION_ARGUMENTS, COACH_ARGUMENTS]);
        });

        it.each([
            ["no line break", "0.12.0"],
            ["a carriage return and a line feed", "0.12.0\r\n"],
            ["spaces around it", "  0.12.0 \n"],
        ])("should accept a version printed with %s", async (_what, stdout) => {
            // Act
            const verdict = await runArchitectureGate(
                coachAnswering(CLEAN_RUN, { ...VERSION_RUN, stdout }),
            );

            // Assert
            expect(verdict.passed).toBe(true);
        });
    });

    describe("when coach is not the pinned version", () => {
        it.each([
            ["an older release", "0.11.0\n"],
            ["a newer release", "0.12.1\n"],
            ["a pre-release of the pinned one", "0.12.0-rc1\n"],
            ["a build that is not a release", "dev\n"],
            ["a v prefix", "v0.12.0\n"],
            ["nothing at all", ""],
            ["only a line break", "\n"],
            ["the version on two lines", "0.12.0\n0.12.0\n"],
            ["the version among other words", "coach 0.12.0\n"],
        ])(
            "should fail without scanning when it prints %s",
            async (_what, stdout) => {
                // Arrange
                const calls: Array<readonly string[]> = [];
                const run: RunCoach = async (args) => {
                    calls.push(args);
                    return args[0] === "--version"
                        ? { ...VERSION_RUN, stdout }
                        : CLEAN_RUN;
                };

                // Act
                const verdict = await runArchitectureGate(run);

                // Assert
                expect(verdict.passed).toBe(false);
                const text = verdict.messages.join("\n");
                expect(text).toContain(`written for coach ${PINNED_VERSION}`);
                expect(text).toContain("mise");
                expect(calls).toEqual([COACH_VERSION_ARGUMENTS]);
            },
        );

        it("should name the version it found", async () => {
            // Act
            const verdict = await runArchitectureGate(
                coachAnswering(CLEAN_RUN, {
                    ...VERSION_RUN,
                    stdout: "0.11.0\n",
                }),
            );

            // Assert
            expect(verdict.messages.join("\n")).toContain('"0.11.0"');
        });

        it.each([
            [1, "a failure"],
            [2, "a usage error"],
        ])(
            "should fail without scanning when asking for the version exits %i (%s)",
            async (exitCode, _what) => {
                // Arrange
                const stderr = chance.sentence({ words: 4 });

                // Act
                const verdict = await runArchitectureGate(
                    coachAnswering(CLEAN_RUN, {
                        exitCode,
                        stdout: `${PINNED_VERSION}\n`,
                        stderr,
                    }),
                );

                // Assert
                expect(verdict.passed).toBe(false);
                const text = verdict.messages.join("\n");
                expect(text).toContain(`exit code ${exitCode}`);
                expect(text).toContain(stderr);
            },
        );

        it("should fail when asking for the version ends in a signal, as a timeout does", async () => {
            // Act
            const verdict = await runArchitectureGate(
                coachAnswering(CLEAN_RUN, {
                    exitCode: null,
                    stdout: "",
                    stderr: "",
                }),
            );

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain("signal");
        });
    });

    describe("when coach is the pinned version and reports a layer violation", () => {
        it("should still fail on the violation", async () => {
            // Arrange
            const violating: CoachRun = {
                exitCode: 0,
                stdout: JSON.stringify({
                    // biome-ignore lint/style/useNamingConvention: coach's report format
                    schema_version: "2",
                    signals: [
                        {
                            // biome-ignore lint/style/useNamingConvention: coach's report format
                            rule_id: "architecture.layer_violation",
                            path: "packages/core/src/entities/a.ts",
                            lifecycle: "baseline",
                            // biome-ignore lint/style/useNamingConvention: coach's report format
                            machine_evidence: {},
                        },
                    ],
                    // biome-ignore lint/style/useNamingConvention: coach's report format
                    layer_membership: {
                        // biome-ignore lint/style/useNamingConvention: coach's report format
                        head: { analyzed_files: 1, files_outside_layers: 0 },
                    },
                }),
                stderr: "",
            };

            // Act
            const verdict = await runArchitectureGate(
                coachAnswering(violating),
            );

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain(
                "architecture.layer_violation",
            );
        });
    });

    describe("when coach exits non-zero", () => {
        it("should fail with coach's own message", async () => {
            // Arrange
            const stderr = chance.sentence({ words: 5 });

            // Act
            const verdict = await runArchitectureGate(
                coachAnswering({ exitCode: 2, stdout: "", stderr }),
            );

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain(stderr);
        });
    });

    describe("when coach cannot be started", () => {
        it("should let the error through, and not scan", async () => {
            // Arrange
            const reason = `could not start coach: ${chance.word()}`;
            const calls: Array<readonly string[]> = [];

            // Act
            const result = runArchitectureGate(async (args) => {
                calls.push(args);
                throw new GateError(reason);
            });

            // Assert
            await expect(result).rejects.toThrow(reason);
            expect(calls).toEqual([COACH_VERSION_ARGUMENTS]);
        });
    });
});
