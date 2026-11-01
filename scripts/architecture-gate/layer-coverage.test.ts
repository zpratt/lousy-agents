import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    findAmbiguouslyMappedFiles,
    findNestedPrefixes,
    findStalePrefixes,
    findUnmappedFiles,
    matchesPrefix,
} from "./layer-coverage.js";
import type { LayerPolicy } from "./layer-policy.js";

const chance = new Chance();

function policyWith(
    layers: ReadonlyArray<{ name: string; prefixes: readonly string[] }>,
): LayerPolicy {
    return { layers, forbiddenImports: [] };
}

describe("matchesPrefix", () => {
    describe("when the prefix is a directory", () => {
        it("should match a file inside it", () => {
            // Arrange
            const directory = `packages/${chance.word()}/src`;
            const file = `${directory}/${chance.word()}/${chance.word()}.ts`;

            // Act
            const result = matchesPrefix(file, directory);

            // Assert
            expect(result).toBe(true);
        });

        it("should not match a sibling whose name only starts with the same characters", () => {
            // Arrange
            const directory = "packages/core/src/lib";
            const sibling = "packages/core/src/library/thing.ts";

            // Act
            const result = matchesPrefix(sibling, directory);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe("when the prefix is a single file", () => {
        it("should match exactly that file", () => {
            // Arrange
            const file = "packages/lint/src/index.ts";

            // Act
            const result = matchesPrefix(file, file);

            // Assert
            expect(result).toBe(true);
        });

        it("should not match a file whose name only starts with the same characters", () => {
            // Arrange
            const prefix = "packages/lint/src/index.ts";
            const lookalike = "packages/lint/src/index.ts.bak";
            const longer = "packages/lint/src/index-utils.ts";

            // Act
            const results = [
                matchesPrefix(lookalike, prefix),
                matchesPrefix(longer, "packages/lint/src/index"),
            ];

            // Assert
            expect(results).toEqual([false, false]);
        });
    });

    describe("when the prefix is the repository root", () => {
        it("should match every path, as coach does", () => {
            // Arrange
            const file = `${chance.word()}/${chance.word()}.ts`;

            // Act
            const result = matchesPrefix(file, ".");

            // Assert
            expect(result).toBe(true);
        });
    });
});

describe("findUnmappedFiles", () => {
    it("should return the files no layer claims, in the order given", () => {
        // Arrange
        const policy = policyWith([
            { name: "inner", prefixes: ["packages/core/src/entities"] },
            { name: "outer", prefixes: ["packages/lint/src/index.ts"] },
        ]);
        const claimed = "packages/core/src/entities/a.ts";
        const unclaimedFirst = "packages/core/src/index.ts";
        const unclaimedSecond = "packages/lint/src/lint.ts";

        // Act
        const unmapped = findUnmappedFiles(
            [unclaimedFirst, claimed, unclaimedSecond],
            policy,
        );

        // Assert
        expect(unmapped).toEqual([unclaimedFirst, unclaimedSecond]);
    });

    it("should return nothing when every file is claimed", () => {
        // Arrange
        const policy = policyWith([{ name: "all", prefixes: ["packages"] }]);

        // Act
        const unmapped = findUnmappedFiles(["packages/a/src/b.ts"], policy);

        // Assert
        expect(unmapped).toEqual([]);
    });
});

describe("findAmbiguouslyMappedFiles", () => {
    it("should name each file claimed by more than one layer with the layers that claim it", () => {
        // Arrange
        const policy = policyWith([
            { name: "wide", prefixes: ["packages/core/src"] },
            { name: "narrow", prefixes: ["packages/core/src/index.ts"] },
        ]);
        const contested = "packages/core/src/index.ts";
        const uncontested = "packages/core/src/other.ts";

        // Act
        const ambiguous = findAmbiguouslyMappedFiles(
            [contested, uncontested],
            policy,
        );

        // Assert
        expect(ambiguous).toEqual([
            { file: contested, layers: ["wide", "narrow"] },
        ]);
    });
});

describe("findUnmappedFiles with overlapping layers", () => {
    it("should not report a file that two layers claim as unmapped", () => {
        // Arrange
        const policy = policyWith([
            { name: "wide", prefixes: ["packages/core/src"] },
            { name: "narrow", prefixes: ["packages/core/src/index.ts"] },
        ]);

        // Act
        const unmapped = findUnmappedFiles(
            ["packages/core/src/index.ts"],
            policy,
        );

        // Assert
        expect(unmapped).toEqual([]);
    });
});

describe("findNestedPrefixes", () => {
    it("should name the outer prefix as the ancestor however the layers are ordered", () => {
        // Arrange
        const policy = policyWith([
            { name: "narrow", prefixes: ["packages/core/src/index.ts"] },
            { name: "wide", prefixes: ["packages/core/src"] },
        ]);

        // Act
        const nested = findNestedPrefixes(policy);

        // Assert
        expect(nested).toEqual([
            {
                ancestor: "packages/core/src",
                descendant: "packages/core/src/index.ts",
            },
        ]);
    });

    it("should report a prefix that sits inside another prefix of a different layer", () => {
        // Arrange
        const policy = policyWith([
            { name: "wide", prefixes: ["packages/core/src"] },
            { name: "narrow", prefixes: ["packages/core/src/index.ts"] },
        ]);

        // Act
        const nested = findNestedPrefixes(policy);

        // Assert
        expect(nested).toEqual([
            {
                ancestor: "packages/core/src",
                descendant: "packages/core/src/index.ts",
            },
        ]);
    });

    it("should report a nested pair even when coach's adjacent-only check would miss it", () => {
        // Arrange
        const policy = policyWith([
            {
                name: "layered",
                prefixes: [
                    "packages/a",
                    "packages/a-b",
                    "packages/a/b",
                    "packages/a/b/c.ts",
                ],
            },
        ]);

        // Act
        const nested = findNestedPrefixes(policy);

        // Assert
        expect(nested).toEqual([
            { ancestor: "packages/a", descendant: "packages/a/b" },
            { ancestor: "packages/a", descendant: "packages/a/b/c.ts" },
            { ancestor: "packages/a/b", descendant: "packages/a/b/c.ts" },
        ]);
    });

    it("should report a prefix listed twice", () => {
        // Arrange
        const duplicate = `packages/${chance.word()}`;
        const policy = policyWith([
            { name: "first", prefixes: [duplicate] },
            { name: "second", prefixes: [duplicate] },
        ]);

        // Act
        const nested = findNestedPrefixes(policy);

        // Assert
        expect(nested).toEqual([
            { ancestor: duplicate, descendant: duplicate },
        ]);
    });

    it("should report nothing for siblings that share leading characters", () => {
        // Arrange
        const policy = policyWith([
            { name: "one", prefixes: ["packages/core/src/lib"] },
            { name: "two", prefixes: ["packages/core/src/library"] },
        ]);

        // Act
        const nested = findNestedPrefixes(policy);

        // Assert
        expect(nested).toEqual([]);
    });
});

describe("findStalePrefixes", () => {
    it("should name each prefix that no file falls under", () => {
        // Arrange
        const policy = policyWith([
            {
                name: "layer",
                prefixes: ["packages/live", "packages/renamed-away"],
            },
            { name: "other", prefixes: ["packages/gone/index.ts"] },
        ]);
        const files = ["packages/live/src/a.ts"];

        // Act
        const stale = findStalePrefixes(files, policy);

        // Assert
        expect(stale).toEqual([
            { layer: "layer", prefix: "packages/renamed-away" },
            { layer: "other", prefix: "packages/gone/index.ts" },
        ]);
    });

    it("should name a prefix whose only near match is a sibling with a longer name", () => {
        // Arrange
        const policy = policyWith([
            { name: "lib", prefixes: ["packages/cli/src/lib"] },
        ]);
        const files = ["packages/cli/src/library/x.ts"];

        // Act
        const stale = findStalePrefixes(files, policy);

        // Assert
        expect(stale).toEqual([
            { layer: "lib", prefix: "packages/cli/src/lib" },
        ]);
    });

    it("should name nothing when each prefix has a file of its own", () => {
        // Arrange
        const policy = policyWith([
            {
                name: "layer",
                prefixes: ["packages/live", "packages/also-live"],
            },
        ]);

        // Act
        const stale = findStalePrefixes(
            ["packages/live/a.ts", "packages/also-live/b.ts"],
            policy,
        );

        // Assert
        expect(stale).toEqual([]);
    });
});
