import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    type DiscoveryLimitWording,
    describeDiscoveryLimits,
} from "./discovery-limit-message.js";

const chance = new Chance();

const wording: DiscoveryLimitWording = {
    subject: "The walk",
    missing: "widgets",
    consequence: "were never counted",
};

describe("describeDiscoveryLimits", () => {
    it("should describe a reached directory limit in the words of the caller", () => {
        const maxDirectories = chance.integer({ min: 1, max: 99_999 });

        expect(describeDiscoveryLimits({ maxDirectories }, wording)).toEqual([
            `The walk stopped after listing ${maxDirectories} directories, so widgets in the remaining directories were never counted.`,
        ]);
    });

    it("should describe a reached depth limit", () => {
        const maxDepth = chance.integer({ min: 1, max: 99 });

        expect(describeDiscoveryLimits({ maxDepth }, wording)).toEqual([
            `The walk did not go more than ${maxDepth} directories deep, so widgets in deeper directories were never counted.`,
        ]);
    });

    it("should describe a reached entry limit", () => {
        const maxEntries = chance.integer({ min: 1, max: 999_999 });

        expect(describeDiscoveryLimits({ maxEntries }, wording)).toEqual([
            `The walk stopped after examining ${maxEntries} directory entries, so widgets in the remaining entries were never counted.`,
        ]);
    });

    it("should describe every reached limit, directories first, then depth, then entries", () => {
        const sentences = describeDiscoveryLimits(
            { maxEntries: 3, maxDepth: 2, maxDirectories: 1 },
            wording,
        );

        expect(sentences).toEqual([
            "The walk stopped after listing 1 directories, so widgets in the remaining directories were never counted.",
            "The walk did not go more than 2 directories deep, so widgets in deeper directories were never counted.",
            "The walk stopped after examining 3 directory entries, so widgets in the remaining entries were never counted.",
        ]);
    });

    it.each([
        [
            "directories",
            { maxDirectories: 0 },
            "stopped after listing 0 directories",
        ],
        ["depth", { maxDepth: 0 }, "did not go more than 0 directories deep"],
        [
            "entries",
            { maxEntries: 0 },
            "stopped after examining 0 directory entries",
        ],
    ])(
        "should describe a %s limit of zero, since zero is a limit that was reached",
        (_, reached, phrase) => {
            const [sentence] = describeDiscoveryLimits(reached, wording);

            expect(sentence).toContain(phrase);
        },
    );

    it("should describe nothing when no limit was reached", () => {
        expect(describeDiscoveryLimits({}, wording)).toEqual([]);
    });
});
