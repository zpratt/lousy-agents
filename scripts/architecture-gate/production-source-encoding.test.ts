import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isProductionSourceFile } from "./production-files.js";
import { encodingProblem } from "./production-source-encoding.js";

const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
);

const UTF16_LITTLE_ENDIAN_MARK = [0xff, 0xfe];
const UTF16_BIG_ENDIAN_MARK = [0xfe, 0xff];
const UTF8_MARK = [0xef, 0xbb, 0xbf];

function trackedProductionFiles(): string[] {
    const listing = execFileSync("git", ["ls-files", "-z"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    return listing.split("\0").filter(isProductionSourceFile);
}

const SOURCE =
    'import type { A } from "../gateways/a.js";\nexport type B = A;\n';

function bytes(...parts: ReadonlyArray<ArrayLike<number>>): Buffer {
    return Buffer.concat(parts.map((part) => Buffer.from(Array.from(part))));
}

describe("encodingProblem", () => {
    describe("when a file is UTF-16", () => {
        it.each([
            [
                "little-endian",
                bytes(UTF16_LITTLE_ENDIAN_MARK, Buffer.from(SOURCE, "utf16le")),
            ],
            [
                "big-endian",
                bytes(UTF16_BIG_ENDIAN_MARK, [0x00, 0x69, 0x00, 0x6d]),
            ],
            ["with nothing after the mark", bytes(UTF16_LITTLE_ENDIAN_MARK)],
        ])("should say that coach cannot read it, %s", (_which, content) => {
            // Act
            const problem = encodingProblem(content);

            // Assert
            expect(problem).toContain("UTF-16");
            expect(problem).toContain("coach does not read");
            expect(problem).toContain("lousy-agents/coach#585");
        });
    });

    describe("when a file starts with a UTF-8 byte-order mark", () => {
        it.each([
            ["before source", bytes(UTF8_MARK, Buffer.from(SOURCE, "utf8"))],
            ["with nothing after it", bytes(UTF8_MARK)],
        ])(
            "should say that it is rejected for uniformity, %s",
            (_which, content) => {
                // Act
                const problem = encodingProblem(content);

                // Assert
                expect(problem).toContain("UTF-8 byte-order mark");
                expect(problem).toContain("rejected for uniformity");
                expect(problem).not.toContain("coach does not read");
            },
        );
    });

    describe("when a file is not valid UTF-8", () => {
        it.each([
            ["a stray 0xff byte", bytes(Buffer.from("const a = "), [0xff])],
            ["a cut-off multi-byte character", bytes([0xe2, 0x82])],
            ["a lone continuation byte", bytes(Buffer.from("a"), [0x80])],
            ["an overlong encoding", bytes([0xc0, 0xaf])],
        ])("should report %s", (_which, content) => {
            // Act
            const problem = encodingProblem(content);

            // Assert
            expect(problem).toContain("not valid UTF-8");
        });
    });

    describe("when a file is plain UTF-8", () => {
        it.each([
            ["ASCII source", Buffer.from(SOURCE, "utf8")],
            ["an empty file", Buffer.alloc(0)],
            ["accented letters", Buffer.from('const é = "ü";\n', "utf8")],
            ["CJK text", Buffer.from('const s = "日本語";\n', "utf8")],
            ["an emoji", Buffer.from('const s = "😀";\n', "utf8")],
            [
                "a byte-order-mark character that is not first",
                Buffer.from('const s = "a﻿b";\n', "utf8"),
            ],
        ])("should accept %s", (_which, content) => {
            // Act
            const problem = encodingProblem(content);

            // Assert
            expect(problem).toBeUndefined();
        });
    });
});

describe("the tracked production source files", () => {
    const files = trackedProductionFiles();

    it("should have files to check", () => {
        // Assert
        expect(files.length).toBeGreaterThan(0);
    });

    // This reads the working tree and coach reads the committed HEAD. In CI
    // they are the same files.
    it("should all be UTF-8 without a byte-order mark, so coach reads every import", () => {
        // Arrange
        const problems = files
            .filter((path) => existsSync(resolve(repositoryRoot, path)))
            .flatMap((path) => {
                const problem = encodingProblem(
                    readFileSync(resolve(repositoryRoot, path)),
                );
                return problem === undefined ? [] : [`${path} ${problem}`];
            });

        // Assert
        expect(problems).toEqual([]);
    });
});
