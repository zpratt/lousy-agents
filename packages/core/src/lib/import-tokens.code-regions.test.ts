import { describe, expect, it } from "vitest";
import { findImportTokens } from "./import-tokens.js";

function rawTargets(content: string): string[] {
    return findImportTokens(content).map((token) => token.rawTarget);
}

describe("findImportTokens code regions", () => {
    describe("when a fence is never closed", () => {
        it("should leave the imports after it live", () => {
            expect(rawTargets("```js\n@./a.md\n@./b.md\n")).toEqual([
                "./a.md",
                "./b.md",
            ]);
        });

        it("should leave the imports live when every later fence line is another opener", () => {
            const content = "```js\n@./a.md\n```ts\n@./b.md\n~~~sh\n@./c.md\n";

            expect(rawTargets(content)).toEqual(["./a.md", "./b.md", "./c.md"]);
        });

        it("should not let a tilde line close a backtick fence", () => {
            expect(rawTargets("```\n@./a.md\n~~~\n")).toEqual(["./a.md"]);
        });
    });

    describe("when a fence is closed", () => {
        it("should hide the imports inside a fence whose opener has an info string", () => {
            expect(rawTargets("```js title=x\n@./a.md\n```\n")).toEqual([]);
        });

        it("should accept trailing spaces and tabs after the closing fence", () => {
            const content = "```\n@./a.md\n``` \t \n@./b.md\n";

            expect(rawTargets(content)).toEqual(["./b.md"]);
        });

        it("should not accept text after the closing fence as a close", () => {
            const content = "```\n@./a.md\n```js\n@./b.md\n";

            expect(rawTargets(content)).toEqual(["./a.md", "./b.md"]);
        });

        it("should close on the line right after the opener", () => {
            const content = "```\n```\n@./a.md\n```\n";

            expect(rawTargets(content)).toEqual(["./a.md"]);
        });

        it("should not let a fence line inside a closed fence open another fence", () => {
            const content = "````\n```\n@./a.md\n````\n@./b.md\n```\n";

            expect(rawTargets(content)).toEqual(["./b.md"]);
        });

        it("should keep the imports between two fences live", () => {
            const content =
                "```\n@./a.md\n```\n@./b.md\n~~~\n@./c.md\n~~~\n@./d.md\n";

            expect(rawTargets(content)).toEqual(["./b.md", "./d.md"]);
        });

        it("should not treat an indented fence as a fence", () => {
            expect(rawTargets(" ```\n@./a.md\n ```\n")).toEqual(["./a.md"]);
        });

        it("should close a fence on the last line of a file that has no final newline", () => {
            expect(rawTargets("```\n@./a.md\n```")).toEqual([]);
        });

        it("should not open a fence on a line that ends in a lone carriage return", () => {
            const content = "```\r@./a.md\r```\r";

            expect(rawTargets(content)).toEqual(["./a.md"]);
        });

        it("should treat two fence characters as no fence at all", () => {
            expect(rawTargets("``\n@./a.md\n``\n")).toEqual(["./a.md"]);
        });

        it("should start a fence after a lone carriage return", () => {
            const content = "text\r```\n@./a.md\n```\n@./b.md\n";

            expect(rawTargets(content)).toEqual(["./b.md"]);
        });

        it.each([
            ["a line separator", 0x2028],
            ["a paragraph separator", 0x2029],
        ])("should start a fence after %s", (_name, codePoint) => {
            const separator = String.fromCodePoint(codePoint);
            const content = `text${separator}\`\`\`\n@./a.md\n\`\`\`\n@./b.md\n`;

            expect(rawTargets(content)).toEqual(["./b.md"]);
        });

        it("should understand Windows line endings in the opener and the closer", () => {
            const content = "```\r\n@./a.md\r\n```\r\n@./b.md\r\n";

            expect(rawTargets(content)).toEqual(["./b.md"]);
        });
    });

    describe("when a fence is longer than three characters", () => {
        it("should close it with a line of the same length and let a shorter fence line sit inside", () => {
            const content = "````\n```\n@./a.md\n```\n````\n@./b.md\n";

            expect(rawTargets(content)).toEqual(["./b.md"]);
        });

        it("should not close it with a longer line", () => {
            expect(rawTargets("````\n@./a.md\n``````\n")).toEqual(["./a.md"]);
        });

        it("should close it with the longest shorter length that has a closing line anywhere after it, when no line of the same length does", () => {
            const content = "`````\n@./a.md\n``\n```\n@./b.md\n````\n@./c.md\n";

            expect(rawTargets(content)).toEqual(["./c.md"]);
        });

        it("should prefer a later closing line of the same length to an earlier shorter one", () => {
            const content = "````\n@./a.md\n```\n@./b.md\n````\n@./c.md\n";

            expect(rawTargets(content)).toEqual(["./c.md"]);
        });
    });

    describe("when code spans are on their own lines", () => {
        it("should not let a span run across lines", () => {
            expect(rawTargets("`\n@./a.md\n`\n")).toEqual(["./a.md"]);
        });

        it("should keep the imports around a span line live", () => {
            const content = "@./a.md\n`x`\n@./b.md\n";

            expect(rawTargets(content)).toEqual(["./a.md", "./b.md"]);
        });

        it("should hide an import inside a span that sits between two fences", () => {
            const lineSeparator = String.fromCodePoint(0x2028);
            const content = [
                "```",
                "f",
                "```",
                `\`a${lineSeparator}@./x.md\``,
                "```",
                "g",
                "```",
                "@./z.md",
                "",
            ].join("\n");

            expect(rawTargets(content)).toEqual(["./z.md"]);
        });

        it("should hide an import that begins inside a span that started before a line separator", () => {
            const lineSeparator = String.fromCodePoint(0x2028);
            const content = `\`a${lineSeparator}@./a.md\`\n@./b.md\n`;

            expect(rawTargets(content)).toEqual(["./b.md"]);
        });
    });
});
