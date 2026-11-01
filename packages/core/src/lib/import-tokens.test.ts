import Chance from "chance";
import { describe, expect, it } from "vitest";
import { findImportTokens } from "./import-tokens.js";

const chance = new Chance();

function rawTargets(content: string): string[] {
    return findImportTokens(content).map((token) => token.rawTarget);
}

describe("findImportTokens", () => {
    describe("when a line starts with @ and a path", () => {
        it.each(["./a.md", "../a.md", "/abs/a.md", "~/a.md", "docs/guide.md"])(
            "should return %s as a token that looks like a path",
            (target) => {
                const tokens = findImportTokens(`@${target}\n`);

                expect(tokens).toEqual([
                    {
                        start: 0,
                        end: target.length + 1,
                        rawTarget: target,
                        looksLikePath: true,
                    },
                ]);
            },
        );

        it("should return a bare file name such as @AGENTS.md, which has no slash", () => {
            const content = "intro\n@AGENTS.md\n";

            const tokens = findImportTokens(content);

            expect(tokens).toEqual([
                {
                    start: 6,
                    end: 16,
                    rawTarget: "AGENTS.md",
                    looksLikePath: true,
                },
            ]);
        });

        it.each(["types/node", "no-such-thing", chance.word()])(
            "should return %s as a token that does not look like a path",
            (target) => {
                const tokens = findImportTokens(`@${target}\n`);

                expect(tokens.map((t) => t.looksLikePath)).toEqual([false]);
            },
        );
    });

    describe("when the path contains spaces", () => {
        it("should keep a backslash-escaped space in the path", () => {
            const tokens = findImportTokens("@./has\\ space.md\n");

            expect(tokens).toEqual([
                {
                    start: 0,
                    end: 16,
                    rawTarget: "./has space.md",
                    looksLikePath: true,
                },
            ]);
        });

        it("should end the path at the first unescaped space", () => {
            const targets = rawTargets("@./has space.md\n");

            expect(targets).toEqual(["./has"]);
        });
    });

    describe("when the text is not an import", () => {
        it.each([
            ['@"./q.md"', "double-quoted"],
            ["@'./q.md'", "single-quoted"],
            ["@`./q.md`", "backticked"],
        ])("should skip a %s path", (content) => {
            expect(rawTargets(`${content}\n`)).toEqual([]);
        });

        it.each([
            ["a code span", "Use `@./q.md` here.\n"],
            ["a fenced block", "```\n@./q.md\n```\n"],
            ["a tilde fence", "~~~\n@./q.md\n~~~\n"],
        ])("should skip an @path inside %s", (_label, content) => {
            expect(rawTargets(content)).toEqual([]);
        });

        it.each([
            [
                "a mention in the middle of a line",
                "see @AGENTS.md for details\n",
            ],
            ["an email address", "contact a@b.com\n"],
            ["a lone @", "@\n"],
            ["a doubled @", "@@x.md\n"],
            ["@ followed by a space", "@ ./a.md\n"],
        ])("should skip %s", (_label, content) => {
            expect(rawTargets(content)).toEqual([]);
        });
    });

    describe("when the content has several imports and Windows line endings", () => {
        it("should return each import with exact offsets and without the carriage return", () => {
            const content = "@./a.md\r\ntext\r\n@./b.md\r\n";

            const tokens = findImportTokens(content);

            expect(tokens.map((t) => [t.start, t.end, t.rawTarget])).toEqual([
                [0, 7, "./a.md"],
                [15, 22, "./b.md"],
            ]);
        });
    });
});
