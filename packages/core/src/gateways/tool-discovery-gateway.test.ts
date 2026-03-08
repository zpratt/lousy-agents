import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemToolDiscoveryGateway } from "./tool-discovery-gateway.js";

const chance = new Chance();

describe("FileSystemToolDiscoveryGateway", () => {
    let gateway: FileSystemToolDiscoveryGateway;
    let testDir: string;
    let workflowsDir: string;

    beforeEach(async () => {
        gateway = new FileSystemToolDiscoveryGateway();
        testDir = join("/tmp", `test-tool-discovery-${chance.guid()}`);
        workflowsDir = join(testDir, ".github", "workflows");
        await mkdir(workflowsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when workflows directory does not exist", () => {
        it("should return empty array", async () => {
            await rm(workflowsDir, { recursive: true, force: true });
            const result = await gateway.discoverTools(testDir);
            expect(result).toEqual([]);
        });
    });

    describe("when workflows directory is empty", () => {
        it("should return empty array", async () => {
            const result = await gateway.discoverTools(testDir);
            expect(result).toEqual([]);
        });
    });

    describe("when workflow contains run commands", () => {
        it("should discover tools from simple run commands", async () => {
            const workflow = {
                name: "CI",
                on: "push",
                jobs: {
                    test: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            {
                                name: "Run tests",
                                run: "npm test",
                            },
                            {
                                name: "Build",
                                run: "npm run build",
                            },
                        ],
                    },
                },
            };

            await writeFile(
                join(workflowsDir, "ci.yml"),
                `# CI workflow\n${JSON.stringify(workflow)}`,
            );

            const result = await gateway.discoverTools(testDir);

            expect(result).toContainEqual(
                expect.objectContaining({
                    name: "npm test",
                    fullCommand: "npm test",
                    phase: "test",
                    isMandatory: true,
                    sourceWorkflow: "ci.yml",
                }),
            );
            expect(result).toContainEqual(
                expect.objectContaining({
                    name: "npm run build",
                    fullCommand: "npm run build",
                    phase: "build",
                    isMandatory: true,
                    sourceWorkflow: "ci.yml",
                }),
            );
        });

        it("should discover tools from multi-line run commands", async () => {
            const workflow = {
                name: "CI",
                on: "push",
                jobs: {
                    test: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            {
                                name: "Setup and test",
                                run: `npm ci
npm test
npm run build`,
                            },
                        ],
                    },
                },
            };

            await writeFile(
                join(workflowsDir, "ci.yml"),
                `# CI workflow\n${JSON.stringify(workflow)}`,
            );

            const result = await gateway.discoverTools(testDir);

            expect(result).toContainEqual(
                expect.objectContaining({
                    name: "npm ci",
                    fullCommand: "npm ci",
                }),
            );
            expect(result).toContainEqual(
                expect.objectContaining({
                    name: "npm test",
                    fullCommand: "npm test",
                }),
            );
            expect(result).toContainEqual(
                expect.objectContaining({
                    name: "npm run build",
                    fullCommand: "npm run build",
                }),
            );
        });

        it("should discover mise run commands", async () => {
            const workflow = {
                name: "CI",
                on: "push",
                jobs: {
                    lint: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            {
                                name: "Run linting",
                                run: "mise run lint",
                            },
                            {
                                name: "Run tests",
                                run: "mise run test",
                            },
                        ],
                    },
                },
            };

            await writeFile(
                join(workflowsDir, "ci.yml"),
                `# CI workflow\n${JSON.stringify(workflow)}`,
            );

            const result = await gateway.discoverTools(testDir);

            expect(result).toContainEqual(
                expect.objectContaining({
                    name: "mise run lint",
                    fullCommand: "mise run lint",
                    phase: "lint",
                    isMandatory: true,
                }),
            );
            expect(result).toContainEqual(
                expect.objectContaining({
                    name: "mise run test",
                    fullCommand: "mise run test",
                    phase: "test",
                    isMandatory: true,
                }),
            );
        });

        it("should skip shell built-ins", async () => {
            const workflow = {
                name: "CI",
                on: "push",
                jobs: {
                    test: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            {
                                name: "Setup",
                                run: "mkdir -p dist\necho 'Building...'\ncd dist",
                            },
                            {
                                name: "Test",
                                run: "npm test",
                            },
                        ],
                    },
                },
            };

            await writeFile(
                join(workflowsDir, "ci.yml"),
                `# CI workflow\n${JSON.stringify(workflow)}`,
            );

            const result = await gateway.discoverTools(testDir);

            // Should only find npm test, not mkdir/echo/cd
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("npm test");
        });

        it("should deduplicate identical commands", async () => {
            const workflow = {
                name: "CI",
                on: "push",
                jobs: {
                    test1: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            {
                                name: "Test 1",
                                run: "npm test",
                            },
                        ],
                    },
                    test2: {
                        "runs-on": "ubuntu-latest",
                        steps: [
                            {
                                name: "Test 2",
                                run: "npm test",
                            },
                        ],
                    },
                },
            };

            await writeFile(
                join(workflowsDir, "ci.yml"),
                `# CI workflow\n${JSON.stringify(workflow)}`,
            );

            const result = await gateway.discoverTools(testDir);

            const npmTestCommands = result.filter(
                (t) => t.fullCommand === "npm test",
            );
            expect(npmTestCommands).toHaveLength(1);
        });
    });

    describe("when workflow contains multiple files", () => {
        it("should discover tools from all workflow files", async () => {
            const ciWorkflow = {
                name: "CI",
                on: "push",
                jobs: {
                    test: {
                        "runs-on": "ubuntu-latest",
                        steps: [{ name: "Test", run: "npm test" }],
                    },
                },
            };

            const releaseWorkflow = {
                name: "Release",
                on: "push",
                jobs: {
                    deploy: {
                        "runs-on": "ubuntu-latest",
                        steps: [{ name: "Deploy", run: "npm publish" }],
                    },
                },
            };

            await writeFile(
                join(workflowsDir, "ci.yml"),
                `# CI\n${JSON.stringify(ciWorkflow)}`,
            );
            await writeFile(
                join(workflowsDir, "release.yml"),
                `# Release\n${JSON.stringify(releaseWorkflow)}`,
            );

            const result = await gateway.discoverTools(testDir);

            expect(result.length).toBeGreaterThanOrEqual(2);
            expect(result.some((t) => t.fullCommand === "npm test")).toBe(true);
            expect(result.some((t) => t.fullCommand === "npm publish")).toBe(
                true,
            );
        });
    });

    describe("when workflow file is malformed", () => {
        it("should skip malformed files and continue", async () => {
            await writeFile(
                join(workflowsDir, "bad.yml"),
                "not valid yaml: {[}",
            );

            const goodWorkflow = {
                name: "CI",
                on: "push",
                jobs: {
                    test: {
                        "runs-on": "ubuntu-latest",
                        steps: [{ name: "Test", run: "npm test" }],
                    },
                },
            };

            await writeFile(
                join(workflowsDir, "good.yml"),
                `# Good workflow\n${JSON.stringify(goodWorkflow)}`,
            );

            const result = await gateway.discoverTools(testDir);

            // Should still find the tool from the good workflow
            expect(result.some((t) => t.fullCommand === "npm test")).toBe(true);
        });
    });
});
