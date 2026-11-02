import { describe, expect, it } from "vitest";
import { findImportTokens } from "./import-tokens.js";
import { DEFAULT_MAX_FILE_BYTES } from "./instruction-import-expand.js";

const BUDGET_RUNS = 3;
const WARM_UP_BYTES = 4_096;
const TEST_TIMEOUT_MS = 60_000;
const BUDGET_MS = 5_000;
const MAX_STEP_GROWTH_RATIO = 2.5;
const SMALL_UNIT_COUNT = 50_000;
const LARGE_UNIT_COUNT = 100_000;

const UNCLOSED_FENCE_LINE = "```js\n";
const CLOSED_EMPTY_FENCE_LINES = "```\n```\n";
const OPENERS_SEPARATED_BY_LINE_SEPARATORS = `\`\`\`${String.fromCodePoint(0x2028)}`;
const IMPORT_THEN_CODE_SPAN_LINES = "@a\n`x`\n";

function fastestRunMs(content: string): number {
    findImportTokens(content.slice(0, WARM_UP_BYTES));
    const durations = Array.from({ length: BUDGET_RUNS }, () => {
        const start = performance.now();
        findImportTokens(content);
        return performance.now() - start;
    });
    return Math.min(...durations);
}

function stepsTaken(content: string): number {
    let steps = 0;
    findImportTokens(content, (counted) => {
        steps += counted;
    });
    return steps;
}

function stepsForSmallAndLarge(unit: string): { small: number; large: number } {
    return {
        small: stepsTaken(unit.repeat(SMALL_UNIT_COUNT)),
        large: stepsTaken(unit.repeat(LARGE_UNIT_COUNT)),
    };
}

function fillToFileLimit(unit: string): string {
    return unit.repeat(Math.floor(DEFAULT_MAX_FILE_BYTES / unit.length));
}

describe("findImportTokens at the file size limit", () => {
    describe("when every line opens a fence that is never closed", () => {
        it(
            "should return within five seconds",
            () => {
                const content = fillToFileLimit(UNCLOSED_FENCE_LINE);

                expect(fastestRunMs(content)).toBeLessThan(BUDGET_MS);
            },
            TEST_TIMEOUT_MS,
        );

        it("should take less than 2.5 times as many steps for twice as many lines", () => {
            const { small, large } = stepsForSmallAndLarge(UNCLOSED_FENCE_LINE);

            expect(small).toBeGreaterThanOrEqual(SMALL_UNIT_COUNT);
            expect(large / small).toBeLessThan(MAX_STEP_GROWTH_RATIO);
        });

        it("should still find an import that follows the fences", () => {
            const content = `${UNCLOSED_FENCE_LINE.repeat(SMALL_UNIT_COUNT)}@./real.md\n`;

            expect(findImportTokens(content).map((t) => t.rawTarget)).toEqual([
                "./real.md",
            ]);
        });
    });

    describe("when every fence is closed on the next line", () => {
        it(
            "should return within five seconds",
            () => {
                const content = fillToFileLimit(CLOSED_EMPTY_FENCE_LINES);

                expect(fastestRunMs(content)).toBeLessThan(BUDGET_MS);
            },
            TEST_TIMEOUT_MS,
        );

        it("should take less than 2.5 times as many steps for twice as many fences", () => {
            const { small, large } = stepsForSmallAndLarge(
                CLOSED_EMPTY_FENCE_LINES,
            );

            expect(small).toBeGreaterThanOrEqual(SMALL_UNIT_COUNT);
            expect(large / small).toBeLessThan(MAX_STEP_GROWTH_RATIO);
        });
    });

    describe("when fence openers are separated by Unicode line separators", () => {
        it(
            "should return within five seconds",
            () => {
                const content = fillToFileLimit(
                    OPENERS_SEPARATED_BY_LINE_SEPARATORS,
                );

                expect(fastestRunMs(content)).toBeLessThan(BUDGET_MS);
            },
            TEST_TIMEOUT_MS,
        );

        it("should take less than 2.5 times as many steps for twice as many openers", () => {
            const { small, large } = stepsForSmallAndLarge(
                OPENERS_SEPARATED_BY_LINE_SEPARATORS,
            );

            expect(small).toBeGreaterThanOrEqual(SMALL_UNIT_COUNT);
            expect(large / small).toBeLessThan(MAX_STEP_GROWTH_RATIO);
        });
    });

    describe("when line-start imports alternate with lines holding a code span", () => {
        it(
            "should return within five seconds",
            () => {
                const content = fillToFileLimit(IMPORT_THEN_CODE_SPAN_LINES);

                expect(fastestRunMs(content)).toBeLessThan(BUDGET_MS);
            },
            TEST_TIMEOUT_MS,
        );

        it("should take less than 2.5 times as many steps for twice as many imports", () => {
            const { small, large } = stepsForSmallAndLarge(
                IMPORT_THEN_CODE_SPAN_LINES,
            );

            expect(small).toBeGreaterThanOrEqual(SMALL_UNIT_COUNT);
            expect(large / small).toBeLessThan(MAX_STEP_GROWTH_RATIO);
        });

        it("should return every import", () => {
            const content =
                IMPORT_THEN_CODE_SPAN_LINES.repeat(SMALL_UNIT_COUNT);

            expect(findImportTokens(content)).toHaveLength(SMALL_UNIT_COUNT);
        });
    });
});
