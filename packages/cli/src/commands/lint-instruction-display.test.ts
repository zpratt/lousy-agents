import type { LintOutput } from "@lousy-agents/lint";
import { createConsola } from "consola";
import { describe, expect, it } from "vitest";
import { displayInstructionQuality } from "./lint-instruction-display.js";

function capturingLogger() {
    const logged: Array<[string, string]> = [];
    const logger = createConsola({
        level: 3,
        reporters: [
            {
                log: (entry) => {
                    logged.push([entry.type, entry.args.join(" ")]);
                },
            },
        ],
    });
    const lines = (type: string) =>
        logged
            .filter(([loggedType]) => loggedType === type)
            .map(([, line]) => line);
    return { logger, logged, lines };
}

describe("displayInstructionQuality", () => {
    describe("when effectiveDocuments are present", () => {
        it("should log a concise resolved-import note per effective root", () => {
            const { logger, lines } = capturingLogger();
            const effectiveRoot = "/repo/CLAUDE.md";
            const resolvedImports = ["/repo/AGENTS.md", "/repo/shared.md"];
            const output: LintOutput = {
                diagnostics: [],
                target: "instruction",
                filesAnalyzed: [effectiveRoot],
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
                qualityResult: {
                    discoveredFiles: [
                        { filePath: effectiveRoot, format: "claude-md" },
                    ],
                    commandScores: [],
                    overallQualityScore: 0,
                    suggestions: [],
                    parsingErrors: [],
                    effectiveDocuments: [
                        {
                            effectiveRoot,
                            resolvedImports,
                        },
                    ],
                },
            };

            displayInstructionQuality(output, logger);

            expect(lines("info")).toContain(
                `  ${effectiveRoot}: ${resolvedImports.length} resolved import(s)`,
            );
        });
    });

    describe("when effectiveDocuments are absent", () => {
        it("should not log an import provenance note", () => {
            const { logger, lines } = capturingLogger();
            const output: LintOutput = {
                diagnostics: [],
                target: "instruction",
                filesAnalyzed: ["/repo/AGENTS.md"],
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
                qualityResult: {
                    discoveredFiles: [
                        {
                            filePath: "/repo/AGENTS.md",
                            format: "agents-md",
                        },
                    ],
                    commandScores: [],
                    overallQualityScore: 0,
                    suggestions: [],
                    parsingErrors: [],
                },
            };

            displayInstructionQuality(output, logger);

            expect(
                lines("info").filter((line) =>
                    line.includes("resolved import"),
                ),
            ).toEqual([]);
        });
    });

    describe("when instruction diagnostics are present (human feedback)", () => {
        it("should print each diagnostic with path, line, and message so humans can act without --format json", () => {
            const { logger, lines } = capturingLogger();
            const claudePath = "/repo/CLAUDE.md";
            const importMessage =
                "Import target could not be resolved: ./missing.md";
            const headingMessage =
                "Missing 'Validation' heading section. Agents need this section.";
            const output: LintOutput = {
                diagnostics: [
                    {
                        filePath: claudePath,
                        line: 1,
                        severity: "warning",
                        message: importMessage,
                        ruleId: "instruction/import-unresolved",
                        target: "instruction",
                    },
                    {
                        filePath: claudePath,
                        line: 1,
                        severity: "warning",
                        message: headingMessage,
                        ruleId: "instruction/missing-structural-heading",
                        target: "instruction",
                    },
                ],
                target: "instruction",
                filesAnalyzed: [claudePath],
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 2,
                    totalInfos: 0,
                },
                qualityResult: {
                    discoveredFiles: [
                        { filePath: claudePath, format: "claude-md" },
                    ],
                    commandScores: [],
                    overallQualityScore: 0,
                    suggestions: [],
                    parsingErrors: [],
                    effectiveDocuments: [
                        {
                            effectiveRoot: claudePath,
                            resolvedImports: [],
                        },
                    ],
                },
            };

            displayInstructionQuality(output, logger);

            expect(lines("warn")).toEqual([
                `${claudePath}:1: ${importMessage}`,
                `${claudePath}:1: ${headingMessage}`,
            ]);
        });
    });

    describe("when no instruction files were found but discovery reported a limit", () => {
        it("should still print the discovery-limit warning so the truncation is never silent", () => {
            const logged: Array<[string, string]> = [];
            const logger = createConsola({
                level: 3,
                reporters: [
                    {
                        log: (entry) => {
                            logged.push([entry.type, entry.args.join(" ")]);
                        },
                    },
                ],
            });
            const suggestion = "No agent instruction files found.";
            const message =
                "Instruction file discovery stopped after listing 10000 directories, so instruction files in the remaining directories were not analyzed.";
            const output: LintOutput = {
                diagnostics: [
                    {
                        filePath: "/repo",
                        line: 1,
                        severity: "warning",
                        message,
                        target: "instruction",
                        ruleId: "instruction/discovery-limit-reached",
                    },
                ],
                target: "instruction",
                filesAnalyzed: [],
                summary: {
                    totalFiles: 0,
                    totalErrors: 0,
                    totalWarnings: 1,
                    totalInfos: 0,
                },
                qualityResult: {
                    discoveredFiles: [],
                    commandScores: [],
                    overallQualityScore: 0,
                    suggestions: [{ message: suggestion }],
                    parsingErrors: [],
                },
            };

            displayInstructionQuality(output, logger);

            expect(logged).toEqual([
                ["info", "No instruction files found"],
                ["warn", `/repo:1: ${message}`],
                ["warn", suggestion],
            ]);
        });
    });

    describe("when a diagnostic has a severity", () => {
        const filePath = "/repo/CLAUDE.md";
        const message = "A diagnostic message";
        const outputWith = (
            severity: "error" | "warning" | "info",
            field?: string,
        ): LintOutput => ({
            diagnostics: [
                {
                    filePath,
                    line: 7,
                    severity,
                    message,
                    target: "instruction",
                    ...(field === undefined ? {} : { field }),
                },
            ],
            target: "instruction",
            filesAnalyzed: [filePath],
            summary: {
                totalFiles: 1,
                totalErrors: 0,
                totalWarnings: 0,
                totalInfos: 0,
            },
            qualityResult: {
                discoveredFiles: [{ filePath, format: "claude-md" }],
                commandScores: [],
                overallQualityScore: 0,
                suggestions: [],
                parsingErrors: [],
            },
        });

        it.each([
            ["error", "error"],
            ["warning", "warn"],
            ["info", "info"],
        ] as const)(
            "should print a %s diagnostic as a %s line with its path and line",
            (severity, method) => {
                const { logger, lines } = capturingLogger();

                displayInstructionQuality(outputWith(severity), logger);

                expect(lines(method)).toContain(`${filePath}:7: ${message}`);
            },
        );

        it("should name the field in brackets when the diagnostic has one", () => {
            const { logger, lines } = capturingLogger();

            displayInstructionQuality(
                outputWith("warning", "description"),
                logger,
            );

            expect(lines("warn")).toEqual([
                `${filePath}:7 [description]: ${message}`,
            ]);
        });
    });

    describe("when the quality result is missing", () => {
        it("should print nothing", () => {
            const { logger, logged } = capturingLogger();

            displayInstructionQuality(
                {
                    diagnostics: [],
                    target: "instruction",
                    filesAnalyzed: [],
                    summary: {
                        totalFiles: 0,
                        totalErrors: 0,
                        totalWarnings: 0,
                        totalInfos: 0,
                    },
                },
                logger,
            );

            expect(logged).toEqual([]);
        });
    });
});
