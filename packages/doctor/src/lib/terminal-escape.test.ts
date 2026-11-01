import Chance from "chance";
import { describe, expect, it } from "vitest";
import { escapeForTerminal } from "./terminal-escape.js";

const chance = new Chance();

function characterOf(codePoint: number): string {
    return String.fromCodePoint(codePoint);
}

describe("escapeForTerminal", () => {
    describe("when the text contains an invisible format character", () => {
        const formatCharacters = [
            { name: "soft hyphen", codePoint: 0x00ad, escaped: "\\u00ad" },
            { name: "zero width space", codePoint: 0x200b, escaped: "\\u200b" },
            {
                name: "right-to-left mark",
                codePoint: 0x200f,
                escaped: "\\u200f",
            },
            {
                name: "left-to-right embedding",
                codePoint: 0x202a,
                escaped: "\\u202a",
            },
            {
                name: "right-to-left override",
                codePoint: 0x202e,
                escaped: "\\u202e",
            },
            { name: "word joiner", codePoint: 0x2060, escaped: "\\u2060" },
            {
                name: "left-to-right isolate",
                codePoint: 0x2066,
                escaped: "\\u2066",
            },
            {
                name: "pop directional isolate",
                codePoint: 0x2069,
                escaped: "\\u2069",
            },
            { name: "byte order mark", codePoint: 0xfeff, escaped: "\\ufeff" },
            {
                name: "language tag",
                codePoint: 0xe0001,
                escaped: "\\u{e0001}",
            },
        ];

        it.each(formatCharacters)(
            "should replace the $name with its escaped form",
            ({ codePoint, escaped }) => {
                const word = chance.word();

                const result = escapeForTerminal(
                    `${word}${characterOf(codePoint)}${word}`,
                );

                expect(result).toBe(`${word}${escaped}${word}`);
            },
        );
    });

    describe("when the text contains a backslash", () => {
        it("should escape it so an escape sequence cannot be imitated", () => {
            const word = chance.word();

            const result = escapeForTerminal(`${word}\\n${word}`);

            expect(result).toBe(`${word}\\\\n${word}`);
        });

        it("should tell a literal backslash-n apart from a real line break", () => {
            const literal = escapeForTerminal("a\\nb");
            const lineBreak = escapeForTerminal("a\nb");

            expect(literal).toBe("a\\\\nb");
            expect(lineBreak).toBe("a\\nb");
            expect(literal).not.toBe(lineBreak);
        });
    });

    describe("when the text contains printable characters beside the escaped ranges", () => {
        const printableCodePoints = [
            { name: "tilde", codePoint: 0x7e },
            { name: "space", codePoint: 0x20 },
            { name: "not sign", codePoint: 0xac },
            { name: "registered sign", codePoint: 0xae },
            { name: "hyphen", codePoint: 0x2010 },
            { name: "narrow no-break space", codePoint: 0x202f },
            { name: "superscript zero", codePoint: 0x2070 },
            { name: "latin small e with acute", codePoint: 0xe9 },
            { name: "cjk ideograph", codePoint: 0x65e5 },
            { name: "emoji", codePoint: 0x1f600 },
        ];

        it.each(printableCodePoints)(
            "should leave the $name unchanged",
            ({ codePoint }) => {
                const text = characterOf(codePoint);

                expect(escapeForTerminal(text)).toBe(text);
            },
        );
    });
});
