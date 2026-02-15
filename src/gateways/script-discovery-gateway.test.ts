import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemScriptDiscoveryGateway } from "./script-discovery-gateway.js";

const chance = new Chance();

describe("FileSystemScriptDiscoveryGateway", () => {
    let gateway: FileSystemScriptDiscoveryGateway;
    let testDir: string;

    beforeEach(async () => {
        gateway = new FileSystemScriptDiscoveryGateway();
        testDir = join("/tmp", `test-script-discovery-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when package.json does not exist", () => {
        it("should return empty array", async () => {
            const result = await gateway.discoverScripts(testDir);
            expect(result).toEqual([]);
        });
    });

    describe("when package.json has no scripts", () => {
        it("should return empty array", async () => {
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify({ name: "test-package" }),
            );

            const result = await gateway.discoverScripts(testDir);
            expect(result).toEqual([]);
        });
    });

    describe("when package.json has scripts", () => {
        it("should discover all scripts with correct phases", async () => {
            const packageJson = {
                name: "test-package",
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                    lint: "biome check .",
                    "lint:fix": "biome check --write .",
                    dev: "tsx src/index.ts",
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson),
            );

            const result = await gateway.discoverScripts(testDir);

            expect(result).toHaveLength(5);
            expect(result).toContainEqual({
                name: "test",
                command: "vitest run",
                phase: "test",
                isMandatory: true,
            });
            expect(result).toContainEqual({
                name: "build",
                command: "rspack build",
                phase: "build",
                isMandatory: true,
            });
            expect(result).toContainEqual({
                name: "lint",
                command: "biome check .",
                phase: "lint",
                isMandatory: true,
            });
            expect(result).toContainEqual({
                name: "lint:fix",
                command: "biome check --write .",
                phase: "lint",
                isMandatory: true,
            });
            expect(result).toContainEqual({
                name: "dev",
                command: "tsx src/index.ts",
                phase: "dev",
                isMandatory: false,
            });
        });

        it("should identify mandatory scripts correctly", async () => {
            const packageJson = {
                scripts: {
                    test: "vitest run",
                    build: "rspack build",
                    lint: "biome check",
                    format: "prettier --write",
                    deploy: "npm publish",
                    dev: "tsx src/index.ts",
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson),
            );

            const result = await gateway.discoverScripts(testDir);

            const mandatory = result.filter((s) => s.isMandatory);
            const nonMandatory = result.filter((s) => !s.isMandatory);

            expect(mandatory).toHaveLength(4);
            expect(mandatory.map((s) => s.name)).toEqual([
                "test",
                "build",
                "lint",
                "format",
            ]);

            expect(nonMandatory).toHaveLength(2);
            expect(nonMandatory.map((s) => s.name)).toEqual(["deploy", "dev"]);
        });
    });

    describe("when script command contains phase hints", () => {
        it("should infer phase from command content", async () => {
            const packageJson = {
                scripts: {
                    validate: "vitest run && biome check",
                    bundle: "webpack --mode production",
                    check: "jest --coverage",
                },
            };

            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify(packageJson),
            );

            const result = await gateway.discoverScripts(testDir);

            expect(result).toContainEqual({
                name: "validate",
                command: "vitest run && biome check",
                phase: "test",
                isMandatory: true,
            });
            expect(result).toContainEqual({
                name: "bundle",
                command: "webpack --mode production",
                phase: "build",
                isMandatory: true,
            });
            expect(result).toContainEqual({
                name: "check",
                command: "jest --coverage",
                phase: "test",
                isMandatory: true,
            });
        });
    });
});
