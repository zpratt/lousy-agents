import { describe, expect, it } from "vitest";
import { findImportTokens } from "./import-tokens.js";

function looksLikePath(target: string): boolean | undefined {
    return findImportTokens(`@${target}\n`)[0]?.looksLikePath;
}

describe("findImportTokens path shape", () => {
    describe("when the target starts with a path prefix", () => {
        it.each([
            ["a current-directory prefix", "./notes"],
            ["a parent-directory prefix", "../LICENSE"],
            ["an absolute prefix", "/abs/Makefile"],
            ["a home prefix", "~/notes"],
        ])(
            "should treat a target with %s and no extension as a path: %s",
            (_name, target) => {
                expect(looksLikePath(target)).toBe(true);
            },
        );
    });

    describe("when the last segment has a file extension", () => {
        it.each([
            ["a lowercase extension", "AGENTS.md"],
            ["an uppercase extension", "a.MD"],
            ["an extension with digits", "v.mp4"],
            ["a digits-only extension", "archive.7z"],
            ["an extension below a plain directory", "docs/guide.md"],
        ])("should treat %s as a path: %s", (_name, target) => {
            expect(looksLikePath(target)).toBe(true);
        });
    });

    describe("when nothing marks the target as a path", () => {
        it.each([
            ["a bare word", "no-such-thing"],
            ["a scoped package name", "types/node"],
            ["a dot in a directory name only", "docs.v2/readme"],
            ["a trailing dot", "notes."],
            ["a dot followed by a non-alphanumeric character", "a.-b"],
            ["an extension followed by more characters", "a.b-c"],
            ["a prefix that is only part of the target", "x./y"],
            ["a tilde that is not a home prefix", "~user"],
        ])("should not treat %s as a path: %s", (_name, target) => {
            expect(looksLikePath(target)).toBe(false);
        });
    });
});
