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

    describe("given an object with __proto__ as an own-property key at the top level", () => {
        it("should return true", () => {
            // JSON.parse creates a plain object where __proto__ is an own-property,
            // not a prototype reference — this is the Zod 4.4.2 validation bypass vector.
            const value = JSON.parse('{"__proto__":{"polluted":true}}');
            expect(hasProtoKey(value)).toBe(true);
        });
    });

    describe("given an object with __proto__ nested inside a sub-object", () => {
        it("should return true", () => {
            const value = JSON.parse(
                '{"hooks":{"preToolUse":[{"type":"command","bash":"echo hi","__proto__":{"polluted":true}}]}}',
            );
            expect(hasProtoKey(value)).toBe(true);
        });
    });

    describe("given an object with __proto__ nested inside an array element", () => {
        it("should return true", () => {
            const value = JSON.parse(
                '{"allow":[{"__proto__":{"polluted":true}}]}',
            );
            expect(hasProtoKey(value)).toBe(true);
        });
    });

    describe("given a structure deeper than MAX_PROTO_SCAN_DEPTH with no __proto__", () => {
        it("should return true (conservatively reject)", () => {
            // Build an object 34 levels deep (= MAX_PROTO_SCAN_DEPTH [32] + 2),
            // ensuring we exceed the scan limit regardless of the constant's value.
            let deep: unknown = { safe: true };
            for (let i = 0; i < 34; i++) {
                deep = { nested: deep };
            }
            expect(hasProtoKey(deep)).toBe(true);
        });
    });
});
