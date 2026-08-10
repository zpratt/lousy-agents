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
});
