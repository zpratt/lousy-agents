/**
 * Integration tests for the bundled CLI init command.
 *
 * These tests verify that template file resolution works correctly
 * in the rspack-bundled output by simulating the npm publish + npx flow:
 * 1. Build with rspack (prerequisite)
 * 2. npm pack to create a publishable tarball
 * 3. Unpack the tarball to an isolated temporary directory
 * 4. Run the CLI from the unpacked location
 *
 * This catches the original bug where rspack hardcoded import.meta.url
 * to the build machine's absolute path, which fails on any other machine.
 *
 * NOTE: These tests require the project to be built first (`npm run build`).
 * They will be skipped if the dist/index.js file doesn't exist.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const chance = new Chance();

const projectRoot = process.cwd();
const distPath = join(projectRoot, "dist", "index.js");
const distExists = existsSync(distPath);

describe.skipIf(!distExists)("Bundled CLI init template resolution", () => {
    let packDir: string;
    let unpackedCliPath: string;

    beforeAll(async () => {
        // npm pack to a temp location
        packDir = join(tmpdir(), `pack-test-${chance.guid()}`);
        mkdirSync(packDir, { recursive: true });
        execSync(`npm pack --pack-destination ${packDir}`, {
            cwd: projectRoot,
            stdio: "pipe",
        });

        // Find the tarball
        const tgzFiles = execSync(`ls ${packDir}/*.tgz`, { encoding: "utf-8" })
            .trim()
            .split("\n");
        const tgzPath = tgzFiles[0];

        // Unpack to simulate npx cache: node_modules/@lousy-agents/cli/
        const installDir = join(
            packDir,
            "install",
            "node_modules",
            "@lousy-agents",
            "cli",
        );
        mkdirSync(installDir, { recursive: true });
        execSync(`tar xzf ${tgzPath} --strip-components=1 -C ${installDir}`, {
            stdio: "pipe",
        });

        unpackedCliPath = join(installDir, "dist", "index.js");
    });

    afterAll(async () => {
        if (packDir) {
            await rm(packDir, { recursive: true, force: true });
        }
    });

    describe("given a packed and unpacked CLI (simulating npx)", () => {
        it("should not contain hardcoded build-machine paths in the bundle", async () => {
            // Arrange
            const bundleContent = readFileSync(unpackedCliPath, "utf-8");

            // The original bug: rspack rewrites import.meta.url to a hardcoded
            // string like 'file:///home/runner/work/.../src/lib/config.ts'
            // With importMeta: false, it should use import.meta.url directly.
            const hardcodedPathPattern = /fileURLToPath\(\s*['"]file:\/\/\//;

            // Assert
            expect(bundleContent).not.toMatch(hardcodedPathPattern);
        });

        it("should scaffold a CLI project from the unpacked package", async () => {
            // Arrange
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            const outputDir = join(packDir, `output-cli-${chance.guid()}`);
            mkdirSync(outputDir, { recursive: true });

            // Act
            execFileSync(
                "node",
                [
                    unpackedCliPath,
                    "init",
                    "--kind",
                    "cli",
                    "--name",
                    projectName,
                ],
                { cwd: outputDir, stdio: "pipe" },
            );

            // Assert
            const packageJson = await readFile(
                join(outputDir, "package.json"),
                "utf-8",
            );
            expect(packageJson).toContain(projectName);
            expect(packageJson).toContain("citty");
            expect(existsSync(join(outputDir, "tsconfig.json"))).toBe(true);
            expect(
                existsSync(
                    join(outputDir, ".github", "copilot-instructions.md"),
                ),
            ).toBe(true);
        });

        it("should scaffold a webapp project from the unpacked package", async () => {
            // Arrange
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            const outputDir = join(packDir, `output-webapp-${chance.guid()}`);
            mkdirSync(outputDir, { recursive: true });

            // Act
            execFileSync(
                "node",
                [
                    unpackedCliPath,
                    "init",
                    "--kind",
                    "webapp",
                    "--name",
                    projectName,
                ],
                { cwd: outputDir, stdio: "pipe" },
            );

            // Assert
            const packageJson = await readFile(
                join(outputDir, "package.json"),
                "utf-8",
            );
            expect(packageJson).toContain(projectName);
            expect(packageJson).toContain("next");
            expect(existsSync(join(outputDir, "tsconfig.json"))).toBe(true);
        });

        it("should scaffold an API project from the unpacked package", async () => {
            // Arrange
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            const outputDir = join(packDir, `output-api-${chance.guid()}`);
            mkdirSync(outputDir, { recursive: true });

            // Act
            execFileSync(
                "node",
                [
                    unpackedCliPath,
                    "init",
                    "--kind",
                    "api",
                    "--name",
                    projectName,
                ],
                { cwd: outputDir, stdio: "pipe" },
            );

            // Assert
            const packageJson = await readFile(
                join(outputDir, "package.json"),
                "utf-8",
            );
            expect(packageJson).toContain(projectName);
            expect(packageJson).toContain("fastify");
            expect(existsSync(join(outputDir, "tsconfig.json"))).toBe(true);
        });
    });
});
