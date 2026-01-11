import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { copilotSetupCommand } from "./copilot-setup.js";

const chance = new Chance();

describe("Copilot Setup command", () => {
    let testDir: string;
    let workflowsDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-copilot-setup-${chance.guid()}`);
        workflowsDir = join(testDir, ".github", "workflows");
        await mkdir(workflowsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when creating a new workflow", () => {
        it("should create copilot-setup-steps.yml when it does not exist", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            expect(parsed.name).toBe("Copilot Setup Steps");
        });

        it("should include checkout step as first step", async () => {
            // Arrange - empty repo

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps[0].uses).toContain("actions/checkout");
        });

        it("should include setup-node when .nvmrc is detected", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-node"),
                ),
            ).toBe(true);
        });

        it("should include mise-action when mise.toml is detected", async () => {
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
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("jdx/mise-action"),
                ),
            ).toBe(true);
        });

        it("should prioritize mise-action over individual setup actions when mise.toml exists", async () => {
            // Arrange
            await writeFile(join(testDir, "mise.toml"), '[tools]\nnode = "20"');
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;

            // Should have mise-action but not setup-node
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("jdx/mise-action"),
                ),
            ).toBe(true);
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-node"),
                ),
            ).toBe(false);
        });

        it("should include setup actions detected in existing workflows", async () => {
            // Arrange
            const ciWorkflow = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
`;
            await writeFile(join(workflowsDir, "ci.yml"), ciWorkflow);

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-python"),
                ),
            ).toBe(true);
        });
    });

    describe("when updating an existing workflow", () => {
        it("should append missing setup steps to existing workflow", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch: null
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
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps).toHaveLength(2);
            expect(
                steps.some((s: { uses: string }) =>
                    s.uses.includes("actions/setup-node"),
                ),
            ).toBe(true);
        });

        it("should not duplicate existing setup steps", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            const nodeSteps = steps.filter((s: { uses: string }) =>
                s.uses.includes("actions/setup-node"),
            );
            expect(nodeSteps).toHaveLength(1);
        });

        it("should preserve existing workflow configuration", async () => {
            // Arrange
            const existingWorkflow = `---
name: My Custom Copilot Setup
on:
  workflow_dispatch: null
jobs:
  copilot-setup-steps:
    runs-on: self-hosted
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
`;
            await writeFile(
                join(workflowsDir, "copilot-setup-steps.yml"),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.0.0");

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            expect(parsed.name).toBe("My Custom Copilot Setup");
            expect(parsed.jobs["copilot-setup-steps"]["runs-on"]).toBe(
                "self-hosted",
            );
            expect(parsed.jobs["copilot-setup-steps"]["timeout-minutes"]).toBe(
                60,
            );
        });
    });

    describe("when no configuration is detected", () => {
        it("should create minimal workflow with only checkout step", async () => {
            // Arrange - empty repo (no version files)

            // Act
            await copilotSetupCommand.run({
                rawArgs: [],
                args: { _: [] },
                cmd: copilotSetupCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
            const content = await readFile(workflowPath, "utf-8");
            const parsed = parseYaml(content);
            const steps = parsed.jobs["copilot-setup-steps"].steps;
            expect(steps).toHaveLength(1);
            expect(steps[0].uses).toContain("actions/checkout");
        });
    });

    describe("when workflows directory does not exist", () => {
        it("should create workflows directory and workflow file", async () => {
            // Arrange
            const emptyDir = join(tmpdir(), `empty-${chance.guid()}`);
            await mkdir(emptyDir, { recursive: true });
            await writeFile(join(emptyDir, ".nvmrc"), "20.0.0");

            try {
                // Act
                await copilotSetupCommand.run({
                    rawArgs: [],
                    args: { _: [] },
                    cmd: copilotSetupCommand,
                    data: { targetDir: emptyDir },
                });

                // Assert
                const workflowPath = join(
                    emptyDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                );
                const content = await readFile(workflowPath, "utf-8");
                expect(content).toContain("Copilot Setup Steps");
            } finally {
                await rm(emptyDir, { recursive: true, force: true });
            }
        });
    });
});
