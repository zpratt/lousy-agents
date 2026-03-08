import { describe, expect, it } from "vitest";
import type { LintOutput } from "../entities/lint.js";
import { HumanFormatter } from "./human-formatter.js";
import { createFormatter } from "./index.js";
import { JsonFormatter } from "./json-formatter.js";
import { RdjsonlFormatter } from "./rdjsonl-formatter.js";

function buildTestOutput(): LintOutput {
    return {
        diagnostics: [
            {
                filePath: ".github/skills/my-skill/SKILL.md",
                line: 2,
                severity: "error",
                message: "Name is required",
                field: "name",
                target: "skill",
                ruleId: "skill/missing-name",
            },
            {
                filePath: ".github/skills/my-skill/SKILL.md",
                line: 1,
                severity: "warning",
                message: "Recommended field 'allowed-tools' is missing",
                field: "allowed-tools",
                target: "skill",
            },
        ],
        target: "skill",
        filesAnalyzed: [".github/skills/my-skill/SKILL.md"],
        summary: {
            totalFiles: 1,
            totalErrors: 1,
            totalWarnings: 1,
            totalInfos: 0,
        },
    };
}

describe("createFormatter", () => {
    it("should return a HumanFormatter for 'human' format", () => {
        // Act
        const formatter = createFormatter("human");

        // Assert
        expect(formatter).toBeInstanceOf(HumanFormatter);
    });

    it("should return a JsonFormatter for 'json' format", () => {
        // Act
        const formatter = createFormatter("json");

        // Assert
        expect(formatter).toBeInstanceOf(JsonFormatter);
    });

    it("should return a RdjsonlFormatter for 'rdjsonl' format", () => {
        // Act
        const formatter = createFormatter("rdjsonl");

        // Assert
        expect(formatter).toBeInstanceOf(RdjsonlFormatter);
    });
});

describe("HumanFormatter", () => {
    describe("when formatting diagnostics with mixed severities", () => {
        it("should use severity icons for each diagnostic", () => {
            // Arrange
            const formatter = new HumanFormatter();
            const output = buildTestOutput();

            // Act
            const result = formatter.format([output]);

            // Assert
            expect(result).toContain("✖");
            expect(result).toContain("⚠");
            expect(result).toContain("Name is required");
        });
    });

    describe("when a file has no diagnostics", () => {
        it("should display OK for that file", () => {
            // Arrange
            const formatter = new HumanFormatter();
            const output: LintOutput = {
                diagnostics: [],
                target: "skill",
                filesAnalyzed: ["file.md"],
                summary: {
                    totalFiles: 1,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalInfos: 0,
                },
            };

            // Act
            const result = formatter.format([output]);

            // Assert
            expect(result).toContain("✔ file.md: OK");
        });
    });
});

describe("JsonFormatter", () => {
    describe("when formatting diagnostics", () => {
        it("should output valid JSON array", () => {
            // Arrange
            const formatter = new JsonFormatter();
            const output = buildTestOutput();

            // Act
            const result = formatter.format([output]);
            const parsed = JSON.parse(result);

            // Assert
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].message).toBe("Name is required");
        });
    });
});

describe("RdjsonlFormatter", () => {
    describe("when formatting diagnostics", () => {
        it("should output one JSON object per line", () => {
            // Arrange
            const formatter = new RdjsonlFormatter();
            const output = buildTestOutput();

            // Act
            const result = formatter.format([output]);
            const lines = result.split("\n").filter((l) => l.trim() !== "");

            // Assert
            expect(lines).toHaveLength(2);

            const firstEntry = JSON.parse(lines[0]);
            expect(firstEntry.message).toBe("Name is required");
            expect(firstEntry.severity).toBe("ERROR");
            expect(firstEntry.location.path).toBe(
                ".github/skills/my-skill/SKILL.md",
            );
            expect(firstEntry.location.range.start.line).toBe(2);

            const secondEntry = JSON.parse(lines[1]);
            expect(secondEntry.severity).toBe("WARNING");
        });
    });

    describe("when a diagnostic has a ruleId", () => {
        it("should include code.value in the output", () => {
            // Arrange
            const formatter = new RdjsonlFormatter();
            const output = buildTestOutput();

            // Act
            const result = formatter.format([output]);
            const lines = result.split("\n").filter((l) => l.trim() !== "");
            const firstEntry = JSON.parse(lines[0]);

            // Assert
            expect(firstEntry.code).toEqual({
                value: "skill/missing-name",
            });
        });
    });
});
