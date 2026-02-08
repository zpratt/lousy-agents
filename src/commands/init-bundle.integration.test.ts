/**
 * Integration tests for the bundled CLI init command.
 *
 * NOTE: These tests require the project to be built first (`npm run build`).
 * They will be skipped if the dist/index.js file doesn't exist.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
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
        packDir = join(tmpdir(), `pack-test-${chance.guid()}`);
        mkdirSync(packDir, { recursive: true });
        execFileSync("npm", ["pack", "--pack-destination", packDir], {
            cwd: projectRoot,
            stdio: "pipe",
        });

        const tgzFiles = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
        if (tgzFiles.length === 0) {
            throw new Error(`No .tgz files found in ${packDir}`);
        }
        const tgzPath = join(packDir, tgzFiles[0]);

        const installDir = join(
            packDir,
            "install",
            "node_modules",
            "@lousy-agents",
            "cli",
        );
        mkdirSync(installDir, { recursive: true });
        execFileSync(
            "tar",
            ["xzf", tgzPath, "--strip-components=1", "-C", installDir],
            { stdio: "pipe" },
        );

        unpackedCliPath = join(installDir, "dist", "index.js");
    });

    afterAll(async () => {
        if (packDir) {
            await rm(packDir, { recursive: true, force: true });
        }
    });

    describe("given a packed and unpacked CLI (simulating npx)", () => {
        it("should not contain hardcoded build-machine paths in the bundle", () => {
            const bundleContent = readFileSync(unpackedCliPath, "utf-8");
            const hardcodedPathPattern = /fileURLToPath\(\s*['"]file:\/\/\//;

            expect(bundleContent).not.toMatch(hardcodedPathPattern);
        });

        it("should scaffold a CLI project from the unpacked package", async () => {
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            const outputDir = join(packDir, `output-cli-${chance.guid()}`);
            mkdirSync(outputDir, { recursive: true });

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
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            const outputDir = join(packDir, `output-webapp-${chance.guid()}`);
            mkdirSync(outputDir, { recursive: true });

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

            const packageJson = await readFile(
                join(outputDir, "package.json"),
                "utf-8",
            );
            expect(packageJson).toContain(projectName);
            expect(packageJson).toContain("next");
            expect(existsSync(join(outputDir, "tsconfig.json"))).toBe(true);
        });

        it("should scaffold an API project from the unpacked package", async () => {
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            const outputDir = join(packDir, `output-api-${chance.guid()}`);
            mkdirSync(outputDir, { recursive: true });

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
