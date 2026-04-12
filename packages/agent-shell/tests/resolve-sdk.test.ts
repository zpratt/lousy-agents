import {
    mkdir,
    mkdtemp,
    realpath,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSdkPath } from "../src/gateways/resolve-sdk.js";

describe("resolveSdkPath", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await realpath(await mkdtemp(join(tmpdir(), "sdk-resolve-")));
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("given an empty repoRoot", () => {
        it("returns null without resolving from CWD", () => {
            const result = resolveSdkPath("", "@github/copilot-sdk");

            expect(result).toBeNull();
        });
    });

    describe("given a project directory without the package installed", () => {
        it("returns null", () => {
            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            expect(result).toBeNull();
        });
    });

    describe("given a project directory with the package installed", () => {
        it("resolves the ESM entry from conditional exports, not the CJS entry", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            const cjsDir = join(distDir, "cjs");
            await mkdir(cjsDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    type: "module",
                    main: "./dist/cjs/index.js",
                    exports: {
                        ".": {
                            import: {
                                types: "./dist/index.d.ts",
                                default: "./dist/index.js",
                            },
                            require: {
                                types: "./dist/index.d.ts",
                                default: "./dist/cjs/index.js",
                            },
                        },
                    },
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class CopilotClient {}",
            );
            await writeFile(
                join(cjsDir, "index.js"),
                "module.exports = { CopilotClient: class {} };",
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("resolves string-form exports (non-conditional)", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            await mkdir(distDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "./dist/legacy.js",
                    exports: "./dist/index.js",
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class CopilotClient {}",
            );
            await writeFile(join(distDir, "legacy.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("resolves string-valued exports['.'] entry", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            await mkdir(distDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "./dist/legacy.js",
                    exports: { ".": "./dist/index.js" },
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class CopilotClient {}",
            );
            await writeFile(join(distDir, "legacy.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("resolves string-valued import entry in conditional exports", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            const cjsDir = join(distDir, "cjs");
            await mkdir(cjsDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    exports: {
                        ".": {
                            import: "./dist/esm/index.js",
                            require: "./dist/cjs/index.js",
                        },
                    },
                }),
            );
            const esmDir = join(distDir, "esm");
            await mkdir(esmDir, { recursive: true });
            await writeFile(
                join(esmDir, "index.js"),
                "export class CopilotClient {}",
            );
            await writeFile(
                join(cjsDir, "index.js"),
                "module.exports = { CopilotClient: class {} };",
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "esm", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("falls back to index.js when neither exports nor main exists", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            await mkdir(sdkDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                }),
            );
            await writeFile(join(sdkDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(join(sdkDir, "index.js")).href;
            expect(result).toBe(expectedUrl);
        });

        it("falls back to main when exports has no import condition", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const libDir = join(sdkDir, "lib");
            await mkdir(libDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "lib/index.js",
                    exports: {
                        ".": {
                            require: "./lib/index.js",
                        },
                    },
                }),
            );
            await writeFile(join(libDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "lib", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("falls back to main when import entry has no default key", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const libDir = join(sdkDir, "lib");
            await mkdir(libDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "lib/index.js",
                    exports: {
                        ".": {
                            import: { types: "./dist/index.d.ts" },
                            require: "./lib/index.js",
                        },
                    },
                }),
            );
            await writeFile(join(libDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "lib", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("falls back to index.js when main is empty string", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            await mkdir(sdkDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "",
                }),
            );
            await writeFile(join(sdkDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(join(sdkDir, "index.js")).href;
            expect(result).toBe(expectedUrl);
        });

        it("falls back to main when exports is null", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const libDir = join(sdkDir, "lib");
            await mkdir(libDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "lib/index.js",
                    exports: null,
                }),
            );
            await writeFile(join(libDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "lib", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("falls back to main when exports import is array-form", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const libDir = join(sdkDir, "lib");
            await mkdir(libDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "lib/index.js",
                    exports: {
                        ".": {
                            import: ["./dist/a.js", "./dist/b.js"],
                            require: "./lib/index.js",
                        },
                    },
                }),
            );
            await writeFile(join(libDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "lib", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("resolves ESM entry from sugar-form exports with condition keys", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            const cjsDir = join(distDir, "cjs");
            await mkdir(cjsDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "./dist/cjs/index.js",
                    exports: {
                        import: "./dist/index.js",
                        require: "./dist/cjs/index.js",
                    },
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class CopilotClient {}",
            );
            await writeFile(
                join(cjsDir, "index.js"),
                "module.exports = { CopilotClient: class {} };",
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("resolves ESM entry from sugar-form exports with nested import.default", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            const cjsDir = join(distDir, "cjs");
            await mkdir(cjsDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "./dist/cjs/index.js",
                    exports: {
                        import: {
                            types: "./dist/index.d.ts",
                            default: "./dist/index.js",
                        },
                        require: {
                            types: "./dist/index.d.ts",
                            default: "./dist/cjs/index.js",
                        },
                    },
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class CopilotClient {}",
            );
            await writeFile(
                join(cjsDir, "index.js"),
                "module.exports = { CopilotClient: class {} };",
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });

        it("falls back to main when exports map is absent", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const libDir = join(sdkDir, "lib");
            await mkdir(libDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "lib/index.js",
                }),
            );
            await writeFile(join(libDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "lib", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });
    });

    describe("given a non-existent project directory", () => {
        it("returns null", () => {
            const result = resolveSdkPath(
                "/non/existent/path",
                "@github/copilot-sdk",
            );

            expect(result).toBeNull();
        });
    });

    describe("given a package where the ESM entry file does not exist", () => {
        it("falls back to the CJS-resolved entry", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const cjsDir = join(sdkDir, "dist", "cjs");
            await mkdir(cjsDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    main: "./dist/cjs/index.js",
                    exports: {
                        ".": {
                            import: { default: "./dist/index.js" },
                            require: { default: "./dist/cjs/index.js" },
                        },
                    },
                }),
            );
            await writeFile(
                join(cjsDir, "index.js"),
                "module.exports = { CopilotClient: class {} };",
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "cjs", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });
    });

    describe("given a different package name", () => {
        it("resolves the specified package", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@anthropic",
                "claude-sdk",
            );
            const distDir = join(sdkDir, "dist");
            const cjsDir = join(distDir, "cjs");
            await mkdir(cjsDir, { recursive: true });
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@anthropic/claude-sdk",
                    main: "./dist/cjs/index.js",
                    exports: {
                        ".": {
                            import: { default: "./dist/index.js" },
                            require: "./dist/cjs/index.js",
                        },
                    },
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class ClaudeClient {}",
            );
            await writeFile(join(cjsDir, "index.js"), "module.exports = {};");

            const result = resolveSdkPath(tempDir, "@anthropic/claude-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });
    });

    describe("given an ESM entry that is a symlink", () => {
        it("resolves through the symlink to the real path", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            const libDir = join(sdkDir, "lib");
            const realDir = join(tempDir, "real-sdk");
            await mkdir(distDir, { recursive: true });
            await mkdir(libDir, { recursive: true });
            await mkdir(realDir, { recursive: true });
            const realFile = join(realDir, "index.js");
            await writeFile(realFile, "export class CopilotClient {}");
            await symlink(realFile, join(distDir, "index.js"));
            await writeFile(join(libDir, "index.js"), "module.exports = {};");
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    exports: {
                        ".": {
                            import: { default: "./dist/index.js" },
                            require: "./lib/index.js",
                        },
                    },
                }),
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(realFile).href;
            expect(result).toBe(expectedUrl);
        });
    });

    describe("given a malformed package.json at an intermediate directory", () => {
        it("walks past the invalid file and resolves from the real package root", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            await mkdir(distDir, { recursive: true });
            await writeFile(join(distDir, "package.json"), "not valid json");
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    exports: "./dist/index.js",
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class CopilotClient {}",
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });
    });

    describe("given a valid package.json with a different name at an intermediate directory", () => {
        it("walks past the name-mismatched file and resolves from the real package root", async () => {
            const sdkDir = join(
                tempDir,
                "node_modules",
                "@github",
                "copilot-sdk",
            );
            const distDir = join(sdkDir, "dist");
            await mkdir(distDir, { recursive: true });
            await writeFile(
                join(distDir, "package.json"),
                JSON.stringify({
                    name: "wrong-package",
                    exports: "./wrong.js",
                }),
            );
            await writeFile(
                join(sdkDir, "package.json"),
                JSON.stringify({
                    name: "@github/copilot-sdk",
                    exports: "./dist/index.js",
                }),
            );
            await writeFile(
                join(distDir, "index.js"),
                "export class CopilotClient {}",
            );

            const result = resolveSdkPath(tempDir, "@github/copilot-sdk");

            const expectedUrl = pathToFileURL(
                join(sdkDir, "dist", "index.js"),
            ).href;
            expect(result).toBe(expectedUrl);
        });
    });

    describe("given a relative repoRoot", () => {
        it("returns null for a dot-relative path", () => {
            const result = resolveSdkPath(".", "@github/copilot-sdk");

            expect(result).toBeNull();
        });

        it("returns null for a bare relative path", () => {
            const result = resolveSdkPath(
                "relative/path",
                "@github/copilot-sdk",
            );

            expect(result).toBeNull();
        });
    });

    describe("given a path-traversal packageName", () => {
        it("returns null for dot-dot traversal", () => {
            const result = resolveSdkPath(tempDir, "../../etc/passwd");

            expect(result).toBeNull();
        });

        it("returns null for a dot-relative package name", () => {
            const result = resolveSdkPath(tempDir, "./local-file");

            expect(result).toBeNull();
        });

        it("returns null for an absolute path as package name", () => {
            const result = resolveSdkPath(tempDir, "/etc/passwd");

            expect(result).toBeNull();
        });
    });
});
