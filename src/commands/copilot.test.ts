import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copilotCommand } from "./copilot.js";

const chance = new Chance();

describe("Copilot command", () => {
    describe("when no version files or workflows exist", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should create a minimal Copilot Setup Steps workflow", async () => {
            // Arrange
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            await expect(access(workflowPath)).resolves.toBeUndefined();
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain('name: "Copilot Setup Steps"');
            expect(content).toContain("actions/checkout@");
        });

        it("should return created action in result", async () => {
            // Arrange - done in beforeEach

            // Act
            const result = await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result).toBeDefined();
            expect(result.action).toBe("created");
        });
    });

    describe("when version files are present", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should include setup-node when .nvmrc is present", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-node@");
            expect(content).toContain("node-version-file: '.nvmrc'");
        });

        it("should include setup-python when .python-version is present", async () => {
            // Arrange
            await writeFile(join(testDir, ".python-version"), "3.12.0");

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-python@");
            expect(content).toContain("python-version-file: '.python-version'");
        });

        it("should include mise-action with github_token when mise.toml is present", async () => {
            // Arrange
            await writeFile(
                join(testDir, "mise.toml"),
                "[tools]\nnode = '20'\n",
            );

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("jdx/mise-action@");
            expect(content).toContain("github_token: $" + "{{ github.token }}");
        });

        it("should include multiple setup actions when multiple version files are present", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");
            await writeFile(join(testDir, ".python-version"), "3.12.0");

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-node@");
            expect(content).toContain("actions/setup-python@");
        });
    });

    describe("when existing workflows have setup actions", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should detect and include setup actions from existing CI workflow", async () => {
            // Arrange
            const ciWorkflow = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: temurin
`;
            await writeFile(
                join(testDir, ".github", "workflows", "ci.yml"),
                ciWorkflow,
            );

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("actions/setup-java@");
        });
    });

    describe("when Copilot Setup Steps workflow already exists", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should return unchanged when workflow is up to date", async () => {
            // Arrange
            const existingWorkflow = `
name: Copilot Setup Steps
on: push
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
`;
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");

            // Act
            const result = await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result.action).toBe("unchanged");
        });

        it("should update workflow when missing setup steps are detected", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on: push
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify development environment
        run: |
          echo "Ready"
`;
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");

            // Act
            const result = await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result.action).toBe("updated");
            const content = await readFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                "utf-8",
            );
            expect(content).toContain("actions/setup-node@");
        });

        it("should preserve existing workflow content when updating", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on:
  workflow_dispatch:
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify development environment
        run: |
          echo "Ready"
`;
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".python-version"), "3.12.0");

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const content = await readFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                "utf-8",
            );
            expect(content).toContain("workflow_dispatch:");
            expect(content).toContain("actions/checkout@v4");
        });
    });

    describe("when using --dry flag", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should not create workflow file in dry run mode", async () => {
            // Arrange
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );

            // Act
            await copilotCommand.run({
                rawArgs: ["--dry"],
                args: { _: [], dry: true },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            await expect(access(workflowPath)).rejects.toThrow();
        });

        it("should return created action without writing file", async () => {
            // Arrange - done in beforeEach

            // Act
            const result = await copilotCommand.run({
                rawArgs: ["--dry"],
                args: { _: [], dry: true },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result.action).toBe("created");
        });

        it("should not modify existing workflow in dry run mode", async () => {
            // Arrange
            const existingWorkflow = `---
name: Copilot Setup Steps
on: push
jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify development environment
        run: |
          echo "Ready"
`;
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
            await writeFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                existingWorkflow,
            );
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");

            // Act
            const result = await copilotCommand.run({
                rawArgs: ["--dry"],
                args: { _: [], dry: true },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result.action).toBe("updated");
            const content = await readFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                "utf-8",
            );
            expect(content).toBe(existingWorkflow);
        });
    });

    describe("analysis results", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should include analysis in result", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");

            // Act
            const result = await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result.analysis).toBeDefined();
            expect(result.analysis.versionFileCandidates).toHaveLength(1);
            expect(result.analysis.versionFileCandidates[0].file).toBe(
                ".nvmrc",
            );
        });

        it("should include path in result", async () => {
            // Arrange
            const expectedPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );

            // Act
            const result = await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result.path).toBe(expectedPath);
        });

        it("should include missing steps in result", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");
            await writeFile(join(testDir, ".python-version"), "3.12.0");

            // Act
            const result = await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            expect(result.missingSteps).toHaveLength(2);
            const actions = result.missingSteps.map((s) => s.action);
            expect(actions).toContain("actions/setup-node");
            expect(actions).toContain("actions/setup-python");
        });
    });

    describe("workflow content generation", () => {
        let testDir: string;

        beforeEach(async () => {
            testDir = join(tmpdir(), `test-${chance.guid()}`);
            await mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await rm(testDir, { recursive: true, force: true });
        });

        it("should use pinned action versions with SHA and version comment", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            // Check for SHA-pinned checkout action
            expect(content).toMatch(/actions\/checkout@[a-f0-9]{40}/);
            // Check for version comment
            expect(content).toMatch(/# v\d+\.\d+\.\d+/);
        });

        it("should include verification step", async () => {
            // Arrange
            await writeFile(join(testDir, ".nvmrc"), "20.10.0");

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("Verify development environment");
            expect(content).toContain("node --version");
        });

        it("should set appropriate permissions for workflow", async () => {
            // Arrange - done in beforeEach

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("permissions:");
            expect(content).toContain("contents: read");
        });

        it("should set timeout for workflow job", async () => {
            // Arrange - done in beforeEach

            // Act
            await copilotCommand.run({
                rawArgs: [],
                args: { _: [], dry: false },
                cmd: copilotCommand,
                data: { targetDir: testDir },
            });

            // Assert
            const workflowPath = join(
                testDir,
                ".github",
                "workflows",
                "copilot-setup-steps.yml",
            );
            const content = await readFile(workflowPath, "utf-8");
            expect(content).toContain("timeout-minutes: 30");
        });
    });
});
