/**
 * Adversarial review tests for the MCP server.
 *
 * Each test in this file proves a defect found during a blind adversarial
 * review of packages/mcp. The tests fail on purpose until the defect is fixed.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import packageJson from "../package.json" with { type: "json" };
import {
    analyzeInstructionQualityHandler,
    createCopilotSetupWorkflowHandler,
    createMcpServer,
    discoverEnvironmentHandler,
    discoverWorkflowSetupActionsHandler,
    resolveActionVersionsHandler,
} from "./server.js";

const chance = new Chance();

const VERSION_PLACEHOLDER = "RESOLVE_VERSION";
const COPILOT_JOB_NAME = "copilot-setup-steps";

interface WorkflowStep {
    name?: string;
    uses?: string;
    run?: string;
}

interface ParsedWorkflow {
    jobs: Record<string, { steps: WorkflowStep[] }>;
}

function parseResult(
    result: Awaited<ReturnType<typeof discoverEnvironmentHandler>>,
): Record<string, unknown> {
    const textContent = result.content.find((c) => c.type === "text");
    if (!textContent) {
        throw new Error("No text content in response");
    }
    return JSON.parse(textContent.text) as Record<string, unknown>;
}

function randomSha(): string {
    return chance.string({ length: 40, pool: "0123456789abcdef" });
}

async function connectClient(): Promise<Client> {
    const server = createMcpServer();
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "adversarial-test", version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
}

describe("MCP Server adversarial review", () => {
    let testDir: string;
    let workflowsDir: string;
    let workflowPath: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `test-mcp-adversarial-${chance.guid()}`);
        workflowsDir = join(testDir, ".github", "workflows");
        workflowPath = join(workflowsDir, "copilot-setup-steps.yml");
        await mkdir(workflowsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("create_copilot_setup_workflow", () => {
        describe("when the tool is called again on a project with a package manager", () => {
            it("should not append a duplicate install step on each call", async () => {
                // Arrange
                await writeFile(
                    join(testDir, "package.json"),
                    JSON.stringify({ name: chance.word() }),
                );
                await writeFile(join(testDir, "package-lock.json"), "{}");
                await createCopilotSetupWorkflowHandler({ targetDir: testDir });

                // Act
                const secondResult = parseResult(
                    await createCopilotSetupWorkflowHandler({
                        targetDir: testDir,
                    }),
                );
                await createCopilotSetupWorkflowHandler({ targetDir: testDir });

                // Assert
                const workflow = parseYaml(
                    await readFile(workflowPath, "utf-8"),
                ) as ParsedWorkflow;
                const installSteps = workflow.jobs[
                    COPILOT_JOB_NAME
                ].steps.filter((step) => step.run === "npm ci");
                expect(secondResult.action).toBe("no_changes_needed");
                expect(installSteps).toHaveLength(1);
            });
        });

        describe("when the tool is called again with resolvedVersions for every action", () => {
            it("should replace the RESOLVE_VERSION placeholders in the existing workflow", async () => {
                // Arrange
                await writeFile(join(testDir, ".nvmrc"), "20");
                const firstResult = parseResult(
                    await createCopilotSetupWorkflowHandler({
                        targetDir: testDir,
                    }),
                );
                const actionsToResolve = firstResult.actionsToResolve as Array<{
                    action: string;
                }>;
                const resolvedVersions = actionsToResolve.map(({ action }) => ({
                    action,
                    sha: randomSha(),
                    versionTag: `v${chance.integer({ min: 1, max: 9 })}.0.0`,
                }));

                // Act
                await createCopilotSetupWorkflowHandler({
                    targetDir: testDir,
                    resolvedVersions,
                });

                // Assert
                const content = await readFile(workflowPath, "utf-8");
                expect(content).not.toContain(VERSION_PLACEHOLDER);
                for (const resolved of resolvedVersions) {
                    expect(content).toContain(
                        `${resolved.action}@${resolved.sha}`,
                    );
                }
            });
        });

        describe("when the existing workflow has another job before the copilot-setup-steps job", () => {
            it("should add missing steps to the copilot-setup-steps job", async () => {
                // Arrange
                const otherJobName = `prepare-${chance.word()}`;
                await writeFile(join(testDir, ".nvmrc"), "20");
                await writeFile(
                    workflowPath,
                    [
                        "name: Copilot Setup Steps",
                        "on: workflow_dispatch",
                        "jobs:",
                        `  ${otherJobName}:`,
                        "    runs-on: ubuntu-latest",
                        "    steps:",
                        "      - run: echo prepare",
                        `  ${COPILOT_JOB_NAME}:`,
                        "    runs-on: ubuntu-latest",
                        "    steps:",
                        "      - uses: actions/checkout@v4",
                        "",
                    ].join("\n"),
                );

                // Act
                await createCopilotSetupWorkflowHandler({ targetDir: testDir });

                // Assert
                const workflow = parseYaml(
                    await readFile(workflowPath, "utf-8"),
                ) as ParsedWorkflow;
                const copilotJobActions = workflow.jobs[COPILOT_JOB_NAME].steps
                    .map((step) => step.uses)
                    .filter(Boolean);
                const otherJobActions = workflow.jobs[otherJobName].steps
                    .map((step) => step.uses)
                    .filter(Boolean);
                expect(copilotJobActions).toContain(
                    `actions/setup-node@${VERSION_PLACEHOLDER}`,
                );
                expect(otherJobActions).toEqual([]);
            });
        });

        describe("when resolvedVersions contains a value that is not a commit SHA", () => {
            it("should reject the value instead of writing it as a pinned version", async () => {
                // Arrange
                const branchName = chance.word({ length: 8 });

                // Act
                const result = parseResult(
                    await createCopilotSetupWorkflowHandler({
                        targetDir: testDir,
                        resolvedVersions: [
                            {
                                action: "actions/checkout",
                                sha: branchName,
                                versionTag: "v4.0.0",
                            },
                        ],
                    }),
                );

                // Assert
                expect(result.success).toBe(false);
            });
        });
    });

    describe("environment detection", () => {
        describe("when the target directory has its own copilotSetup configuration", () => {
            it("should detect version files defined in that configuration", async () => {
                // Arrange
                const customVersionFile = `.${chance.word({ length: 10 })}`;
                await writeFile(
                    join(testDir, "package.json"),
                    JSON.stringify({
                        name: chance.word(),
                        copilotSetup: {
                            versionFiles: [
                                { filename: customVersionFile, type: "node" },
                            ],
                        },
                    }),
                );
                await writeFile(join(testDir, customVersionFile), "22");

                // Act
                const result = parseResult(
                    await discoverEnvironmentHandler({ targetDir: testDir }),
                );

                // Assert
                const versionFiles = result.versionFiles as Array<{
                    filename: string;
                }>;
                expect(versionFiles.map((vf) => vf.filename)).toContain(
                    customVersionFile,
                );
            });
        });

        describe("when targetDir is a regular file", () => {
            it("should return an error from discover_workflow_setup_actions", async () => {
                // Arrange
                const filePath = join(testDir, `${chance.word()}.txt`);
                await writeFile(filePath, chance.sentence());

                // Act
                const result = parseResult(
                    await discoverWorkflowSetupActionsHandler({
                        targetDir: filePath,
                    }),
                );

                // Assert
                expect(result.success).toBe(false);
            });

            it("should return an error from analyze_instruction_quality", async () => {
                // Arrange
                const filePath = join(testDir, `${chance.word()}.txt`);
                await writeFile(filePath, chance.sentence());

                // Act
                const result = parseResult(
                    await analyzeInstructionQualityHandler({
                        targetDir: filePath,
                    }),
                );

                // Assert
                expect(result.success).toBe(false);
            });
        });
    });

    describe("resolve_action_versions", () => {
        describe("when the actions list contains duplicates", () => {
            it("should return each action only once", async () => {
                // Arrange
                const action = `${chance.word()}/${chance.word()}`;

                // Act
                const result = parseResult(
                    await resolveActionVersionsHandler({
                        actions: [action, action],
                    }),
                );

                // Assert
                expect(result.actionsToResolve).toHaveLength(1);
            });
        });
    });

    describe("MCP protocol", () => {
        describe("when a tool call fails", () => {
            it("should set isError on the tool result", async () => {
                // Arrange
                const client = await connectClient();
                const missingDir = join(testDir, chance.guid());

                // Act
                const result = await client.callTool({
                    name: "discover_environment",
                    arguments: { targetDir: missingDir },
                });

                // Assert
                expect(result.isError).toBe(true);
            });
        });

        describe("when a client initializes the server", () => {
            it("should report the package version", async () => {
                // Arrange
                const client = await connectClient();

                // Act
                const serverVersion = client.getServerVersion();

                // Assert
                expect(serverVersion?.version).toBe(packageJson.version);
            });
        });
    });
});
