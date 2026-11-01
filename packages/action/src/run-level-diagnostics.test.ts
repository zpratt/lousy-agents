import type { LintDiagnostic, LintOutput } from "@lousy-agents/lint";
import { describe, expect, it } from "vitest";
import { selectRunLevelDiagnostics } from "./run-level-diagnostics.js";

function diagnostic(overrides: Partial<LintDiagnostic> = {}): LintDiagnostic {
    return {
        filePath: "AGENTS.md",
        line: 1,
        severity: "warning",
        message: "m",
        target: "instruction",
        ...overrides,
    };
}

function output(diagnostics: LintDiagnostic[]): LintOutput {
    return {
        diagnostics,
        target: "instruction",
        filesAnalyzed: [],
        summary: {
            totalFiles: 0,
            totalErrors: 0,
            totalWarnings: diagnostics.length,
            totalInfos: 0,
        },
    };
}

describe("selectRunLevelDiagnostics", () => {
    describe("when outputs mix file-level and run-level diagnostics", () => {
        it("should return only the run-level ones, in output order", () => {
            const first = diagnostic({
                filePath: "/repo",
                ruleId: "instruction/discovery-limit-reached",
                message: "first",
            });
            const second = diagnostic({
                filePath: "/repo",
                ruleId: "instruction/discovery-limit-reached",
                message: "second",
            });
            const outputs = [
                output([
                    diagnostic({ ruleId: "instruction/parse-error" }),
                    first,
                ]),
                output([diagnostic(), second]),
            ];

            const selected = selectRunLevelDiagnostics(outputs);

            expect(selected).toEqual([first, second]);
        });
    });

    describe("when no diagnostic is run-level", () => {
        it("should return nothing", () => {
            const selected = selectRunLevelDiagnostics([
                output([diagnostic({ ruleId: "instruction/parse-error" })]),
            ]);

            expect(selected).toEqual([]);
        });
    });
});
