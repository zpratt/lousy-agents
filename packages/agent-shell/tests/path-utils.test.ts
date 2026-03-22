import { describe, expect, it } from "vitest";
import { isWithinProjectRoot } from "../src/path-utils.js";

describe("isWithinProjectRoot", () => {
    describe("given a path that is the project root itself", () => {
        it("should return true", () => {
            expect(isWithinProjectRoot("/project", "/project")).toBe(true);
        });
    });

    describe("given a path inside the project root", () => {
        it("should return true", () => {
            expect(
                isWithinProjectRoot("/project/custom-logs", "/project"),
            ).toBe(true);
        });
    });

    describe("given a deeply nested path inside the project root", () => {
        it("should return true", () => {
            expect(isWithinProjectRoot("/project/a/b/c/logs", "/project")).toBe(
                true,
            );
        });
    });

    describe("given a path that starts with the root prefix but escapes it", () => {
        it("should return false", () => {
            expect(isWithinProjectRoot("/project-evil/logs", "/project")).toBe(
                false,
            );
        });
    });

    describe("given an absolute path outside the project root", () => {
        it("should return false", () => {
            expect(isWithinProjectRoot("/tmp/evil", "/project")).toBe(false);
        });
    });

    describe("given a path that traverses above the project root", () => {
        it("should return false", () => {
            expect(isWithinProjectRoot("/escape", "/project")).toBe(false);
        });
    });

    describe("given a project root with a trailing slash", () => {
        it("should return true for a child path", () => {
            expect(isWithinProjectRoot("/project/logs", "/project/")).toBe(
                true,
            );
        });
    });

    describe("given a resolved path with a trailing slash matching the project root", () => {
        it("should return true", () => {
            expect(isWithinProjectRoot("/project/", "/project")).toBe(true);
        });
    });

    describe("given a directory name starting with dots that is not traversal", () => {
        it("should return true", () => {
            expect(isWithinProjectRoot("/project/..foo/bar", "/project")).toBe(
                true,
            );
        });
    });
});
