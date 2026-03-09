import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemEnvironmentGateway } from "./environment-gateway.js";

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
});
