import Chance from "chance";
import { describe, expect, it } from "vitest";
import { parseDoctorOptions, shouldElicitIntent } from "./doctor-options.js";

const chance = new Chance();

const ACCEPTED_VALUES_SENTENCE = "Accepted values: human, json.";
const FALLBACK_SENTENCE = "Falling back to human output.";

function unsupportedFormatWarning(described: string): string {
    return `Unsupported --format ${described}. ${ACCEPTED_VALUES_SENTENCE} ${FALLBACK_SENTENCE}`;
}

describe("parseDoctorOptions", () => {
    describe("when the format is supported", () => {
        for (const format of ["human", "json"] as const) {
            it(`should accept --format=${format}`, () => {
                const summary = chance.bool();
                const ci = chance.bool();

                const result = parseDoctorOptions({ format, summary, ci });

                expect(result).toEqual({
                    success: true,
                    options: { format, summary, ci },
                    warnings: [],
                    formatFellBack: false,
                });
            });
        }
    });

    describe("when the format is not supported", () => {
        it("should fall back to human output with a warning that quotes the value", () => {
            const unsupportedFormat = `format-${chance.word()}`;
            const summary = chance.bool();
            const ci = chance.bool();

            const result = parseDoctorOptions({
                format: unsupportedFormat,
                summary,
                ci,
            });

            expect(result).toEqual({
                success: true,
                options: { format: "human", summary, ci },
                warnings: [unsupportedFormatWarning(`"${unsupportedFormat}"`)],
                formatFellBack: true,
            });
        });

        it("should compare the value exactly, so a different casing is unsupported", () => {
            const result = parseDoctorOptions({
                format: "JSON",
                summary: false,
                ci: false,
            });

            expect(result).toEqual({
                success: true,
                options: { format: "human", summary: false, ci: false },
                warnings: [unsupportedFormatWarning('"JSON"')],
                formatFellBack: true,
            });
        });
    });

    describe("when the unsupported format contains control characters", () => {
        it("should escape them so the warning cannot forge a line or send a terminal sequence", () => {
            const word = chance.word();
            const hostileFormat = `${word}\n[success] forged\r\t\u001b[2J\u007f\u009b\u2028\u2029`;
            const escapedFormat = `${word}\\n[success] forged\\r\\t\\u001b[2J\\u007f\\u009b\\u2028\\u2029`;

            const result = parseDoctorOptions({
                format: hostileFormat,
                summary: false,
                ci: false,
            });

            expect(result).toMatchObject({
                warnings: [unsupportedFormatWarning(`"${escapedFormat}"`)],
            });
        });
    });

    describe("when the format is omitted", () => {
        it("should use human output without a warning or a fallback", () => {
            const result = parseDoctorOptions({
                format: undefined,
                summary: false,
                ci: false,
            });

            expect(result).toEqual({
                success: true,
                options: { format: "human", summary: false, ci: false },
                warnings: [],
                formatFellBack: false,
            });
        });
    });

    describe("when the format key is absent", () => {
        it("should use human output without a warning or a fallback", () => {
            const result = parseDoctorOptions({ summary: false, ci: false });

            expect(result).toEqual({
                success: true,
                options: { format: "human", summary: false, ci: false },
                warnings: [],
                formatFellBack: false,
            });
        });
    });

    describe("when the format is not a string", () => {
        it("should fall back to human output with a warning naming its type", () => {
            const result = parseDoctorOptions({
                format: chance.integer(),
                summary: false,
                ci: false,
            });

            expect(result).toEqual({
                success: true,
                options: { format: "human", summary: false, ci: false },
                warnings: [unsupportedFormatWarning("number")],
                formatFellBack: true,
            });
        });
    });

    describe("when a flag other than --format is invalid", () => {
        it("should name --summary and not the other flags", () => {
            const result = parseDoctorOptions({
                format: "json",
                summary: chance.word(),
                ci: false,
            });

            expect(result).toEqual({
                success: false,
                message: "Invalid doctor options: --summary must be a boolean.",
            });
        });

        it("should name --ci when only --ci is invalid", () => {
            const result = parseDoctorOptions({
                format: "human",
                summary: false,
                ci: chance.integer(),
            });

            expect(result).toEqual({
                success: false,
                message: "Invalid doctor options: --ci must be a boolean.",
            });
        });

        it("should never name --format when every key is missing", () => {
            const result = parseDoctorOptions({});

            expect(result).toEqual({
                success: false,
                message:
                    "Invalid doctor options: --summary and --ci must be booleans.",
            });
        });

        it("should name every invalid flag in the plural", () => {
            const result = parseDoctorOptions({
                format: "json",
                summary: chance.word(),
                ci: chance.word(),
            });

            expect(result).toEqual({
                success: false,
                message:
                    "Invalid doctor options: --summary and --ci must be booleans.",
            });
        });
    });

    describe("when the options are not an object", () => {
        it.each([
            { name: "null", raw: null },
            { name: "undefined", raw: undefined },
            { name: "a string", raw: chance.word() },
            { name: "an array", raw: [] },
        ])(
            "should say that the options must be an object when given $name",
            ({ raw }) => {
                const result = parseDoctorOptions(raw);

                expect(result).toEqual({
                    success: false,
                    message:
                        "Invalid doctor options: options must be an object.",
                });
            },
        );
    });
});

describe("shouldElicitIntent", () => {
    it("should ask questions only for human output on a TTY without --ci", () => {
        expect(
            shouldElicitIntent(
                { format: "human", summary: false, ci: false },
                true,
                false,
            ),
        ).toBe(true);
    });

    it("should never ask questions for JSON output, even on a TTY", () => {
        expect(
            shouldElicitIntent(
                { format: "json", summary: false, ci: false },
                true,
                false,
            ),
        ).toBe(false);
    });

    it("should not ask questions with --ci", () => {
        expect(
            shouldElicitIntent(
                { format: "human", summary: false, ci: true },
                true,
                false,
            ),
        ).toBe(false);
    });

    it("should not ask questions when stdin is not a TTY", () => {
        expect(
            shouldElicitIntent(
                { format: "human", summary: false, ci: false },
                false,
                false,
            ),
        ).toBe(false);
    });

    it("should not ask questions when the requested format fell back to human", () => {
        expect(
            shouldElicitIntent(
                { format: "human", summary: false, ci: false },
                true,
                true,
            ),
        ).toBe(false);
    });
});
