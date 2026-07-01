import { describe, expect, it } from "vitest";
import { CRITERIA } from "./criteria.js";

describe("CRITERIA", () => {
    it("should be a non-empty array", () => {
        expect(CRITERIA.length).toBeGreaterThan(0);
    });

    it("should include missing-copilot-instructions as critical defect", () => {
        const criterion = CRITERIA.find(
            (c) => c.id === "missing-copilot-instructions",
        );
        expect(criterion).toBeDefined();
        expect(criterion?.severity).toBe("critical");
        expect(criterion?.classification).toBe("defect");
        expect(criterion?.category).toBe("missing-required");
    });

    it("should include missing-intent-artifact as medium defect", () => {
        const criterion = CRITERIA.find(
            (c) => c.id === "missing-intent-artifact",
        );
        expect(criterion).toBeDefined();
        expect(criterion?.severity).toBe("medium");
        expect(criterion?.classification).toBe("defect");
        expect(criterion?.category).toBe("governance");
    });

    it("should have unique ids for all criteria", () => {
        const ids = CRITERIA.map((c) => c.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
    });

    it("should have valid checkMethod on all criteria", () => {
        const validMethods = new Set([
            "inventory.fileExists",
            "inventory.edgePresent",
            "inventory.edgeDirection",
            "inventory.edgeDirectionExists",
            "inventory.archetypeIs",
            "inventory.constructPresent",
            "intent.capabilityDeclared",
        ]);
        for (const criterion of CRITERIA) {
            expect(validMethods.has(criterion.checkMethod)).toBe(true);
        }
    });
});
