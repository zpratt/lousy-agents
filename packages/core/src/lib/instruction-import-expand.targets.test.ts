import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { relativeToAnyRoot } from "./import-file-location.js";
import {
    buildEffectiveDocument,
    normalizeRelativeWithinRoot,
} from "./instruction-import-expand.js";

describe("normalizeRelativeWithinRoot", () => {
    describe("when the target names the home directory", () => {
        it.each([
            ["the bare tilde", "~"],
            ["a tilde and a slash", "~/notes.md"],
            ["a tilde and a backslash", "~\\notes.md"],
        ])("should reject %s as a home target", (_name, rawTarget) => {
            expect(
                normalizeRelativeWithinRoot("CLAUDE.md", rawTarget, ["/repo"]),
            ).toEqual({ ok: false, status: "home" });
        });

        it("should treat a name that merely starts with a tilde as a relative path", () => {
            expect(
                normalizeRelativeWithinRoot("docs/CLAUDE.md", "~notes.md"),
            ).toEqual({ ok: true, relativePath: "docs/~notes.md" });
        });
    });

    describe("when the target leaves the repository", () => {
        it.each([
            ["a bare double dot", "CLAUDE.md", ".."],
            ["a double dot and a slash", "CLAUDE.md", "../notes.md"],
            ["a double dot and a backslash", "CLAUDE.md", "..\\notes.md"],
            ["steps that climb out", "docs/CLAUDE.md", "../../notes.md"],
            [
                "a path that climbs out after descending",
                "CLAUDE.md",
                "a/../../b.md",
            ],
        ])("should reject %s as an escape", (_name, importer, rawTarget) => {
            expect(normalizeRelativeWithinRoot(importer, rawTarget)).toEqual({
                ok: false,
                status: "escape",
            });
        });
    });

    describe("when the target is the importer's own directory", () => {
        it("should report it as unresolved", () => {
            expect(normalizeRelativeWithinRoot("CLAUDE.md", ".")).toEqual({
                ok: false,
                status: "unresolved",
            });
        });
    });

    describe("when the target stays inside the repository", () => {
        it.each([
            ["a sibling", "docs/CLAUDE.md", "guide.md", "docs/guide.md"],
            [
                "a parent directory file",
                "docs/CLAUDE.md",
                "../guide.md",
                "guide.md",
            ],
            ["a nested path", "CLAUDE.md", "a/b/c.md", "a/b/c.md"],
        ])(
            "should resolve %s relative to the importer",
            (_name, importer, rawTarget, expected) => {
                expect(
                    normalizeRelativeWithinRoot(importer, rawTarget),
                ).toEqual({
                    ok: true,
                    relativePath: expected,
                });
            },
        );
    });

    describe("when the target is an absolute path", () => {
        it.each([
            [
                "inside the only root",
                ["/repo"],
                "/repo/docs/guide.md",
                "docs/guide.md",
            ],
            [
                "inside the second spelling of the root",
                ["/link", "/repo"],
                "/repo/docs/guide.md",
                "docs/guide.md",
            ],
        ])("should accept a path %s", (_name, roots, rawTarget, expected) => {
            expect(
                normalizeRelativeWithinRoot("CLAUDE.md", rawTarget, roots),
            ).toEqual({ ok: true, relativePath: expected });
        });

        it.each([
            ["outside every root", ["/repo"], "/other/guide.md"],
            ["the root itself", ["/repo"], "/repo"],
            [
                "a sibling whose name starts with the root's name",
                ["/repo"],
                "/repo-evil/guide.md",
            ],
            ["any path when no root is given", [], "/repo/guide.md"],
        ])(
            "should reject a path that is %s as absolute",
            (_name, roots, rawTarget) => {
                expect(
                    normalizeRelativeWithinRoot("CLAUDE.md", rawTarget, roots),
                ).toEqual({ ok: false, status: "absolute" });
            },
        );
    });
});

describe("relativeToAnyRoot", () => {
    it("should return the path below the first root that contains the target", () => {
        expect(
            relativeToAnyRoot("/second/docs/a.md", ["/first", "/second"]),
        ).toEqual({ ok: true, relativePath: "docs/a.md" });
    });

    it.each([
        ["the root itself", "/repo"],
        ["the parent of the root", "/"],
        ["a sibling with a shared name prefix", "/repo-evil/a.md"],
    ])("should report %s as absolute", (_name, target) => {
        expect(relativeToAnyRoot(target, ["/repo"])).toEqual({
            ok: false,
            status: "absolute",
        });
    });
});

describe("buildEffectiveDocument root path", () => {
    let repoRoot: string;

    beforeEach(async () => {
        repoRoot = await mkdtemp(join(tmpdir(), "import-root-path-"));
    });

    afterEach(async () => {
        await rm(repoRoot, { recursive: true, force: true });
    });

    it.each([
        ["a bare double dot", ".."],
        ["a path that starts with a double dot", "../CLAUDE.md"],
        ["a path that climbs out after descending", "a/../../CLAUDE.md"],
        ["an absolute path", "/etc/CLAUDE.md"],
    ])(
        "should refuse %s as the root instruction file",
        async (_name, rootRelativePath) => {
            await expect(
                buildEffectiveDocument({ repoRoot, rootRelativePath }),
            ).rejects.toThrow(
                `Root path is outside repository root: ${rootRelativePath}`,
            );
        },
    );
});
