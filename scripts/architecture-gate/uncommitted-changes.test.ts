import Chance from "chance";
import { describe, expect, it } from "vitest";
import {
    describeUncommittedChanges,
    parseUncommittedPaths,
} from "./uncommitted-changes.js";

const chance = new Chance();

function statusEntries(...entries: string[]): string {
    return entries.map((entry) => `${entry}\0`).join("");
}

describe("parseUncommittedPaths", () => {
    it("should return nothing when the status is empty", () => {
        // Act
        const paths = parseUncommittedPaths("");

        // Assert
        expect(paths).toEqual([]);
    });

    it.each([
        ["a modified file", " M"],
        ["a staged file", "M "],
        ["an added file", "A "],
        ["a deleted file", " D"],
        ["an untracked file", "??"],
    ])("should return the path of %s", (_label, code) => {
        // Arrange
        const path = `packages/${chance.word()}/src/${chance.word()}.ts`;

        // Act
        const paths = parseUncommittedPaths(statusEntries(`${code} ${path}`));

        // Assert
        expect(paths).toEqual([path]);
    });

    it("should return every path in the order git lists them", () => {
        // Arrange
        const first = "packages/a/src/first.ts";
        const second = "packages/b/src/second.ts";

        // Act
        const paths = parseUncommittedPaths(
            statusEntries(` M ${first}`, `?? ${second}`),
        );

        // Assert
        expect(paths).toEqual([first, second]);
    });

    it("should count a rename once, by its new path, and not read the old path as a change", () => {
        // Arrange
        const renamedTo = "packages/a/src/new-name.ts";
        const renamedFrom = "packages/a/src/old-name.ts";
        const other = "packages/b/src/other.ts";

        // Act
        const paths = parseUncommittedPaths(
            statusEntries(`R  ${renamedTo}`, renamedFrom, ` M ${other}`),
        );

        // Assert
        expect(paths).toEqual([renamedTo, other]);
    });

    it("should count a rename in the working tree once too", () => {
        // Arrange
        const renamedTo = "packages/a/src/new-name.ts";
        const renamedFrom = "packages/a/src/old-name.ts";
        const other = "packages/b/src/other.ts";

        // Act
        const paths = parseUncommittedPaths(
            statusEntries(` R ${renamedTo}`, renamedFrom, `?? ${other}`),
        );

        // Assert
        expect(paths).toEqual([renamedTo, other]);
    });

    it("should not mistake a path containing R or C for a rename", () => {
        // Arrange
        const first = "packages/Renderer/src/Cache.ts";
        const second = "packages/b/src/Copy.ts";

        // Act
        const paths = parseUncommittedPaths(
            statusEntries(` M ${first}`, `?? ${second}`),
        );

        // Assert
        expect(paths).toEqual([first, second]);
    });

    it("should count a copy once, by its new path", () => {
        // Arrange
        const copiedTo = "packages/a/src/copy.ts";
        const copiedFrom = "packages/a/src/original.ts";
        const other = "packages/b/src/other.ts";

        // Act
        const paths = parseUncommittedPaths(
            statusEntries(`C  ${copiedTo}`, copiedFrom, ` M ${other}`),
        );

        // Assert
        expect(paths).toEqual([copiedTo, other]);
    });

    it("should keep spaces and non-ASCII characters in a path", () => {
        // Arrange
        const path = "packages/a/src/my file ünï.ts";

        // Act
        const paths = parseUncommittedPaths(statusEntries(` M ${path}`));

        // Assert
        expect(paths).toEqual([path]);
    });
});

describe("describeUncommittedChanges", () => {
    it("should say nothing when there are no uncommitted changes", () => {
        // Act
        const notice = describeUncommittedChanges([]);

        // Assert
        expect(notice).toBeNull();
    });

    it("should say coach analyzed HEAD only and name the one change", () => {
        // Arrange
        const path = `packages/${chance.word()}/src/x.ts`;

        // Act
        const notice = describeUncommittedChanges([path]);

        // Assert
        expect(notice).toBe(
            `architecture gate: coach analyzed the committed HEAD only; 1 uncommitted change under packages/ was not checked (${path}). Commit it to include it, or run \`mise run coach-worktree\` to scan it first.`,
        );
    });

    it("should name several changes and pluralise", () => {
        // Arrange
        const paths = ["packages/a/x.ts", "packages/b/y.ts"];

        // Act
        const notice = describeUncommittedChanges(paths);

        // Assert
        expect(notice).toBe(
            "architecture gate: coach analyzed the committed HEAD only; 2 uncommitted changes under packages/ were not checked (packages/a/x.ts, packages/b/y.ts). Commit them to include them, or run `mise run coach-worktree` to scan them first.",
        );
    });

    it("should name exactly five changes without a remainder", () => {
        // Arrange
        const paths = Array.from(
            { length: 5 },
            (_, index) => `packages/p/file-${index}.ts`,
        );

        // Act
        const notice = describeUncommittedChanges(paths);

        // Assert
        expect(notice).toContain("5 uncommitted changes");
        expect(notice).toContain(
            "(packages/p/file-0.ts, packages/p/file-1.ts, packages/p/file-2.ts, packages/p/file-3.ts, packages/p/file-4.ts)",
        );
        expect(notice).not.toContain("more");
    });

    it("should count one change beyond five as one more", () => {
        // Arrange
        const paths = Array.from(
            { length: 6 },
            (_, index) => `packages/p/file-${index}.ts`,
        );

        // Act
        const notice = describeUncommittedChanges(paths);

        // Assert
        expect(notice).toContain("6 uncommitted changes");
        expect(notice).toContain("file-4.ts, and 1 more)");
    });

    it("should name the first five changes and count the rest", () => {
        // Arrange
        const paths = Array.from(
            { length: 8 },
            (_, index) => `packages/p/file-${index}.ts`,
        );

        // Act
        const notice = describeUncommittedChanges(paths);

        // Assert
        expect(notice).toContain("8 uncommitted changes");
        expect(notice).toContain(
            "(packages/p/file-0.ts, packages/p/file-1.ts, packages/p/file-2.ts, packages/p/file-3.ts, packages/p/file-4.ts, and 3 more)",
        );
        expect(notice).not.toContain("file-5.ts");
    });
});
