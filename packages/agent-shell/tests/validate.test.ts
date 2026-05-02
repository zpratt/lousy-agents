import Chance from "chance";
import { describe, expect, it } from "vitest";
import { hasProtoKey } from "../src/entities/validation.js";

const chance = new Chance();

describe("hasProtoKey", () => {
    describe("given a non-object primitive value", () => {
        it("should return false", () => {
            expect(hasProtoKey(chance.string())).toBe(false);
            expect(hasProtoKey(chance.integer())).toBe(false);
            expect(hasProtoKey(false)).toBe(false);
        });
    });

    describe("given null", () => {
        it("should return false", () => {
            expect(hasProtoKey(null)).toBe(false);
        });
    });

    describe("given a plain object without a __proto__ own-property key", () => {
        it("should return false", () => {
            expect(hasProtoKey({ [chance.word()]: chance.word() })).toBe(false);
        });
    });

    describe("given an object with __proto__ as an own-property key", () => {
        it("should return true", () => {
            // JSON.parse creates a plain object where __proto__ is an own-property,
            // not a prototype reference — this is the Zod 4.4.2 validation bypass vector.
            const value = JSON.parse('{"__proto__":{"polluted":true}}');
            expect(hasProtoKey(value)).toBe(true);
        });
    });
});
