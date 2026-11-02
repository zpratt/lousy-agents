import { describe, expect, it } from "vitest";
import {
    createSourcePositionIndex,
    offsetToSourcePosition,
} from "./source-position.js";

const HUGE_LINE_COUNT = 150_000;
const OFFSETS_TO_MAP = 200_000;
const BUDGET_MS = 2_000;
const BUDGET_RUNS = 3;
const TEST_TIMEOUT_MS = 60_000;

function fastestRunMs(run: () => void): number {
    const durations = Array.from({ length: BUDGET_RUNS }, () => {
        const start = performance.now();
        run();
        return performance.now() - start;
    });
    return Math.min(...durations);
}

describe("offsetToSourcePosition", () => {
    const content = "ab\ncde\n\nf";

    it.each([
        ["the start of the content", 0, { line: 1, column: 1 }],
        ["inside the first line", 1, { line: 1, column: 2 }],
        ["a line feed", 2, { line: 1, column: 3 }],
        ["the first character of the second line", 3, { line: 2, column: 1 }],
        ["the end of the second line", 6, { line: 2, column: 4 }],
        ["an empty line", 7, { line: 3, column: 1 }],
        ["the last line", 8, { line: 4, column: 1 }],
        ["the end of the content", 9, { line: 4, column: 2 }],
    ])("should map %s", (_name, offset, expected) => {
        expect(offsetToSourcePosition(content, offset)).toEqual(expected);
    });

    it.each([
        ["a negative offset", -5, { line: 1, column: 1 }],
        ["an offset past the end", 500, { line: 4, column: 2 }],
    ])("should clamp %s into the content", (_name, offset, expected) => {
        expect(offsetToSourcePosition(content, offset)).toEqual(expected);
    });

    it("should count a carriage return as a column, since only line feeds break lines", () => {
        expect(offsetToSourcePosition("a\r\nb", 3)).toEqual({
            line: 2,
            column: 1,
        });
        expect(offsetToSourcePosition("a\r\nb", 2)).toEqual({
            line: 1,
            column: 3,
        });
    });

    it("should map every offset of an empty content to the first position", () => {
        expect(offsetToSourcePosition("", 0)).toEqual({ line: 1, column: 1 });
        expect(offsetToSourcePosition("", 3)).toEqual({ line: 1, column: 1 });
    });
});

describe("createSourcePositionIndex", () => {
    it("should answer the same position as offsetToSourcePosition for every offset", () => {
        const content = "ab\ncde\n\nf\n\n\ng";
        const index = createSourcePositionIndex(content);

        for (let offset = -2; offset <= content.length + 2; offset += 1) {
            expect(index(offset)).toEqual(
                offsetToSourcePosition(content, offset),
            );
        }
    });

    describe("the work the index does", () => {
        const SmallLines = 1_000;
        const LargeLines = 100_000;
        const Lookups = 500;

        function stepsOf(lineCount: number): {
            build: number;
            perLookup: number;
        } {
            const content = "abc\n".repeat(lineCount);
            let build = 0;
            const index = createSourcePositionIndex(content, (steps) => {
                build += steps;
            });
            const afterBuild = build;
            for (let n = 0; n < Lookups; n += 1) {
                index(Math.floor((n * content.length) / Lookups));
            }
            return {
                build: afterBuild,
                perLookup: (build - afterBuild) / Lookups,
            };
        }

        it("should read the content once to build the index", () => {
            expect(stepsOf(SmallLines).build).toBe(SmallLines * 4);
            expect(stepsOf(LargeLines).build).toBe(LargeLines * 4);
        });

        it("should answer an offset in a number of steps that grows with the logarithm of the line count, not the content length", () => {
            const small = stepsOf(SmallLines).perLookup;
            const large = stepsOf(LargeLines).perLookup;

            expect(small).toBeGreaterThan(1);
            expect(large).toBeLessThanOrEqual(Math.log2(LargeLines) + 2);
            expect(large / small).toBeLessThan(2);
        });

        it("should answer an offset without counting when no counter is given", () => {
            expect(createSourcePositionIndex("a\nb")(2)).toEqual({
                line: 2,
                column: 1,
            });
        });
    });

    it(
        "should map two hundred thousand offsets of a huge content within the budget",
        () => {
            const line = "@a.md\n";
            const content = line.repeat(HUGE_LINE_COUNT);
            const index = createSourcePositionIndex(content);
            const stride = Math.floor(content.length / OFFSETS_TO_MAP);
            const lastOffset = (OFFSETS_TO_MAP - 1) * stride;

            let last = { line: 0, column: 0 };
            const elapsed = fastestRunMs(() => {
                for (let n = 0; n < OFFSETS_TO_MAP; n += 1) {
                    last = index(n * stride);
                }
            });

            expect(last).toEqual({
                line: Math.floor(lastOffset / line.length) + 1,
                column: (lastOffset % line.length) + 1,
            });
            expect(elapsed).toBeLessThan(BUDGET_MS);
        },
        TEST_TIMEOUT_MS,
    );
});
