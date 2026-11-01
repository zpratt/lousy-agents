import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { referenceDirectiveLines } from "./production-source-references.js";

const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
);

const SOURCE_UNDER_PACKAGE = /^packages\/[^/]+\/src\/.+\.tsx?$/;

function trackedSourceFiles(): string[] {
    const listing = execFileSync("git", ["ls-files", "-z"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    return listing
        .split("\0")
        .filter((path) => SOURCE_UNDER_PACKAGE.test(path));
}

describe("referenceDirectiveLines", () => {
    it.each([
        ["a path reference", '/// <reference path="./x.ts" />'],
        ["a path reference in capitals", '/// <REFERENCE PATH="./x.ts" />'],
        ["a path reference in mixed case", '/// <Reference Path="./x.ts" />'],
        ["a types reference", '/// <reference types="node" />'],
        ["a lib reference", '/// <reference lib="es2022" />'],
        [
            "a path reference after a block comment",
            '/* a */ /// <reference path="x" />',
        ],
        [
            "the closing line of a multi-line block comment, then the directive",
            '*/ /// <reference path="x" />',
        ],
        [
            "another attribute before path",
            '/// <reference no-default-lib="false" path="x" />',
        ],
        ["no space after the slashes", '///<reference path="x" />'],
        ["leading indentation", '    /// <reference path="x" />'],
        [
            "a string that holds the tag, which is accepted noise",
            'const s = "<reference";',
        ],
        [
            "a longer tag name, which is accepted noise",
            '/// <referenced path="x" />',
        ],
    ])("should flag %s", (_what, line) => {
        // Arrange
        const content = ["// header", "const a = 1;", line, ""].join("\n");

        // Act
        const found = referenceDirectiveLines(content);

        // Assert
        expect(found).toEqual([3]);
    });

    it("should flag every such line, numbered from 1", () => {
        // Arrange
        const content = [
            '/// <reference path="./a.ts" />',
            "const x = 1;",
            '/// <reference types="node" />',
        ].join("\n");

        // Act
        const found = referenceDirectiveLines(content);

        // Assert
        expect(found).toEqual([1, 3]);
    });

    it.each([
        ["a comment that mentions the word", "// see the reference docs"],
        ["a variable named reference", "const reference = 1;"],
        ["a closing tag with no opening one", "reference>"],
        [
            "a different word that starts the same way",
            'const s = "<referencing";',
        ],
        ["an empty file", ""],
    ])("should not flag %s", (_what, content) => {
        // Act
        const found = referenceDirectiveLines(content);

        // Assert
        expect(found).toEqual([]);
    });
});

describe("the tracked source files under packages/*/src", () => {
    // This reads the working tree and coach reads the committed HEAD. In CI
    // they are the same files.
    it("should include no triple-slash reference directive, which coach does not count as an import", () => {
        // Arrange
        const found = trackedSourceFiles()
            .filter((path) => existsSync(resolve(repositoryRoot, path)))
            .flatMap((path) =>
                referenceDirectiveLines(
                    readFileSync(resolve(repositoryRoot, path), "utf8"),
                ).map(
                    (line) =>
                        `${path}:${line} has a triple-slash reference directive: triple-slash reference directives are not allowed in production source, because coach 0.11.0 does not count them`,
                ),
            );

        // Assert
        expect(found).toEqual([]);
    });
});
