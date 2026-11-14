import Chance from "chance";
import { describe, expect, it } from "vitest";
import { evaluateCoachRun } from "./coach-verdict.js";

const chance = new Chance();

const LAYER_VIOLATION = "architecture.layer_violation";

interface SignalOptions {
    readonly lifecycle?: string;
    readonly evidence?: unknown;
}

function signal(ruleId: string, path: string, options: SignalOptions = {}) {
    return {
        // biome-ignore lint/style/useNamingConvention: coach's report format
        rule_id: ruleId,
        path,
        lifecycle: options.lifecycle ?? "baseline",
        // biome-ignore lint/style/useNamingConvention: coach's report format
        machine_evidence: options.evidence,
    };
}

function violationEvidence(importer: string, importee: string, rule: string) {
    return {
        importer,
        importee,
        // biome-ignore lint/style/useNamingConvention: coach's report format
        layer_from: "entities",
        // biome-ignore lint/style/useNamingConvention: coach's report format
        layer_to: "use_cases",
        rule,
    };
}

/** A valid violation signal with one field replaced, to build a malformed one. */
function signalWithField(field: string, value: string) {
    return { ...signal(LAYER_VIOLATION, "a.ts"), [field]: value };
}

function layerMembership(filesOutsideLayers: unknown) {
    return {
        head: {
            revision: "0123456789abcdef0123456789abcdef01234567",
            // biome-ignore lint/style/useNamingConvention: coach's report format
            analyzed_files: 258,
            // biome-ignore lint/style/useNamingConvention: coach's report format
            files_outside_layers: filesOutsideLayers,
        },
    };
}

function report(
    signals: unknown,
    schemaVersion: unknown = "2",
    membership: unknown = layerMembership(0),
) {
    return JSON.stringify({
        // biome-ignore lint/style/useNamingConvention: coach's report format
        schema_version: schemaVersion,
        signals,
        // biome-ignore lint/style/useNamingConvention: coach's report format
        layer_membership: membership,
    });
}

function cleanRun(stdout: string) {
    return { exitCode: 0, stdout, stderr: "" };
}

describe("evaluateCoachRun", () => {
    describe("when coach completes and reports no layer violations", () => {
        it("should pass", () => {
            // Arrange
            const run = cleanRun(report([]));

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(true);
        });

        it("should ignore advisory signals from the file-local rules", () => {
            // Arrange
            const run = cleanRun(
                report([
                    signal("complexity.cognitive_complexity", "a.ts"),
                    signal("state.hidden_input_mutation", "b.ts"),
                    signal("complexity.branch_density", "c.ts"),
                ]),
            );

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(true);
        });
    });

    describe("when coach reports a layer violation", () => {
        it("should fail and name the importer, the importee and the forbidden pair", () => {
            // Arrange
            const importer = `packages/core/src/entities/${chance.word()}.ts`;
            const importee = `packages/core/src/use-cases/${chance.word()}.ts`;
            const pair = "entities->use_cases";
            const run = cleanRun(
                report([
                    signal(LAYER_VIOLATION, importer, {
                        evidence: violationEvidence(importer, importee, pair),
                    }),
                ]),
            );

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain(
                `${importer} -> ${importee} (${pair})`,
            );
        });

        it.each(["baseline", "existing", "introduced"])(
            "should fail for a %s violation, not only for newly introduced ones",
            (lifecycle) => {
                // Arrange
                const run = cleanRun(
                    report([
                        signal(LAYER_VIOLATION, "packages/a/src/x.ts", {
                            lifecycle,
                        }),
                    ]),
                );

                // Act
                const verdict = evaluateCoachRun(run);

                // Assert
                expect(verdict.passed).toBe(false);
            },
        );

        it("should still fail and name the path when the evidence is missing", () => {
            // Arrange
            const path = `packages/${chance.word()}/src/x.ts`;
            const run = cleanRun(report([signal(LAYER_VIOLATION, path)]));

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain(path);
        });

        it("should report every violation, not just the first", () => {
            // Arrange
            const paths = [chance.word(), chance.word(), chance.word()].map(
                (word, index) => `packages/${word}${index}/src/x.ts`,
            );
            const run = cleanRun(
                report(paths.map((path) => signal(LAYER_VIOLATION, path))),
            );

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            const text = verdict.messages.join("\n");
            expect(paths.every((path) => text.includes(path))).toBe(true);
        });
    });

    describe("when a rule id only resembles the layer violation rule", () => {
        it.each([
            "architecture.layer_bypass",
            "architecture.layer_violation_extra",
            "architecture.layer_violations",
            "architecture.other_rule",
            "x.architecture.layer_violation",
        ])("should not fail the gate for %s", (ruleId) => {
            // Arrange
            const run = cleanRun(
                report([signal(ruleId, "packages/a/src/x.ts")]),
            );

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(true);
        });
    });

    describe("when a violation's evidence is not what the gate expects", () => {
        it.each([
            ["a string", "importer to importee"],
            ["a number", 7],
            ["null", null],
            ["an empty object", {}],
            [
                "an object whose fields are not text",
                { importer: 1, importee: false, rule: [] },
            ],
        ])(
            "should still fail the gate and name the path when it is %s",
            (_label, evidence) => {
                // Arrange
                const path = `packages/${chance.word()}/src/x.ts`;
                const run = cleanRun(
                    report([signal(LAYER_VIOLATION, path, { evidence })]),
                );

                // Act
                const verdict = evaluateCoachRun(run);

                // Assert
                expect(verdict.passed).toBe(false);
                expect(verdict.messages.join("\n")).toContain(path);
            },
        );
    });

    describe("when a violation's evidence names only part of the import", () => {
        it.each([
            ["only the importer", { importer: "packages/a/src/x.ts" }],
            ["only the importee", { importee: "packages/b/src/y.ts" }],
            [
                "an empty importer and an importee",
                { importer: "", importee: "packages/b/src/y.ts" },
            ],
        ])(
            "should name the path and no half-known import when it has %s",
            (_label, evidence) => {
                // Arrange
                const path = `packages/${chance.word()}/src/x.ts`;
                const run = cleanRun(
                    report([signal(LAYER_VIOLATION, path, { evidence })]),
                );

                // Act
                const verdict = evaluateCoachRun(run);

                // Assert
                const text = verdict.messages.join("\n");
                expect(text).toContain(
                    `  ${path} (the report names no import)`,
                );
                expect(text).not.toContain("undefined");
                expect(text).not.toContain(" -> ");
            },
        );
    });

    describe("when coach did not complete", () => {
        it.each([
            [1, "operational failure"],
            [2, "usage or configuration failure"],
        ])(
            "should fail on exit code %i (%s), whatever it printed",
            (exitCode, _meaning) => {
                // Arrange
                const stderr = `coach: ${chance.sentence({ words: 4 })}`;
                const run = { exitCode, stdout: report([]), stderr };

                // Act
                const verdict = evaluateCoachRun(run);

                // Assert
                expect(verdict.passed).toBe(false);
                const text = verdict.messages.join("\n");
                expect(text).toContain(`exit code ${exitCode}`);
                expect(text).toContain(stderr);
            },
        );

        it("should say that coach reported incomplete coverage on exit 3, and where to look", () => {
            // Arrange
            const stderr = `coach: ${chance.sentence({ words: 4 })}`;
            const run = { exitCode: 3, stdout: report([]), stderr };

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(false);
            const text = verdict.messages.join("\n");
            expect(text).toContain(
                "coach reported incomplete coverage (exit 3)",
            );
            expect(text).toContain("coverage diagnostics");
            expect(text).toContain("mise run coach-baseline");
            expect(text).toContain(stderr);
            expect(text).not.toContain("exit code 3");
        });

        it("should fail when coach was killed by a signal", () => {
            // Arrange
            const run = { exitCode: null, stdout: "", stderr: "" };

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain("did not exit");
        });
    });

    describe("when coach reports files that no declared layer claims", () => {
        it("should fail and say how many files the layer rules did not check", () => {
            // Arrange
            const outside = chance.integer({ min: 1, max: 40 });
            const run = cleanRun(report([], "2", layerMembership(outside)));

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            expect(verdict.passed).toBe(false);
            expect(verdict.messages.join("\n")).toContain(
                `${outside} of 258 files coach analyzed sit outside every declared layer`,
            );
        });

        it("should report the files outside layers alongside any layer violation", () => {
            // Arrange
            const run = cleanRun(
                report(
                    [signal(LAYER_VIOLATION, "a.ts")],
                    "2",
                    layerMembership(2),
                ),
            );

            // Act
            const verdict = evaluateCoachRun(run);

            // Assert
            const text = verdict.messages.join("\n");
            expect(text).toContain(LAYER_VIOLATION);
            expect(text).toContain("2 of 258 files coach analyzed");
        });
    });

    describe("when coach exits 0 with output the gate cannot trust", () => {
        const untrustworthy: ReadonlyArray<readonly [string, string, RegExp]> =
            [
                ["empty output", "", /printed nothing/],
                ["whitespace-only output", " \n\t", /printed nothing/],
                ["output that is not JSON", "not json {", /not valid JSON/],
                ["a JSON array", "[]", /report must be a JSON object/],
                [
                    "an unexpected schema version",
                    report([], "3"),
                    /schema_version must be "2"/,
                ],
                [
                    "a numeric schema version, not the string coach writes",
                    report([], 2),
                    /schema_version must be "2"/,
                ],
                [
                    "a report with no schema version",
                    JSON.stringify({ signals: [] }),
                    /schema_version must be "2"/,
                ],
                [
                    "a report with no layer membership",
                    // biome-ignore lint/style/useNamingConvention: coach's report format
                    JSON.stringify({ schema_version: "2", signals: [] }),
                    /layer_membership must be a JSON object/,
                ],
                [
                    "a layer membership with no head revision",
                    report([], "2", {}),
                    /layer_membership\.head must be a JSON object/,
                ],
                [
                    "a negative count of files outside layers",
                    report([], "2", layerMembership(-1)),
                    /files_outside_layers must be a whole number/,
                ],
                [
                    "a count of files outside layers that is not a number",
                    report([], "2", layerMembership("0")),
                    /files_outside_layers must be a whole number/,
                ],
                [
                    "a report with no signals list",
                    // biome-ignore lint/style/useNamingConvention: coach's report format
                    JSON.stringify({ schema_version: "2" }),
                    /signals must be an array/,
                ],
                [
                    "a signal with an empty rule id",
                    report([signalWithField("rule_id", "")]),
                    /signals\[0\]\.rule_id must be a non-empty string/,
                ],
                [
                    "a signal with an empty path",
                    report([signalWithField("path", "")]),
                    /signals\[0\]\.path must be a non-empty string/,
                ],
                [
                    "a signal with an empty lifecycle",
                    report([signalWithField("lifecycle", "")]),
                    /signals\[0\]\.lifecycle must be a non-empty string/,
                ],
                [
                    "a signal that is not an object",
                    report(["architecture.layer_violation"]),
                    /signals\[0\] must be a JSON object/,
                ],
                [
                    "a signal whose rule id is not text",
                    report([
                        // biome-ignore lint/style/useNamingConvention: coach's report format
                        { rule_id: 7, path: "a.ts", lifecycle: "baseline" },
                    ]),
                    /signals\[0\]\.rule_id must be a non-empty string/,
                ],
                [
                    "a signals list that is an object",
                    report({}),
                    /signals must be an array/,
                ],
                [
                    "a signal with no rule id",
                    report([{ path: "a.ts", lifecycle: "baseline" }]),
                    /signals\[0\]\.rule_id must be a non-empty string/,
                ],
                [
                    "a signal with no path",
                    report([
                        // biome-ignore lint/style/useNamingConvention: coach's report format
                        { rule_id: LAYER_VIOLATION, lifecycle: "baseline" },
                    ]),
                    /signals\[0\]\.path must be a non-empty string/,
                ],
                [
                    "a signal with no lifecycle",
                    // biome-ignore lint/style/useNamingConvention: coach's report format
                    report([{ rule_id: LAYER_VIOLATION, path: "a.ts" }]),
                    /signals\[0\]\.lifecycle must be a non-empty string/,
                ],
            ];

        it.each(untrustworthy)(
            "should fail on %s",
            (_label, stdout, message) => {
                // Arrange
                const run = cleanRun(stdout);

                // Act
                const verdict = evaluateCoachRun(run);

                // Assert
                expect(verdict.passed).toBe(false);
                expect(verdict.messages.join("\n")).toMatch(message);
            },
        );
    });
});
