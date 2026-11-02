import Chance from "chance";
import { describe, expect, it } from "vitest";
import { discoveryLimitFindings } from "./discovery-limit-finding.js";

const chance = new Chance();

describe("discoveryLimitFindings", () => {
    describe("when the scan reached its directory limit", () => {
        it("should return one non-blocking governance finding that names the limit", () => {
            const maxDirectories = chance.natural({ min: 1, max: 99_999 });

            const findings = discoveryLimitFindings({ maxDirectories });

            expect(findings).toHaveLength(1);
            expect(findings[0]).toMatchObject({
                id: "discovery-limit-reached:all:repository",
                criterionId: "discovery-limit-reached",
                targetId: "all:repository",
                severity: "medium",
                category: "governance",
                classification: "advisory",
                intentGated: false,
                assumedIntent: false,
            });
            expect(findings[0].description).toContain(String(maxDirectories));
        });
    });

    describe("when the scan reached its depth limit", () => {
        it("should return one finding that names the depth", () => {
            const maxDepth = chance.natural({ min: 1, max: 99 });

            const findings = discoveryLimitFindings(undefined, { maxDepth });

            expect(findings).toHaveLength(1);
            expect(findings[0]).toMatchObject({
                id: "discovery-limit-reached:all:repository",
                criterionId: "discovery-limit-reached",
                classification: "advisory",
            });
            expect(findings[0].description).toBe(
                `The repository scan did not go more than ${maxDepth} directories deep, so agentic constructs in deeper directories are not in this report.`,
            );
        });
    });

    describe("when the scan reached its entry budget", () => {
        it("should return one finding that names the budget", () => {
            const maxEntries = chance.natural({ min: 1, max: 999_999 });

            const findings = discoveryLimitFindings(undefined, undefined, {
                maxEntries,
            });

            expect(findings).toHaveLength(1);
            expect(findings[0].description).toBe(
                `The repository scan stopped after examining ${maxEntries} directory entries, so agentic constructs in the remaining entries are not in this report.`,
            );
        });
    });

    describe("when the scan reached every limit", () => {
        it("should return one finding that names all three, in order", () => {
            const findings = discoveryLimitFindings(
                { maxDirectories: 11 },
                { maxDepth: 12 },
                { maxEntries: 13 },
            );

            expect(findings).toHaveLength(1);
            expect(findings[0].description).toBe(
                "The repository scan stopped after listing 11 directories, so agentic constructs in the remaining directories are not in this report. The repository scan did not go more than 12 directories deep, so agentic constructs in deeper directories are not in this report. The repository scan stopped after examining 13 directory entries, so agentic constructs in the remaining entries are not in this report.",
            );
        });
    });

    describe("when the scan reached both limits", () => {
        it("should return one finding that names both", () => {
            const maxDirectories = chance.natural({ min: 1, max: 99_999 });
            const maxDepth = chance.natural({ min: 1, max: 99 });

            const findings = discoveryLimitFindings(
                { maxDirectories },
                { maxDepth },
            );

            expect(findings).toHaveLength(1);
            expect(findings[0].description).toBe(
                `The repository scan stopped after listing ${maxDirectories} directories, so agentic constructs in the remaining directories are not in this report. The repository scan did not go more than ${maxDepth} directories deep, so agentic constructs in deeper directories are not in this report.`,
            );
        });
    });

    describe("when the scan stayed within its directory limit", () => {
        it("should return no findings", () => {
            const findings = discoveryLimitFindings(undefined);

            expect(findings).toEqual([]);
        });
    });
});
