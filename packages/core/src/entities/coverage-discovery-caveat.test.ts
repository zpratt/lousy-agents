import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    discoveryLeftFilesOut,
    qualifyAllDocumented,
    qualifyUndocumented,
} from "./coverage-discovery-caveat.js";

const chance = new Chance();

const ALL_DOCUMENTED_CAVEAT =
    "✅ All mandatory feedback loops are documented in the instruction files found, but discovery left some instruction files out, so they were not checked";

describe("discoveryLeftFilesOut", () => {
    it("should be false when discovery reported nothing", () => {
        expect(discoveryLeftFilesOut([])).toBe(false);
    });

    it("should be true when discovery reported a limit", () => {
        expect(
            discoveryLeftFilesOut([
                { ruleId: "instruction/discovery-limit-reached" },
            ]),
        ).toBe(true);
    });

    it("should be true when discovery reported a skipped symbolic link", () => {
        expect(
            discoveryLeftFilesOut([
                { ruleId: "instruction/discovery-symlink-skipped" },
            ]),
        ).toBe(true);
    });
});

describe("qualifyAllDocumented", () => {
    it("should keep the caller's sentence when discovery left nothing out", () => {
        const plain = `✅ ${chance.sentence()}`;

        expect(qualifyAllDocumented(plain, false)).toBe(plain);
    });

    it("should say that only the files found were checked when discovery left files out", () => {
        const plain = `✅ ${chance.sentence()}`;

        expect(qualifyAllDocumented(plain, true)).toBe(ALL_DOCUMENTED_CAVEAT);
    });
});

describe("qualifyUndocumented", () => {
    it("should keep the caller's sentence when discovery left nothing out", () => {
        const plain = `⚠️  ${chance.sentence()}`;

        expect(qualifyUndocumented(plain, false)).toBe(plain);
    });

    it("should say the item may be documented in a file that was not checked when discovery left files out", () => {
        const plain = `⚠️  ${chance.sentence()}`;

        expect(qualifyUndocumented(plain, true)).toBe(
            `${plain} in the instruction files found; discovery left some instruction files out, so they may be documented in files that were not checked`,
        );
    });
});
