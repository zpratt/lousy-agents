import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    type CopilotSetupConfig,
    DEFAULT_COPILOT_SETUP_CONFIG,
} from "@lousy-agents/core/entities/copilot-setup-config.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildCreateCopilotSetupWorkflowHandler } from "./create-copilot-setup-workflow.js";

const SETUP_ACTION = "acme/setup-thing";
const ENVIRONMENT_ACTION = "acme/env-setup";
const ENVIRONMENT_VERSION_FILE = ".envver";
const WORKFLOWS_DIRECTORY = [".github", "workflows"];

const ResultSchema = z
    .object({ action: z.string(), stepsAdded: z.array(z.string()) })
    .passthrough();

const configRecognising = (action: string): CopilotSetupConfig => ({
    ...DEFAULT_COPILOT_SETUP_CONFIG,
    setupActionPatterns: [action],
});

function countingLoader(config: CopilotSetupConfig) {
    const directoriesRead: string[] = [];
    return {
        directoriesRead,
        loadConfig: async (directory: string) => {
            directoriesRead.push(directory);
            return config;
        },
    };
}

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

describe("create_copilot_setup_workflow", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "create-workflow-"));
        await mkdir(join(testDir, ...WORKFLOWS_DIRECTORY), { recursive: true });
        await writeFile(
            join(testDir, ...WORKFLOWS_DIRECTORY, "ci.yml"),
            workflowUsing(SETUP_ACTION),
        );
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when it creates the workflow from the workflows already in the repository", () => {
        it("should load the configuration once for the whole call", async () => {
            const { directoriesRead, loadConfig } = countingLoader(
                configRecognising(SETUP_ACTION),
            );
            const handler = buildCreateCopilotSetupWorkflowHandler({
                loadConfig,
            });

            await handler({ targetDir: testDir });

            expect(directoriesRead).toEqual([testDir]);
        });

        it("should find the workflow's setup action with the configuration it loaded", async () => {
            const { loadConfig } = countingLoader(
                configRecognising(SETUP_ACTION),
            );
            const handler = buildCreateCopilotSetupWorkflowHandler({
                loadConfig,
            });

            const result = await handler({ targetDir: testDir });

            const text = result.content[0]?.text ?? "{}";
            expect(ResultSchema.parse(JSON.parse(text))).toMatchObject({
                action: "created",
                stepsAdded: [SETUP_ACTION],
            });
        });
    });

    describe("when the configuration it loaded names its own version file", () => {
        it("should detect the environment with that configuration", async () => {
            await writeFile(join(testDir, ENVIRONMENT_VERSION_FILE), "22");
            const { loadConfig } = countingLoader({
                ...DEFAULT_COPILOT_SETUP_CONFIG,
                setupActionPatterns: [ENVIRONMENT_ACTION],
                versionFiles: [
                    { filename: ENVIRONMENT_VERSION_FILE, type: "node" },
                ],
                setupActions: [
                    {
                        action: ENVIRONMENT_ACTION,
                        type: "node",
                        versionFileKey: "env-version-file",
                    },
                ],
            });
            const handler = buildCreateCopilotSetupWorkflowHandler({
                loadConfig,
            });

            const result = await handler({ targetDir: testDir });

            const text = result.content[0]?.text ?? "{}";
            expect(ResultSchema.parse(JSON.parse(text))).toMatchObject({
                stepsAdded: [ENVIRONMENT_ACTION],
            });
        });
    });

    describe("when it updates a copilot-setup-steps workflow that already exists", () => {
        it("should load the configuration once for the whole call", async () => {
            await writeFile(
                join(
                    testDir,
                    ...WORKFLOWS_DIRECTORY,
                    "copilot-setup-steps.yml",
                ),
                workflowUsing("actions/checkout"),
            );
            const { directoriesRead, loadConfig } = countingLoader(
                configRecognising(SETUP_ACTION),
            );
            const handler = buildCreateCopilotSetupWorkflowHandler({
                loadConfig,
            });

            await handler({ targetDir: testDir });

            expect(directoriesRead).toEqual([testDir]);
        });
    });
});
