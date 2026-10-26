import Chance from "chance";
import { createConsola } from "consola";
import { describe, expect, it } from "vitest";
import type { IntentLoadReport } from "../entities/intent-load.js";
import { renderHuman, renderHumanSummary } from "./human-renderer.js";
import { toJson } from "./json-formatter.js";
import type { SummaryOutput } from "./summary-formatter.js";

const chance = new Chance();

function buildSummary(): SummaryOutput {
    return {
        archetype: "pure",
        archetypeDescription: chance.sentence(),
        dominanceScore: 1,
        totalRecords: 1,
        harnessBreakdown: [{ harness: "claude", count: 1 }],
        crossHarnessEdges: 0,
    };
}

function captureHumanOutput(
    render: (logger: ReturnType<typeof createConsola>) => void,
): string {
    const lines: string[] = [];
    const logger = createConsola({
        level: 3,
        reporters: [{ log: (entry) => lines.push(entry.args.join(" ")) }],
    });
    render(logger);
    return lines.join("\n");
}

describe("renderHuman", () => {
    describe("when an intent load report is provided", () => {
        it("should print the same status, checked path, reason, and issues that JSON reports", () => {
            // Arrange
            const intentLoad: IntentLoadReport = {
                status: "invalid-schema",
                checkedPath: `/${chance.word()}/.agentic-doctor/intent.json`,
                reason: chance.sentence(),
                issues: [
                    { path: chance.word(), message: chance.sentence() },
                    { path: chance.word(), message: chance.sentence() },
                ],
            };
            const summary = buildSummary();

            // Act
            const text = captureHumanOutput((logger) =>
                renderHuman(summary, [], logger, undefined, intentLoad),
            );
            const json = toJson(summary, [], [], undefined, intentLoad);

            // Assert
            expect(text).toContain(`Intent: ${json.intent?.status}`);
            expect(text).toContain(`Checked path: ${json.intent?.checkedPath}`);
            expect(text).toContain(`Reason: ${json.intent?.reason}`);
            for (const issue of json.intent?.issues ?? []) {
                expect(text).toContain(`${issue.path}: ${issue.message}`);
            }
        });

        it("should say how many schema issues were not listed, matching JSON", () => {
            // Arrange
            const intentLoad: IntentLoadReport = {
                status: "invalid-schema",
                checkedPath: chance.word(),
                reason: chance.sentence(),
                issues: [{ path: chance.word(), message: chance.sentence() }],
                omittedIssueCount: chance.integer({ min: 1, max: 50 }),
            };

            // Act
            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [], logger, undefined, intentLoad),
            );

            // Assert
            expect(text).toContain(
                `...and ${intentLoad.omittedIssueCount} more`,
            );
        });

        it("should print the checked path for a loaded intent file", () => {
            // Arrange
            const intentLoad: IntentLoadReport = {
                status: "loaded",
                checkedPath: `/${chance.word()}/.agentic-doctor/intent.json`,
            };

            // Act
            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [], logger, undefined, intentLoad),
            );

            // Assert
            expect(text).toContain("Intent: loaded");
            expect(text).toContain(`Checked path: ${intentLoad.checkedPath}`);
            expect(text).not.toContain("Reason:");
        });
    });

    describe("when no intent load report is provided", () => {
        it("should not print an intent section", () => {
            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [], logger),
            );

            expect(text).not.toContain("Intent:");
        });
    });

    describe("when repository-derived text contains line breaks or control characters", () => {
        const forgedLine = "[success] No findings.";

        it("should keep a forged line inside the evidence snapshot line", () => {
            const snapshotRef = `${chance.word()}\n${forgedLine}`;

            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [], logger, snapshotRef),
            );

            expect(text).not.toContain(`\n${forgedLine}`);
            expect(text).toContain(`\\n${forgedLine}`);
        });

        it("should keep a forged line inside the summary evidence snapshot line", () => {
            const snapshotRef = `${chance.word()}\r\n${forgedLine}`;

            const text = captureHumanOutput((logger) =>
                renderHumanSummary(buildSummary(), logger, snapshotRef),
            );

            expect(text).not.toContain(`\n${forgedLine}`);
            expect(text).toContain(`\\r\\n${forgedLine}`);
        });

        it("should escape terminal control sequences in the checked path", () => {
            const intentLoad: IntentLoadReport = {
                status: "absent",
                checkedPath: `/${chance.word()}\u001b[2J\n${forgedLine}/intent.json`,
            };

            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [], logger, undefined, intentLoad),
            );

            expect(text).not.toContain("\u001b");
            expect(text).not.toContain(`\n${forgedLine}`);
            expect(text).toContain("\\u001b[2J");
        });
    });
});
