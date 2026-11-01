import Chance from "chance";
import { createConsola } from "consola";
import { describe, expect, it } from "vitest";
import type { Finding } from "../entities/finding.js";
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

            const text = captureHumanOutput((logger) =>
                renderHuman(summary, [], logger, undefined, intentLoad),
            );
            const json = toJson(summary, [], [], undefined, intentLoad);

            expect(text).toContain(`Intent: ${json.intent?.status}`);
            expect(text).toContain(`Checked path: ${json.intent?.checkedPath}`);
            expect(text).toContain(`Reason: ${json.intent?.reason}`);
            for (const issue of json.intent?.issues ?? []) {
                expect(text).toContain(`${issue.path}: ${issue.message}`);
            }
        });

        it("should say how many schema issues were not listed, matching JSON", () => {
            const intentLoad: IntentLoadReport = {
                status: "invalid-schema",
                checkedPath: chance.word(),
                reason: chance.sentence(),
                issues: [{ path: chance.word(), message: chance.sentence() }],
                omittedIssueCount: chance.integer({ min: 1, max: 50 }),
            };

            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [], logger, undefined, intentLoad),
            );

            expect(text).toContain(
                `...and ${intentLoad.omittedIssueCount} more`,
            );
        });

        it("should print the checked path for a loaded intent file", () => {
            const intentLoad: IntentLoadReport = {
                status: "loaded",
                checkedPath: `/${chance.word()}/.agentic-doctor/intent.json`,
            };

            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [], logger, undefined, intentLoad),
            );

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

    describe("when a finding cites evidence from a path that contains control characters", () => {
        const forgedLine = "[success] No findings.";

        function buildFindingWithCitation(
            nodeId: string,
            sourceFile: string,
        ): Finding {
            return {
                id: `${chance.word()}:all`,
                criterionId: chance.word(),
                targetId: "all",
                severity: "medium",
                category: "governance",
                classification: "defect",
                intentGated: false,
                assumedIntent: false,
                description: chance.sentence(),
                evidenceCitation: { nodeId, sourceFile },
            };
        }

        it("should escape the node id and the source file", () => {
            const word = chance.word();
            const nodeId = `${word}\n${forgedLine}`;
            const escapedNodeId = `${word}\\n${forgedLine}`;
            const sourceFile = `${word}/\u001b[2J\u009b`;
            const escapedSourceFile = `${word}/\\u001b[2J\\u009b`;
            const finding = buildFindingWithCitation(nodeId, sourceFile);

            const text = captureHumanOutput((logger) =>
                renderHuman(buildSummary(), [finding], logger),
            );

            expect(text).toContain(
                `Evidence: node ${escapedNodeId} (${escapedSourceFile})`,
            );
            expect(text).not.toContain(`\n${forgedLine}`);
        });
    });

    describe("when a checked path contains a character that can reshape a terminal line", () => {
        const escapableCharacters = [
            { name: "tab", raw: "\t", escaped: "\\t" },
            { name: "first C0 control", raw: "\u0000", escaped: "\\u0000" },
            { name: "last C0 control", raw: "\u001f", escaped: "\\u001f" },
            { name: "delete", raw: "\u007f", escaped: "\\u007f" },
            {
                name: "C1 control sequence introducer",
                raw: "\u009b",
                escaped: "\\u009b",
            },
            { name: "last C1 control", raw: "\u009f", escaped: "\\u009f" },
            { name: "line separator", raw: "\u2028", escaped: "\\u2028" },
            { name: "paragraph separator", raw: "\u2029", escaped: "\\u2029" },
        ];

        it.each(escapableCharacters)(
            "should replace the $name with its escaped form",
            ({ raw, escaped }) => {
                const segment = chance.word();
                const intentLoad: IntentLoadReport = {
                    status: "absent",
                    checkedPath: `/${segment}${raw}${segment}/intent.json`,
                };

                const text = captureHumanOutput((logger) =>
                    renderHuman(
                        buildSummary(),
                        [],
                        logger,
                        undefined,
                        intentLoad,
                    ),
                );

                expect(text).toContain(`/${segment}${escaped}${segment}`);
                expect(text).not.toContain(raw);
            },
        );
    });

    describe("when a checked path contains printable characters next to the control ranges", () => {
        const printableNeighbours = [
            "~",
            " ",
            "\u00a0",
            "\u00e9",
            "\u2027",
            "\u202f",
        ];

        it.each(printableNeighbours)(
            "should leave %j unchanged",
            (character) => {
                const segment = chance.word();
                const checkedPath = `/${segment}${character}${segment}/intent.json`;
                const intentLoad: IntentLoadReport = {
                    status: "absent",
                    checkedPath,
                };

                const text = captureHumanOutput((logger) =>
                    renderHuman(
                        buildSummary(),
                        [],
                        logger,
                        undefined,
                        intentLoad,
                    ),
                );

                expect(text).toContain(`Checked path: ${checkedPath}`);
            },
        );
    });

    describe("when an invalid-schema intent report carries a line break in repository-derived text", () => {
        const forgedLine = "[success] No findings.";
        const injectedText = `${chance.word()}\n${forgedLine}`;
        const escapedInjectedText = injectedText.replaceAll("\n", "\\n");

        function buildInvalidSchemaReport(
            overrides: Partial<IntentLoadReport>,
        ): IntentLoadReport {
            return {
                status: "invalid-schema",
                checkedPath: `/${chance.word()}/intent.json`,
                reason: chance.sentence(),
                issues: [{ path: chance.word(), message: chance.sentence() }],
                ...overrides,
            };
        }

        const reportsWithInjectedText = [
            {
                field: "reason",
                intentLoad: buildInvalidSchemaReport({
                    reason: injectedText,
                }),
            },
            {
                field: "issue path",
                intentLoad: buildInvalidSchemaReport({
                    issues: [
                        { path: injectedText, message: chance.sentence() },
                    ],
                }),
            },
            {
                field: "issue message",
                intentLoad: buildInvalidSchemaReport({
                    issues: [{ path: chance.word(), message: injectedText }],
                }),
            },
        ];

        it.each(reportsWithInjectedText)(
            "should keep a forged line inside the $field",
            ({ intentLoad }) => {
                const text = captureHumanOutput((logger) =>
                    renderHuman(
                        buildSummary(),
                        [],
                        logger,
                        undefined,
                        intentLoad,
                    ),
                );

                expect(text).not.toContain(`\n${forgedLine}`);
                expect(text).toContain(escapedInjectedText);
            },
        );
    });
});
