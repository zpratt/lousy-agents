const NAMED_ESCAPES: Readonly<Record<string, string>> = {
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\\": "\\\\",
};

const FORMAT_CHARACTER = /\p{Cf}/u;
const BASIC_MULTILINGUAL_PLANE_END = 0xffff;

function escapeCharacter(character: string, code: number): string {
    const named = NAMED_ESCAPES[character];
    if (named !== undefined) {
        return named;
    }
    const hex = code.toString(16);
    return code > BASIC_MULTILINGUAL_PLANE_END
        ? `\\u{${hex}}`
        : `\\u${hex.padStart(4, "0")}`;
}

function needsEscape(character: string, code: number): boolean {
    const isBackslash = character === "\\";
    const isC0Control = code <= 0x1f;
    const isDeleteOrC1Control = code >= 0x7f && code <= 0x9f;
    const isUnicodeLineSeparator = code === 0x2028 || code === 0x2029;
    return (
        isBackslash ||
        isC0Control ||
        isDeleteOrC1Control ||
        isUnicodeLineSeparator ||
        FORMAT_CHARACTER.test(character)
    );
}

export function escapeForTerminal(text: string): string {
    return Array.from(text, (character) => {
        const code = character.codePointAt(0) ?? 0;
        return needsEscape(character, code)
            ? escapeCharacter(character, code)
            : character;
    }).join("");
}
