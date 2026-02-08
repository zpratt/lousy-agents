/**
 * Integration tests for the bundled CLI init command.
 *
 * These tests verify that template file resolution works correctly
 * in the rspack-bundled output, ensuring import.meta.url is not
 * rewritten and findPackageRoot() resolves the correct template directories.
 *
 * NOTE: These tests require the project to be built first (`npm run build`).
 * They will be skipped if the dist/index.js file doesn't exist.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, describe, expect, it } from "vitest";

const chance = new Chance();

const distPath = join(process.cwd(), "dist", "index.js");
const distExists = existsSync(distPath);

describe.skipIf(!distExists)("Bundled CLI init template resolution", () => {
    let testDir: string;

    afterEach(async () => {
        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    describe("given the bundled CLI", () => {
        it("should scaffold a CLI project with correct template files", async () => {
            // Arrange
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            testDir = join(tmpdir(), `bundle-cli-${chance.guid()}`);
            mkdirSync(testDir, { recursive: true });

            // Act
            execFileSync(
                "node",
                [distPath, "init", "--kind", "cli", "--name", projectName],
                { cwd: testDir, stdio: "pipe" },
            );

            // Assert
            const packageJson = await readFile(
                join(testDir, "package.json"),
                "utf-8",
            );
            expect(packageJson).toContain(projectName);
            expect(packageJson).toContain("citty");
            expect(existsSync(join(testDir, "tsconfig.json"))).toBe(true);
            expect(
                existsSync(join(testDir, ".github", "copilot-instructions.md")),
            ).toBe(true);
        });

        it("should scaffold a webapp project with correct template files", async () => {
            // Arrange
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            testDir = join(tmpdir(), `bundle-webapp-${chance.guid()}`);
            mkdirSync(testDir, { recursive: true });

            // Act
            execFileSync(
                "node",
                [distPath, "init", "--kind", "webapp", "--name", projectName],
                { cwd: testDir, stdio: "pipe" },
            );

            // Assert
            const packageJson = await readFile(
                join(testDir, "package.json"),
                "utf-8",
            );
            expect(packageJson).toContain(projectName);
            expect(packageJson).toContain("next");
            expect(existsSync(join(testDir, "tsconfig.json"))).toBe(true);
        });

        it("should scaffold an API project with correct template files", async () => {
            // Arrange
            const projectName = `test-${chance.word({ length: 6 }).toLowerCase()}`;
            testDir = join(tmpdir(), `bundle-api-${chance.guid()}`);
            mkdirSync(testDir, { recursive: true });

            // Act
            execFileSync(
                "node",
                [distPath, "init", "--kind", "api", "--name", projectName],
                { cwd: testDir, stdio: "pipe" },
            );

            // Assert
            const packageJson = await readFile(
                join(testDir, "package.json"),
                "utf-8",
            );
            expect(packageJson).toContain(projectName);
            expect(packageJson).toContain("fastify");
            expect(existsSync(join(testDir, "tsconfig.json"))).toBe(true);
        });
    });
});
