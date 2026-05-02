import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScriptDiscoveryGateway } from "../use-cases/discover-feedback-loops.js";
import {
    createFeedbackLoopCommandsGateway,
    FileSystemScriptDiscoveryGateway,
    MAX_PACKAGE_JSON_BYTES,
} from "./script-discovery-gateway.js";

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

    describe("when package.json contains malformed JSON", () => {
        it("should return empty array when JSON is malformed", async () => {
            // Write invalid JSON
            await writeFile(
                join(testDir, "package.json"),
                '{ "scripts": { "test": "vitest" } invalid json',
            );

            const result = await gateway.discoverScripts(testDir);

            expect(result).toEqual([]);
        });
    });

    describe("when package.json exceeds the size limit", () => {
        it("should propagate an error when file exceeds MAX_PACKAGE_JSON_BYTES", async () => {
            // Write a package.json that is just over the 1 MB limit
            const oversized = "x".repeat(MAX_PACKAGE_JSON_BYTES + 1);
            await writeFile(join(testDir, "package.json"), oversized);

            await expect(gateway.discoverScripts(testDir)).rejects.toThrow();
        });
    });

    describe("when package.json scripts field fails schema validation", () => {
        it("should return empty array when a script value is not a string", async () => {
            // Valid JSON but scripts values are not strings — schema rejects it
            await writeFile(
                join(testDir, "package.json"),
                JSON.stringify({
                    name: "test-package",
                    scripts: { test: 42 },
                }),
            );

            const result = await gateway.discoverScripts(testDir);

            expect(result).toEqual([]);
        });
    });
});

describe("createFeedbackLoopCommandsGateway", () => {
    it("filters to mandatory-only commands from the injected gateway", async () => {
        // Arrange
        const chance = new Chance();
        const mandatoryName = chance.word();
        const optionalName = chance.word();
        const stubGateway: ScriptDiscoveryGateway = {
            discoverScripts: vi.fn().mockResolvedValue([
                {
                    name: mandatoryName,
                    command: "vitest run",
                    phase: "test",
                    isMandatory: true,
                },
                {
                    name: optionalName,
                    command: "tsx src/index.ts",
                    phase: "dev",
                    isMandatory: false,
                },
            ]),
        };
        const gateway = createFeedbackLoopCommandsGateway(stubGateway);

        // Act
        const result = await gateway.getMandatoryCommands("/any/dir");

        // Assert
        expect(result).toEqual([mandatoryName]);
        expect(result).not.toContain(optionalName);
    });

    it("creates its own FileSystemScriptDiscoveryGateway when no gateway is provided", async () => {
        // Arrange — empty dir, so discoverScripts returns []
        const dir = join(
            "/tmp",
            `test-feedback-gateway-${new Chance().guid()}`,
        );
        await mkdir(dir, { recursive: true });
        const gateway = createFeedbackLoopCommandsGateway();

        try {
            // Act
            const result = await gateway.getMandatoryCommands(dir);

            // Assert
            expect(result).toEqual([]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
