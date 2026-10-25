import Chance from "chance";
import { describe, expect, it } from "vitest";
import { parseDoctorOptions, shouldElicitIntent } from "./doctor-options.js";

const chance = new Chance();

describe("parseDoctorOptions", () => {
    describe("when the format is supported", () => {
        for (const format of ["human", "json"] as const) {
            it(`should accept --format=${format}`, () => {
                // Arrange
                const summary = chance.bool();
                const ci = chance.bool();

                // Act
                const result = parseDoctorOptions({ format, summary, ci });

                // Assert
                expect(result).toEqual({
                    success: true,
                    options: { format, summary, ci },
                });
            });
        }
    });

    describe("when the format is not supported", () => {
        it("should reject it with a message naming the value and the allowed formats", () => {
            // Arrange
            const unsupportedFormat = `format-${chance.word()}`;

            // Act
            const result = parseDoctorOptions({
                format: unsupportedFormat,
                summary: false,
                ci: false,
            });

            // Assert
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.message).toContain(unsupportedFormat);
                expect(result.message).toContain("human");
                expect(result.message).toContain("json");
            }
        });
    });

    describe("when a flag other than --format is invalid", () => {
        it("should reject the options without blaming the format", () => {
            const result = parseDoctorOptions({
                format: "json",
                summary: chance.word(),
                ci: false,
            });

            expect(result).toEqual({
                success: false,
                message: "Invalid doctor options.",
            });
        });
    });

    describe("when the format is not a string", () => {
        it("should reject it", () => {
            const result = parseDoctorOptions({
                format: chance.integer(),
                summary: false,
                ci: false,
            });

            expect(result.success).toBe(false);
        });
    });
});

describe("shouldElicitIntent", () => {
    it("should ask questions only for human output on a TTY without --ci", () => {
        expect(
            shouldElicitIntent(
                { format: "human", summary: false, ci: false },
                true,
            ),
        ).toBe(true);
    });

    it("should never ask questions for JSON output, even on a TTY", () => {
        expect(
            shouldElicitIntent(
                { format: "json", summary: false, ci: false },
                true,
            ),
        ).toBe(false);
    });

    it("should not ask questions with --ci", () => {
        expect(
            shouldElicitIntent(
                { format: "human", summary: false, ci: true },
                true,
            ),
        ).toBe(false);
    });

    it("should not ask questions when stdin is not a TTY", () => {
        expect(
            shouldElicitIntent(
                { format: "human", summary: false, ci: false },
                false,
            ),
        ).toBe(false);
    });
});
