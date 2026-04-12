import { describe, expect, it } from "vitest";
import {
    isPathNotFoundError,
    isWithinProjectRoot,
} from "../src/lib/path-utils.js";

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

describe("isPathNotFoundError", () => {
    describe("given an ENOENT error", () => {
        it("should return true", () => {
            const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
            expect(isPathNotFoundError(err)).toBe(true);
        });
    });

    describe("given an ENOTDIR error", () => {
        it("should return true", () => {
            const err = Object.assign(new Error("ENOTDIR"), {
                code: "ENOTDIR",
            });
            expect(isPathNotFoundError(err)).toBe(true);
        });
    });

    describe("given an EACCES error", () => {
        it("should return false", () => {
            const err = Object.assign(new Error("EACCES"), {
                code: "EACCES",
            });
            expect(isPathNotFoundError(err)).toBe(false);
        });
    });

    describe("given a non-object error", () => {
        it("should return false for a string", () => {
            expect(isPathNotFoundError("ENOENT")).toBe(false);
        });

        it("should return false for null", () => {
            expect(isPathNotFoundError(null)).toBe(false);
        });
    });

    describe("given an object without a code property", () => {
        it("should return false", () => {
            expect(isPathNotFoundError(new Error("some error"))).toBe(false);
        });
    });
});
