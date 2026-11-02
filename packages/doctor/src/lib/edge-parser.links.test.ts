import { describe, expect, it } from "vitest";
import { parseRawEdges } from "./edge-parser.js";

const FILE_SIZE_LIMIT = 1_048_576;
const BUDGET_MS = 1_000;
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

function linkTargets(content: string): string[] {
    return parseRawEdges(content)
        .filter((edge) => edge.type === "soft-reference")
        .map((edge) => edge.rawTarget);
}

describe("parseRawEdges markdown link forms", () => {
    it.each([
        ["a plain link", "[guide](./a.md)", ["./a.md"]],
        [
            "two links on a line",
            "[a](./a.md) and [b](./b.md)",
            ["./a.md", "./b.md"],
        ],
        [
            "a link whose text holds an opening bracket",
            "[a [b](./a.md)",
            ["./a.md"],
        ],
        [
            "a link after an unmatched opening bracket",
            "[x [y](./a.md) tail",
            ["./a.md"],
        ],
        ["a link after another bracket pair", "[x][y](./a.md)", ["./a.md"]],
        ["an empty link text", "[](./a.md)", ["./a.md"]],
        [
            "a link across a line break in its text",
            "[one\ntwo](./a.md)",
            ["./a.md"],
        ],
        [
            "a target that holds an opening parenthesis",
            "[a](./b(c.md)",
            ["./b(c.md"],
        ],
        ["a space between the text and the target", "[a] (./a.md)", []],
        ["an empty target", "[a]()\n[b](./b.md)", ["./b.md"]],
        [
            "a link-like pair after a target that ends with an opening bracket",
            "[a](x[) ](./c.md)",
            [],
        ],
        ["a target that is never closed", "[a](./a.md", []],
        ["a text that is never closed", "[a(./a.md)", []],
        ["no brackets at all", "plain text (./a.md)", []],
    ])("should read %s", (_name, content, expected) => {
        expect(linkTargets(`${content}\n`)).toEqual(expected);
    });

    describe("when the content is hostile", () => {
        it(
            "should finish a run of opening brackets with no closing bracket within the budget, and still find the link before it",
            () => {
                const content = `[a](./x.md)\n${"[".repeat(FILE_SIZE_LIMIT)}\n`;

                expect(linkTargets(content)).toEqual(["./x.md"]);
                expect(fastestRunMs(() => linkTargets(content))).toBeLessThan(
                    BUDGET_MS,
                );
            },
            TEST_TIMEOUT_MS,
        );

        it(
            "should finish a run of opening brackets before a single closing bracket within the budget",
            () => {
                const content = `${"[".repeat(FILE_SIZE_LIMIT)}] and (./x.md)\n`;

                expect(linkTargets(content)).toEqual([]);
                expect(fastestRunMs(() => linkTargets(content))).toBeLessThan(
                    BUDGET_MS,
                );
            },
            TEST_TIMEOUT_MS,
        );

        it(
            "should finish a run of links whose target is never closed within the budget",
            () => {
                const content = `${"[a](".repeat(FILE_SIZE_LIMIT / 4)}\n`;

                expect(linkTargets(content)).toEqual([]);
                expect(fastestRunMs(() => linkTargets(content))).toBeLessThan(
                    BUDGET_MS,
                );
            },
            TEST_TIMEOUT_MS,
        );

        it(
            "should finish a run of closing brackets within the budget",
            () => {
                const content = `[${"]".repeat(FILE_SIZE_LIMIT)}(./x.md)\n`;

                expect(linkTargets(content)).toEqual([]);
                expect(fastestRunMs(() => linkTargets(content))).toBeLessThan(
                    BUDGET_MS,
                );
            },
            TEST_TIMEOUT_MS,
        );
    });
});
