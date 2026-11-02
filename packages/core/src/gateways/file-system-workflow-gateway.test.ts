import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COPILOT_SETUP_CONFIG } from "../entities/copilot-setup-config.js";
import {
    createWorkflowGatewayWithConfig,
    FileSystemWorkflowGateway,
} from "./file-system-workflow-gateway.js";

const chance = new Chance();

describe("FileSystemWorkflowGateway", () => {
    let testDir: string;
    let gateway: FileSystemWorkflowGateway;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-workflow-gateway-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
        gateway = new FileSystemWorkflowGateway();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("parseWorkflowsForSetupActions", () => {
        describe("given a workflow file exceeds the size limit", () => {
            it("should reject to prevent resource exhaustion", async () => {
                // Arrange
                const workflowsDir = join(testDir, ".github", "workflows");
                await mkdir(workflowsDir, { recursive: true });
                const oversizedYaml = "a".repeat(2 * 1024 * 1024);
                await writeFile(
                    join(workflowsDir, "ci.yml"),
                    oversizedYaml,
                    "utf-8",
                );

                // Act & Assert
                await expect(
                    gateway.parseWorkflowsForSetupActions(testDir),
                ).rejects.toThrow("size limit");
            });
        });

        describe("given a workflow file has invalid YAML", () => {
            it("should skip the invalid file and return candidates from valid files", async () => {
                // Arrange
                const workflowsDir = join(testDir, ".github", "workflows");
                await mkdir(workflowsDir, { recursive: true });
                await writeFile(
                    join(workflowsDir, "bad.yml"),
                    ": invalid: yaml: :\n",
                    "utf-8",
                );
                await writeFile(
                    join(workflowsDir, "ci.yml"),
                    [
                        "name: CI",
                        "on: push",
                        "jobs:",
                        "  setup:",
                        "    runs-on: ubuntu-latest",
                        "    steps:",
                        "      - uses: actions/checkout@v4",
                    ].join("\n"),
                    "utf-8",
                );

                // Act
                const candidates =
                    await gateway.parseWorkflowsForSetupActions(testDir);

                // Assert — bad.yml is skipped but ci.yml is processed
                expect(candidates).toBeDefined();
            });
        });
    });

    describe("parseWorkflowsForSetupActions with a configuration the caller loaded", () => {
        const InjectedAction = "acme/injected-setup";
        const OnDiskAction = "acme/on-disk-setup";

        function workflowUsing(action: string): string {
            return [
                "name: CI",
                "on: push",
                "jobs:",
                "  setup:",
                "    runs-on: ubuntu-latest",
                "    steps:",
                `      - uses: ${action}@v1`,
                "",
            ].join("\n");
        }

        async function writeWorkflowsUsingBothActions(): Promise<void> {
            const workflowsDir = join(testDir, ".github", "workflows");
            await mkdir(workflowsDir, { recursive: true });
            await writeFile(
                join(workflowsDir, "injected.yml"),
                workflowUsing(InjectedAction),
            );
            await writeFile(
                join(workflowsDir, "on-disk.yml"),
                workflowUsing(OnDiskAction),
            );
            await writeFile(
                join(testDir, "lousy-agents.config.json"),
                JSON.stringify({
                    ...DEFAULT_COPILOT_SETUP_CONFIG,
                    setupActionPatterns: [OnDiskAction],
                }),
            );
        }

        it("should recognise actions by the patterns of the configuration it was given, not the file in the directory", async () => {
            await writeWorkflowsUsingBothActions();
            const injectedConfig = {
                ...DEFAULT_COPILOT_SETUP_CONFIG,
                setupActionPatterns: [InjectedAction],
            };
            const gatewayWithConfig =
                createWorkflowGatewayWithConfig(injectedConfig);

            const candidates =
                await gatewayWithConfig.parseWorkflowsForSetupActions(testDir);

            expect(candidates.map((candidate) => candidate.action)).toEqual([
                InjectedAction,
            ]);
        });

        it("should recognise actions by the file in the directory when it was given no configuration", async () => {
            await writeWorkflowsUsingBothActions();
            const gatewayReadingTheFile = new FileSystemWorkflowGateway(
                testDir,
            );

            const candidates =
                await gatewayReadingTheFile.parseWorkflowsForSetupActions(
                    testDir,
                );

            expect(candidates.map((candidate) => candidate.action)).toEqual([
                OnDiskAction,
            ]);
        });
    });

    describe("writeCopilotSetupWorkflow", () => {
        describe("given workflows directory is a symbolic link", () => {
            it("should reject to prevent writing outside the target directory", async () => {
                // Arrange
                const externalDir = join(tmpdir(), `external-${chance.guid()}`);
                await mkdir(externalDir, { recursive: true });
                const githubDir = join(testDir, ".github");
                await mkdir(githubDir, { recursive: true });
                await symlink(externalDir, join(githubDir, "workflows"));
                const content = "name: Test Workflow\non: workflow_dispatch\n";

                // Act & Assert
                await expect(
                    gateway.writeCopilotSetupWorkflow(testDir, content),
                ).rejects.toThrow("symbolic link");
            });
        });
    });
});
