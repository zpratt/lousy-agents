import Chance from "chance";
import { describe, expect, it } from "vitest";
import { compareCodeUnits } from "./code-unit-order.js";

const chance = new Chance();

describe("compareCodeUnits", () => {
    describe("when sorting names that differ in case and punctuation", () => {
        it("should order by UTF-16 code unit, whatever the locale: '-' < uppercase < '_' < lowercase", () => {
            const names = ["a", "_x", "B", "-y"];

            const sorted = [...names].sort(compareCodeUnits);

            expect(sorted).toEqual(["-y", "B", "_x", "a"]);
        });
    });

    describe("when comparing two equal strings", () => {
        it("should return 0", () => {
            const name = chance.word();

            const result = compareCodeUnits(name, name);

            expect(result).toBe(0);
        });
    });

    describe("when one string is a prefix of the other", () => {
        it("should order the shorter string first", () => {
            const prefix = chance.word();

            expect(compareCodeUnits(prefix, `${prefix}x`)).toBeLessThan(0);
            expect(compareCodeUnits(`${prefix}x`, prefix)).toBeGreaterThan(0);
        });
    });
});
