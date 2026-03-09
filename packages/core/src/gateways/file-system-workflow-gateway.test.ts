import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemWorkflowGateway } from "./file-system-workflow-gateway.js";

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
