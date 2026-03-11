import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNpmrcGateway, FileSystemNpmrcGateway } from "./npmrc-gateway.js";

const chance = new Chance();

describe("NpmrcGateway", () => {
    let testDir: string;
    let gateway: FileSystemNpmrcGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-npmrc-gateway-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemNpmrcGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("readNpmrc", () => {
        describe("when .npmrc does not exist", () => {
            it("should return null", async () => {
                // Act
                const result = await gateway.readNpmrc(testDir);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe("when .npmrc exists", () => {
            it("should return the file content", async () => {
                // Arrange
                const content = `audit=true\naudit-level=moderate\n`;
                await writeFile(join(testDir, ".npmrc"), content);

                // Act
                const result = await gateway.readNpmrc(testDir);

                // Assert
                expect(result).toBe(content);
            });
        });
    });

    describe("writeNpmrc", () => {
        describe("when .npmrc does not exist", () => {
            it("should create the file with the given content", async () => {
                // Arrange
                const content = `script-shell=./node_modules/.bin/agent-shell\n`;

                // Act
                await gateway.writeNpmrc(testDir, content);

                // Assert
                const result = await gateway.readNpmrc(testDir);
                expect(result).toBe(content);
            });
        });

        describe("when .npmrc already exists", () => {
            it("should overwrite the file with the given content", async () => {
                // Arrange
                const originalContent = `audit=true\n`;
                await writeFile(join(testDir, ".npmrc"), originalContent);
                const updatedContent = `audit=true\nscript-shell=./node_modules/.bin/agent-shell\n`;

                // Act
                await gateway.writeNpmrc(testDir, updatedContent);

                // Assert
                const result = await gateway.readNpmrc(testDir);
                expect(result).toBe(updatedContent);
            });
        });
    });

    describe("createNpmrcGateway", () => {
        it("should return an NpmrcGateway instance", () => {
            // Act
            const result = createNpmrcGateway();

            // Assert
            expect(result).toBeDefined();
            expect(typeof result.readNpmrc).toBe("function");
            expect(typeof result.writeNpmrc).toBe("function");
        });
    });
});
