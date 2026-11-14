import { describe, expect, it } from "vitest";
import {
    isFixtureDirectory,
    isSkippedDiscoveryDirectory,
} from "./agentic-discovery-skips.js";

const rootName = "repo";

describe("isFixtureDirectory", () => {
    describe("when the directory is a fixture layout", () => {
        it.each([
            "tests/fixtures",
            ".github/instructions/tests/fixtures",
            "pkg/__fixtures__",
            "a/b/testdata",
        ])("should skip %s", (relativePath) => {
            expect(isFixtureDirectory(relativePath, rootName)).toBe(true);
        });

        it("should skip fixtures when the scan root is named tests", () => {
            expect(isFixtureDirectory("fixtures", "tests")).toBe(true);
        });
    });

    describe("when the directory is not a fixture layout", () => {
        it.each(["src/fixtures", "fixtures", "tests/unit/fixtures"])(
            "should keep %s",
            (relativePath) => {
                expect(isFixtureDirectory(relativePath, rootName)).toBe(false);
            },
        );
    });
});

describe("isSkippedDiscoveryDirectory", () => {
    describe("when the directory is build output or a dependency tree", () => {
        it.each([
            ".github/instructions/dist",
            ".github/skills/dist",
            "node_modules",
            ".git",
        ])("should skip %s", (relativePath) => {
            expect(isSkippedDiscoveryDirectory(relativePath, rootName)).toBe(
                true,
            );
        });
    });

    describe("when the directory is a fixture", () => {
        it("should skip testdata under agents", () => {
            expect(
                isSkippedDiscoveryDirectory(
                    ".github/agents/testdata",
                    rootName,
                ),
            ).toBe(true);
        });
    });
});
