import { parse, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type EdgeResolutionContext, resolveEdge } from "./edge-resolution.js";

const FILESYSTEM_ROOT = parse(process.cwd()).root;
const REPO_ROOT = resolve(FILESYSTEM_ROOT, "work", "repo");
const SIBLING_DIRECTORY = "repo-evil";

function contextFor(
    repoRoot: string,
    existing: readonly string[],
): EdgeResolutionContext {
    return {
        repoRoot,
        rootReal: repoRoot,
        existingAbsPaths: new Set(existing),
    };
}

describe("resolveEdge for a soft reference", () => {
    describe("when the repository root is the root of the file system", () => {
        it("should resolve a reference to a file under it as well formed", async () => {
            const target = resolve(FILESYSTEM_ROOT, "docs", "guide.md");

            const edge = await resolveEdge(
                { type: "soft-reference", rawTarget: "docs/guide.md" },
                resolve(FILESYSTEM_ROOT, "AGENTS.md"),
                "AGENTS.md",
                contextFor(FILESYSTEM_ROOT, [target]),
            );

            expect(edge).toEqual({
                type: "soft-reference",
                direction: { from: "AGENTS.md", to: "docs/guide.md" },
                target: "docs/guide.md",
                malformed: false,
            });
        });
    });

    describe("when the reference leaves the repository", () => {
        it.each([
            ["a parent directory", "../outside.md"],
            [
                "a sibling directory whose name starts like the root's",
                `../${SIBLING_DIRECTORY}/note.md`,
            ],
        ])("should report a path traversal for %s", async (_, rawTarget) => {
            const edge = await resolveEdge(
                { type: "soft-reference", rawTarget },
                resolve(REPO_ROOT, "AGENTS.md"),
                "AGENTS.md",
                contextFor(REPO_ROOT, []),
            );

            expect(edge).toMatchObject({
                malformed: true,
                reason: "path-traversal",
                target: rawTarget,
            });
        });
    });

    describe("when the reference points at the repository root itself", () => {
        it("should not report a path traversal", async () => {
            const edge = await resolveEdge(
                { type: "soft-reference", rawTarget: "." },
                resolve(REPO_ROOT, "AGENTS.md"),
                "AGENTS.md",
                contextFor(REPO_ROOT, []),
            );

            expect(edge).toMatchObject({
                malformed: true,
                reason: "missing-target",
            });
        });
    });
});
