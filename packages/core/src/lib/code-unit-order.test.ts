import Chance from "chance";
import { describe, expect, it } from "vitest";
import { compareCodeUnits } from "./code-unit-order.js";

const chance = new Chance();

describe("compareCodeUnits", () => {
    describe("when sorting names that differ in case and punctuation", () => {
        it("should order by UTF-16 code unit, whatever the locale: '-' < uppercase < '_' < lowercase", () => {
            // Arrange
            const names = ["a", "_x", "B", "-y"];

            // Act
            const sorted = [...names].sort(compareCodeUnits);

            // Assert
            expect(sorted).toEqual(["-y", "B", "_x", "a"]);
        });
    });

    describe("when comparing two equal strings", () => {
        it("should return 0", () => {
            // Arrange
            const name = chance.word();

            // Act
            const result = compareCodeUnits(name, name);

            // Assert
            expect(result).toBe(0);
        });
    });

    describe("when one string is a prefix of the other", () => {
        it("should order the shorter string first", () => {
            // Arrange
            const prefix = chance.word();

            // Act / Assert
            expect(compareCodeUnits(prefix, `${prefix}x`)).toBeLessThan(0);
            expect(compareCodeUnits(`${prefix}x`, prefix)).toBeGreaterThan(0);
        });
    });
});
