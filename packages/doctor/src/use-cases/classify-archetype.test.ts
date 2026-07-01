import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanRepository } from "../gateways/scanner.js";
import { classifyArchetype } from "./classify-archetype.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../../tests/fixtures");

function fixture(name: string): string {
    return resolve(fixturesDir, name);
}

describe("classifyArchetype", () => {
    describe("when given a pure-claude repository", () => {
        it("should classify as 'pure'", async () => {
            const records = await scanRepository(fixture("pure-claude"));
            const result = classifyArchetype(records);
            expect(result.archetype).toBe("pure");
        });

        it("should set dominanceScore >= 0.80", async () => {
            const records = await scanRepository(fixture("pure-claude"));
            const result = classifyArchetype(records);
            expect(result.dominanceScore).toBeGreaterThanOrEqual(0.8);
        });

        it("should return no ambiguities", async () => {
            const records = await scanRepository(fixture("pure-claude"));
            const result = classifyArchetype(records);
            expect(result.ambiguities).toHaveLength(0);
        });
    });

    describe("when given an intentional-hybrid repository", () => {
        it("should classify as 'intentional-hybrid'", async () => {
            const records = await scanRepository(fixture("intentional-hybrid"));
            const result = classifyArchetype(records);
            expect(result.archetype).toBe("intentional-hybrid");
        });

        it("should have a dominanceScore < 1.0", async () => {
            const records = await scanRepository(fixture("intentional-hybrid"));
            const result = classifyArchetype(records);
            expect(result.dominanceScore).toBeLessThan(1.0);
        });
    });

    describe("when given an accidental-sprawl repository", () => {
        it("should classify as 'accidental-sprawl'", async () => {
            const records = await scanRepository(fixture("accidental-sprawl"));
            const result = classifyArchetype(records);
            expect(result.archetype).toBe("accidental-sprawl");
        });
    });

    describe("when given a canonical-contract repository", () => {
        it("should classify as 'canonical-contract'", async () => {
            const records = await scanRepository(fixture("canonical-contract"));
            const result = classifyArchetype(records);
            expect(result.archetype).toBe("canonical-contract");
        });
    });

    describe("when given an empty repository", () => {
        it("should classify as 'none'", async () => {
            const records = await scanRepository(fixture("empty-repo"));
            const result = classifyArchetype(records);
            expect(result.archetype).toBe("none");
        });

        it("should have dominanceScore of 0", async () => {
            const records = await scanRepository(fixture("empty-repo"));
            const result = classifyArchetype(records);
            expect(result.dominanceScore).toBe(0);
        });
    });
});
