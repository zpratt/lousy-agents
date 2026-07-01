import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasBlockingFindings } from "../../src/formatters/human-renderer.js";
import { formatSummary } from "../../src/formatters/summary-formatter.js";
import { scanRepository } from "../../src/gateways/scanner.js";
import { classifyArchetype } from "../../src/use-cases/classify-archetype.js";
import { CRITERIA } from "../../src/use-cases/criteria.js";
import { evaluate } from "../../src/use-cases/evaluate-engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../fixtures");

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

describe("Full pipeline integration", () => {
    describe("integration-scenario: Copilot desired but instructions missing", () => {
        it("should detect copilot instructions file as missing", async () => {
            const records = await scanRepository(
                fixture("integration-scenario"),
            );

            const copilotRecord = records.find((r) => r.harness === "copilot");
            expect(copilotRecord).toBeDefined();

            const hasInstructions = records.some(
                (r) =>
                    r.harness === "copilot" &&
                    r.path === ".github/copilot-instructions.md",
            );
            expect(hasInstructions).toBe(false);
        });

        it("should produce a critical missing-copilot-instructions finding", async () => {
            const records = await scanRepository(
                fixture("integration-scenario"),
            );
            const classification = classifyArchetype(records);
            const findings = evaluate(CRITERIA, {
                records,
                classification,
                intent: null,
            });

            const criticalFinding = findings.find(
                (f) => f.criterionId === "missing-copilot-instructions",
            );
            expect(criticalFinding).toBeDefined();
            expect(criticalFinding?.severity).toBe("critical");
            expect(criticalFinding?.classification).toBe("defect");
        });

        it("should have blocking findings that would cause non-zero exit", async () => {
            const records = await scanRepository(
                fixture("integration-scenario"),
            );
            const classification = classifyArchetype(records);
            const findings = evaluate(CRITERIA, {
                records,
                classification,
                intent: null,
            });

            expect(hasBlockingFindings(findings)).toBe(true);
        });

        it("should classify as accidental-sprawl due to no cross-harness edges", async () => {
            const records = await scanRepository(
                fixture("integration-scenario"),
            );
            const classification = classifyArchetype(records);
            expect(classification.archetype).toBe("accidental-sprawl");
        });
    });

    describe("integration-scenario: summary output format", () => {
        it("should produce a summary with correct archetype", async () => {
            const records = await scanRepository(
                fixture("integration-scenario"),
            );
            const classification = classifyArchetype(records);
            const summary = formatSummary(records, classification);

            expect(summary.archetype).toBe("accidental-sprawl");
            expect(summary.totalRecords).toBeGreaterThan(0);
            expect(summary.archetypeDescription).toBeTruthy();
        });
    });

    describe("pure-claude: no intent, no copilot → only governance finding", () => {
        it("should produce missing-intent-artifact but no critical findings", async () => {
            const records = await scanRepository(fixture("pure-claude"));
            const classification = classifyArchetype(records);
            const findings = evaluate(CRITERIA, {
                records,
                classification,
                intent: null,
            });

            const critical = findings.filter(
                (f) =>
                    f.severity === "critical" && f.classification === "defect",
            );
            expect(critical).toHaveLength(0);

            const intentFinding = findings.find(
                (f) => f.criterionId === "missing-intent-artifact",
            );
            expect(intentFinding).toBeDefined();
            expect(hasBlockingFindings(findings)).toBe(false);
        });
    });

    describe("copilot-markdown-link-to-claude: copilot instructions link to a Claude file via markdown hyperlink", () => {
        it("should record the reference as a soft-reference edge, not a hard-import", async () => {
            const records = await scanRepository(
                fixture("copilot-markdown-link-to-claude"),
            );

            const copilotRecord = records.find(
                (r) => r.path === ".github/copilot-instructions.md",
            );
            expect(copilotRecord).toBeDefined();
            expect(copilotRecord?.edges).toHaveLength(1);
            expect(copilotRecord?.edges[0]?.type).toBe("soft-reference");
        });

        it("should produce a wrong-direction-copilot-links-claude finding describing a markdown hyperlink instead of @path hard-imports", async () => {
            const records = await scanRepository(
                fixture("copilot-markdown-link-to-claude"),
            );
            const classification = classifyArchetype(records);
            const findings = evaluate(CRITERIA, {
                records,
                classification,
                intent: null,
            });

            const linkFinding = findings.find(
                (f) => f.criterionId === "wrong-direction-copilot-links-claude",
            );
            expect(linkFinding).toBeDefined();
            expect(linkFinding?.description).not.toMatch(/@path/);
            expect(linkFinding?.description.toLowerCase()).toMatch(
                /markdown hyperlink/,
            );

            const misleadingFinding = findings.find(
                (f) =>
                    f.criterionId === "wrong-direction-copilot-imports-claude",
            );
            expect(misleadingFinding).toBeUndefined();
        });
    });

    describe("empty-repo: no records → no findings", () => {
        it("should produce zero findings for an empty repo", async () => {
            const records = await scanRepository(fixture("empty-repo"));
            const classification = classifyArchetype(records);
            const findings = evaluate(CRITERIA, {
                records,
                classification,
                intent: null,
            });

            expect(findings).toHaveLength(0);
            expect(hasBlockingFindings(findings)).toBe(false);
        });
    });
});
