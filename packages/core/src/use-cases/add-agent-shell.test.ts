import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { PackageManagerFile } from "../entities/copilot-setup.js";
import type { NpmrcGateway } from "../gateways/npmrc-gateway.js";
import { AGENT_SHELL_NPMRC_ENTRY, addAgentShell } from "./add-agent-shell.js";

const chance = new Chance();

function createMockNpmrcGateway(
    overrides: Partial<NpmrcGateway> = {},
): NpmrcGateway {
    return {
        readNpmrc: overrides.readNpmrc ?? (() => Promise.resolve(null)),
        writeNpmrc: overrides.writeNpmrc ?? (() => Promise.resolve(undefined)),
    };
}

function createNpmPackageManager(
    overrides: Partial<PackageManagerFile> = {},
): PackageManagerFile {
    return {
        type: "npm",
        filename: "package.json",
        lockfile: "package-lock.json",
        ...overrides,
    };
}

describe("addAgentShell", () => {
    describe("when .npmrc does not exist", () => {
        it("should create .npmrc with the agent-shell entry and return wasAdded true", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const writeNpmrc = vi.fn().mockResolvedValue(undefined);
            const gateway = createMockNpmrcGateway({
                readNpmrc: () => Promise.resolve(null),
                writeNpmrc,
            });

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: createNpmPackageManager() },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: true,
                alreadyConfigured: false,
            });
            expect(writeNpmrc).toHaveBeenCalledWith(
                targetDir,
                `${AGENT_SHELL_NPMRC_ENTRY}\n`,
            );
        });
    });

    describe("when .npmrc exists without a script-shell entry", () => {
        it("should append the agent-shell entry and return wasAdded true", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const existingContent = `audit=true\naudit-level=moderate\n`;
            const writeNpmrc = vi.fn().mockResolvedValue(undefined);
            const gateway = createMockNpmrcGateway({
                readNpmrc: () => Promise.resolve(existingContent),
                writeNpmrc,
            });

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: createNpmPackageManager() },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: true,
                alreadyConfigured: false,
            });
            expect(writeNpmrc).toHaveBeenCalledWith(
                targetDir,
                `${existingContent}${AGENT_SHELL_NPMRC_ENTRY}\n`,
            );
        });
    });

    describe("when .npmrc already contains a script-shell entry", () => {
        it("should not modify the file and return alreadyConfigured true", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const existingContent = `audit=true\nscript-shell=agent-shell\n`;
            const writeNpmrc = vi.fn();
            const gateway = createMockNpmrcGateway({
                readNpmrc: () => Promise.resolve(existingContent),
                writeNpmrc,
            });

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: createNpmPackageManager() },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: false,
                alreadyConfigured: true,
            });
            expect(writeNpmrc).not.toHaveBeenCalled();
        });
    });

    describe("when .npmrc contains a different script-shell entry", () => {
        it("should not modify the file and return alreadyConfigured true", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const existingContent = `script-shell=/bin/bash\n`;
            const writeNpmrc = vi.fn();
            const gateway = createMockNpmrcGateway({
                readNpmrc: () => Promise.resolve(existingContent),
                writeNpmrc,
            });

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: createNpmPackageManager() },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: false,
                alreadyConfigured: true,
            });
            expect(writeNpmrc).not.toHaveBeenCalled();
        });
    });

    describe("when .npmrc contains a script-shell entry with whitespace around the equals sign", () => {
        it("should not modify the file and return alreadyConfigured true", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const existingContent = `script-shell = /bin/bash\n`;
            const writeNpmrc = vi.fn();
            const gateway = createMockNpmrcGateway({
                readNpmrc: () => Promise.resolve(existingContent),
                writeNpmrc,
            });

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: createNpmPackageManager() },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: false,
                alreadyConfigured: true,
            });
            expect(writeNpmrc).not.toHaveBeenCalled();
        });
    });

    describe("when .npmrc contains a commented-out script-shell entry", () => {
        it("should add the entry and return wasAdded true", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const existingContent = `# script-shell=agent-shell\n`;
            const writeNpmrc = vi.fn().mockResolvedValue(undefined);
            const gateway = createMockNpmrcGateway({
                readNpmrc: () => Promise.resolve(existingContent),
                writeNpmrc,
            });

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: createNpmPackageManager() },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: true,
                alreadyConfigured: false,
            });
            expect(writeNpmrc).toHaveBeenCalledWith(
                targetDir,
                `${existingContent}${AGENT_SHELL_NPMRC_ENTRY}\n`,
            );
        });
    });

    describe("when package manager is not npm", () => {
        it("should return wasAdded false without modifying .npmrc", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const readNpmrc = vi.fn();
            const writeNpmrc = vi.fn();
            const gateway = createMockNpmrcGateway({
                readNpmrc,
                writeNpmrc,
            });
            const yarnPackageManager: PackageManagerFile = {
                type: "yarn",
                filename: "package.json",
                lockfile: "yarn.lock",
            };

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: yarnPackageManager },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: false,
                alreadyConfigured: false,
            });
            expect(readNpmrc).not.toHaveBeenCalled();
            expect(writeNpmrc).not.toHaveBeenCalled();
        });
    });

    describe("when .npmrc exists without a trailing newline", () => {
        it("should insert a newline before appending the agent-shell entry", async () => {
            // Arrange
            const targetDir = `/tmp/${chance.guid()}`;
            const existingContent = "audit=true";
            const writeNpmrc = vi.fn().mockResolvedValue(undefined);
            const gateway = createMockNpmrcGateway({
                readNpmrc: () => Promise.resolve(existingContent),
                writeNpmrc,
            });

            // Act
            const result = await addAgentShell(
                { targetDir, packageManager: createNpmPackageManager() },
                gateway,
            );

            // Assert
            expect(result).toEqual({
                wasAdded: true,
                alreadyConfigured: false,
            });
            expect(writeNpmrc).toHaveBeenCalledWith(
                targetDir,
                `${existingContent}\n${AGENT_SHELL_NPMRC_ENTRY}\n`,
            );
        });
    });
});
