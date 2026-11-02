import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COPILOT_SETUP_CONFIG } from "../entities/copilot-setup-config.js";
import {
    createEnvironmentGatewayWithConfig,
    FileSystemEnvironmentGateway,
} from "./environment-gateway.js";

const chance = new Chance();

describe("EnvironmentGateway", () => {
    let testDir: string;
    let gateway: FileSystemEnvironmentGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-environment-gateway-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemEnvironmentGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("detectEnvironment", () => {
        describe("given a version file is too large", () => {
            it("should reject to prevent memory exhaustion from unbounded reads", async () => {
                // Arrange
                const oversizedVersion = "v".repeat(20 * 1024);
                await writeFile(
                    join(testDir, ".nvmrc"),
                    oversizedVersion,
                    "utf-8",
                );

                // Act & Assert
                await expect(
                    gateway.detectEnvironment(testDir),
                ).rejects.toThrow("size limit");
            });
        });

        describe("given a version file path is a symbolic link", () => {
            it("should reject to prevent symlink-based file exfiltration", async () => {
                // Arrange
                const externalDir = join(tmpdir(), `external-${chance.guid()}`);
                await mkdir(externalDir, { recursive: true });
                const externalFile = join(externalDir, ".nvmrc");
                await writeFile(externalFile, "22.0.0", "utf-8");
                await symlink(externalFile, join(testDir, ".nvmrc"));

                // Act & Assert
                await expect(
                    gateway.detectEnvironment(testDir),
                ).rejects.toThrow("symbolic link");
            });
        });
    });

    describe("createEnvironmentGatewayWithConfig", () => {
        const CustomFile = ".customver";

        it("should detect with the configuration it was given, not the one in the directory it inspects", async () => {
            await writeFile(join(testDir, CustomFile), "22");
            await writeFile(join(testDir, ".nvmrc"), "20");
            await writeFile(
                join(testDir, "lousy-agents.config.json"),
                JSON.stringify({
                    versionFiles: [{ filename: ".nvmrc", type: "node" }],
                }),
            );
            const given = {
                ...DEFAULT_COPILOT_SETUP_CONFIG,
                versionFiles: [{ filename: CustomFile, type: "node" as const }],
            };

            const environment =
                await createEnvironmentGatewayWithConfig(
                    given,
                ).detectEnvironment(testDir);

            expect(environment.versionFiles.map((f) => f.filename)).toEqual([
                CustomFile,
            ]);
        });

        it("should keep using the configuration it was given when the file changes afterwards", async () => {
            await writeFile(join(testDir, CustomFile), "22");
            const given = {
                ...DEFAULT_COPILOT_SETUP_CONFIG,
                versionFiles: [{ filename: CustomFile, type: "node" as const }],
            };
            const gatewayWithConfig = createEnvironmentGatewayWithConfig(given);
            await gatewayWithConfig.detectEnvironment(testDir);
            await writeFile(
                join(testDir, "lousy-agents.config.json"),
                JSON.stringify({ versionFiles: [] }),
            );

            const environment =
                await gatewayWithConfig.detectEnvironment(testDir);

            expect(environment.versionFiles.map((f) => f.filename)).toEqual([
                CustomFile,
            ]);
        });
    });
});
