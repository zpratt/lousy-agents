import type { LintOutput } from "@lousy-agents/lint";
import { consola } from "consola";
import { afterEach, describe, expect, it, vi } from "vitest";
import { displayInstructionQuality } from "./lint-instruction-display.js";

describe("displayInstructionQuality", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("when effectiveDocuments are present", () => {
        it("should log a concise resolved-import note per effective root", () => {
            // Arrange
            const infoSpy = vi
                .spyOn(consola, "info")
                .mockImplementation(() => {});
            vi.spyOn(consola, "warn").mockImplementation(() => {});

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

            // Act
            displayInstructionQuality(output);

            // Assert
            const infoMessages = infoSpy.mock.calls.map((call) =>
                String(call[0]),
            );
            expect(
                infoMessages.some(
                    (msg) =>
                        msg.includes("resolved import") &&
                        msg.includes(String(resolvedImports.length)) &&
                        msg.includes(effectiveRoot),
                ),
            ).toBe(true);
        });
    });

    describe("when effectiveDocuments are absent", () => {
        it("should not log an import provenance note", () => {
            // Arrange
            const infoSpy = vi
                .spyOn(consola, "info")
                .mockImplementation(() => {});
            vi.spyOn(consola, "warn").mockImplementation(() => {});

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

            // Act
            displayInstructionQuality(output);

            // Assert
            const infoMessages = infoSpy.mock.calls.map((call) =>
                String(call[0]),
            );
            expect(
                infoMessages.some((msg) => msg.includes("resolved import")),
            ).toBe(false);
        });
    });

    describe("when instruction diagnostics are present (human feedback)", () => {
        it("should print each diagnostic with path, line, and message so humans can act without --format json", () => {
            // Arrange — import failure + missing heading (same path humans hit on coach/lousy-iam)
            const warnSpy = vi
                .spyOn(consola, "warn")
                .mockImplementation(() => {});
            vi.spyOn(consola, "info").mockImplementation(() => {});
            vi.spyOn(consola, "error").mockImplementation(() => {});

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

            // Act
            displayInstructionQuality(output);

            // Assert — match skills/agents human shape: path:line: message
            const warnMessages = warnSpy.mock.calls.map((call) =>
                String(call[0]),
            );
            expect(
                warnMessages.some(
                    (msg) =>
                        msg.includes(claudePath) &&
                        msg.includes(":1:") &&
                        msg.includes(importMessage),
                ),
            ).toBe(true);
            expect(
                warnMessages.some(
                    (msg) =>
                        msg.includes(claudePath) &&
                        msg.includes(":1:") &&
                        msg.includes(headingMessage),
                ),
            ).toBe(true);
        });
    });

    describe("when no instruction files were found but discovery reported a limit", () => {
        it("should still print the discovery-limit warning so the truncation is never silent", () => {
            vi.spyOn(consola, "info").mockImplementation(() => {});
            const warnSpy = vi
                .spyOn(consola, "warn")
                .mockImplementation(() => {});
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
                    suggestions: [],
                    parsingErrors: [],
                },
            };

            displayInstructionQuality(output);

            const warnings = warnSpy.mock.calls.map((call) => String(call[0]));
            expect(warnings).toContain(`/repo:1: ${message}`);
        });
    });
});
