import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COPILOT_SETUP_WORKFLOW_PATH } from "../lib/workflow-generator.js";
import { copilotSetupCommand } from "./copilot-setup.js";

const chance = new Chance();

describe("Copilot setup command", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-copilot-setup-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when detecting environment configuration", () => {
        it("should create workflow when mise.toml is present", async () => {
            // Arrange
            await writeFile(join(testDir, "mise.toml"), '[tools]\nnode = "20"');

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            await expect(access(workflowPath)).resolves.toBeUndefined();

            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("jdx/mise-action");
        });

        it("should create workflow with setup-node when .nvmrc is present", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.11.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-node");
            expect(content).toContain("node-version-file");
            expect(content).toContain(".nvmrc");
        });

        it("should create workflow with setup-python when .python-version is present", async () => {
            // Arrange
            await writeFile(join(testDir, ".python-version"), "3.12.1");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-python");
            expect(content).toContain("python-version-file");
        });

        it("should prioritize mise-action over individual setup actions", async () => {
            // Arrange
            await writeFile(join(testDir, "mise.toml"), '[tools]\nnode = "20"');
            await writeFile(join(testDir, ".nvmrc"), "20.11.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("jdx/mise-action");
            expect(content).not.toContain("actions/setup-node");
        });

        it("should create minimal workflow when no configuration files exist", async () => {
            // Arrange - empty directory

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/checkout");
            expect(content).toContain("Copilot Setup Steps");
        });
    });

    describe("when parsing existing workflows", () => {
        it("should incorporate setup actions from existing workflows", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });

            const existingWorkflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
`;
            await writeFile(join(workflowsDir, "ci.yml"), existingWorkflow);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-node");
        });

        it("should prefer workflow config over version file config", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "18");

            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });

            const existingWorkflow = `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
`;
            await writeFile(join(workflowsDir, "ci.yml"), existingWorkflow);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            // Should use node-version from workflow, not node-version-file from .nvmrc
            expect(content).toContain('node-version: "20"');
        });
    });

    describe("when creating new workflow", () => {
        it("should create .github/workflows directory if it does not exist", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20");
            const workflowsDir = join(testDir, ".github", "workflows");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            await expect(access(workflowsDir)).resolves.toBeUndefined();
        });

        it("should include checkout step as first step", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            // Checkout should appear before setup-node
            const checkoutIndex = content.indexOf("actions/checkout");
            const setupNodeIndex = content.indexOf("actions/setup-node");
            expect(checkoutIndex).toBeLessThan(setupNodeIndex);
        });

        it("should include workflow_dispatch and pull_request triggers", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("workflow_dispatch");
            expect(content).toContain("pull_request");
        });

        it("should include required permissions", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("contents: read");
            expect(content).toContain("id-token: write");
        });
    });

    describe("when updating existing workflow", () => {
        it("should add missing setup steps to existing workflow", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });

            const existingWorkflow = `
name: Copilot Setup Steps
on:
  workflow_dispatch: {}
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-node");
        });

        it("should not modify workflow when all steps already present", async () => {
            // Arrange
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });

            const existingWorkflow = `name: Copilot Setup Steps
on:
  workflow_dispatch: {}
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
`;
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            await writeFile(workflowPath, existingWorkflow);
            await writeFile(join(testDir, ".nvmrc"), "20");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const content = await readFile(workflowPath, "utf-8");
            // Content should be unchanged (same structure)
            expect(content).toContain("actions/setup-node@v4");
        });
    });

    describe("when handling multiple version files", () => {
        it("should create workflow with multiple setup actions", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20");
            await writeFile(join(testDir, ".python-version"), "3.12");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(testDir, COPILOT_SETUP_WORKFLOW_PATH);
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-node");
            expect(content).toContain("actions/setup-python");
        });
    });
});
