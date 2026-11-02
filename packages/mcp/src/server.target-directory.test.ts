import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import Chance from "chance";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
    analyzeActionVersionsHandler,
    analyzeInstructionQualityHandler,
    createClaudeCodeWebSetupHandler,
    createCopilotSetupWorkflowHandler,
    createMcpServer,
    discoverEnvironmentHandler,
    discoverFeedbackLoopsHandler,
    discoverWorkflowSetupActionsHandler,
    readCopilotSetupWorkflowHandler,
    resolveActionVersionsHandler,
    validateInstructionCoverageHandler,
} from "./server.js";

const chance = new Chance();

const CUSTOM_VERSION_FILE = ".customver";
const CUSTOM_MANIFEST = "custom-manifest.txt";
const CUSTOM_SETUP_ACTION = "acme/setup-thing";
const SHA_MESSAGE = "sha must be a full 40-character commit SHA";
const VERSION_TAG_MESSAGE = "versionTag must be a single-line version tag";
const FULL_SHA = "a".repeat(40);

const TextResultSchema = z
    .object({ success: z.boolean().optional(), error: z.string().optional() })
    .passthrough();

type AnyHandler = (args: { targetDir?: string }) => Promise<{
    content: { type: string; text?: string }[];
    isError?: boolean;
}>;

function parse(result: { content: { type: string; text?: string }[] }) {
    const text = result.content.find((c) => c.type === "text")?.text ?? "{}";
    return TextResultSchema.parse(JSON.parse(text));
}

const HANDLERS_THAT_TAKE_A_TARGET_DIRECTORY: [string, AnyHandler][] = [
    ["discover_environment", discoverEnvironmentHandler],
    ["discover_workflow_setup_actions", discoverWorkflowSetupActionsHandler],
    ["discover_feedback_loops", discoverFeedbackLoopsHandler],
    ["validate_instruction_coverage", validateInstructionCoverageHandler],
    ["read_copilot_setup_workflow", readCopilotSetupWorkflowHandler],
    ["create_copilot_setup_workflow", createCopilotSetupWorkflowHandler],
    ["create_claude_code_web_setup", createClaudeCodeWebSetupHandler],
    ["analyze_instruction_quality", analyzeInstructionQualityHandler],
    ["resolve_action_versions", resolveActionVersionsHandler],
    ["analyze_action_versions", analyzeActionVersionsHandler],
];

describe("MCP tools that take a targetDir", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "mcp-target-directory-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("when targetDir is a regular file", () => {
        it.each(HANDLERS_THAT_TAKE_A_TARGET_DIRECTORY)(
            "should return an error from %s",
            async (_toolName, handler) => {
                const filePath = join(testDir, `${chance.word()}.txt`);
                await writeFile(filePath, chance.sentence());

                const result = await handler({ targetDir: filePath });

                expect(result.isError).toBe(true);
                expect(parse(result).error).toBe(
                    `Target path is not a directory: ${filePath}`,
                );
            },
        );
    });

    describe("when targetDir does not exist", () => {
        it.each(HANDLERS_THAT_TAKE_A_TARGET_DIRECTORY)(
            "should return an error from %s",
            async (_toolName, handler) => {
                const missingDir = join(testDir, chance.guid());

                const result = await handler({ targetDir: missingDir });

                expect(result.isError).toBe(true);
                expect(parse(result).error).toBe(
                    `Target directory does not exist: ${missingDir}`,
                );
            },
        );
    });

    describe("when resolve_action_versions is given an explicit list of actions", () => {
        it("should answer from the list without looking at targetDir", async () => {
            const action = `${chance.word()}/${chance.word()}`;
            const missingDir = join(testDir, chance.guid());

            const result = await resolveActionVersionsHandler({
                targetDir: missingDir,
                actions: [action],
            });

            expect(result.isError).toBeUndefined();
            expect(parse(result).success).toBe(true);
        });
    });

    describe("when the lousy-agents configuration in targetDir is invalid", () => {
        const ConfigurationTools: [string, AnyHandler][] = [
            ["discover_environment", discoverEnvironmentHandler],
            ["discover_feedback_loops", discoverFeedbackLoopsHandler],
            [
                "validate_instruction_coverage",
                validateInstructionCoverageHandler,
            ],
            [
                "create_copilot_setup_workflow",
                createCopilotSetupWorkflowHandler,
            ],
            ["create_claude_code_web_setup", createClaudeCodeWebSetupHandler],
            ["resolve_action_versions", resolveActionVersionsHandler],
        ];

        beforeEach(async () => {
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
            await writeFile(
                join(testDir, "lousy-agents.config.json"),
                JSON.stringify({ versionFiles: "not-an-array" }),
            );
        });

        it.each(ConfigurationTools)(
            "should report the invalid configuration of targetDir from %s instead of using another one",
            async (_toolName, handler) => {
                const result = await handler({ targetDir: testDir });

                expect(result.isError).toBe(true);
                expect(parse(result).error).toContain("versionFiles");
            },
        );
    });

    describe("when the configuration in targetDir names an install command other than the one allowed", () => {
        it.each([
            [
                "create_copilot_setup_workflow",
                createCopilotSetupWorkflowHandler,
            ],
            ["create_claude_code_web_setup", createClaudeCodeWebSetupHandler],
        ] as [string, AnyHandler][])(
            "should reject it from %s and name the command the package manager must use",
            async (_toolName, handler) => {
                await mkdir(join(testDir, ".github", "workflows"), {
                    recursive: true,
                });
                await writeFile(join(testDir, CUSTOM_MANIFEST), "manifest");
                await writeFile(
                    join(testDir, "lousy-agents.config.json"),
                    JSON.stringify({
                        packageManagers: [
                            {
                                type: "cargo",
                                manifestFile: CUSTOM_MANIFEST,
                                installCommand: "make deps-custom",
                            },
                        ],
                    }),
                );

                const result = await handler({ targetDir: testDir });

                expect(result.isError).toBe(true);
                expect(parse(result).error).toContain(
                    "installCommand for cargo must be 'cargo build'",
                );
            },
        );
    });

    describe("when targetDir has its own lousy-agents configuration", () => {
        const configuration = {
            setupActionPatterns: [CUSTOM_SETUP_ACTION],
            versionFiles: [{ filename: CUSTOM_VERSION_FILE, type: "node" }],
            setupActions: [
                {
                    action: CUSTOM_SETUP_ACTION,
                    type: "node",
                    versionFileKey: "thing-version-file",
                },
            ],
            packageManagers: [
                {
                    type: "cargo",
                    manifestFile: CUSTOM_MANIFEST,
                    installCommand: "cargo build",
                },
            ],
        };

        beforeEach(async () => {
            await mkdir(join(testDir, ".github", "workflows"), {
                recursive: true,
            });
            await writeFile(join(testDir, CUSTOM_VERSION_FILE), "22");
            await writeFile(join(testDir, CUSTOM_MANIFEST), "manifest");
            await writeFile(
                join(testDir, "lousy-agents.config.json"),
                JSON.stringify(configuration),
            );
        });

        it("should detect the custom package manager in discover_feedback_loops", async () => {
            const result = await discoverFeedbackLoopsHandler({
                targetDir: testDir,
            });

            expect(parse(result)).toMatchObject({
                summary: { packageManager: "cargo" },
            });
        });

        it("should put the custom version file and package manager in the generated workflow", async () => {
            await createCopilotSetupWorkflowHandler({ targetDir: testDir });

            const workflow = await readFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                "utf-8",
            );
            expect(workflow).toContain(
                `node-version-file: ${CUSTOM_VERSION_FILE}`,
            );
            expect(workflow).toContain("run: cargo build");
        });

        it("should use the custom version file and package manager in create_claude_code_web_setup", async () => {
            const result = parse(
                await createClaudeCodeWebSetupHandler({ targetDir: testDir }),
            );

            expect(result).toMatchObject({
                hooks: [expect.objectContaining({ command: "cargo build" })],
                environment: {
                    versionFiles: [
                        expect.objectContaining({
                            filename: CUSTOM_VERSION_FILE,
                        }),
                    ],
                    packageManagers: [
                        expect.objectContaining({ type: "cargo" }),
                    ],
                },
            });
        });

        it("should recognise a workflow step by the custom action pattern in discover_workflow_setup_actions", async () => {
            await writeFile(
                join(testDir, ".github", "workflows", "ci.yml"),
                [
                    "name: ci",
                    "on: push",
                    "jobs:",
                    "  build:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    `      - uses: ${CUSTOM_SETUP_ACTION}@v1`,
                    "",
                ].join("\n"),
            );

            const result = parse(
                await discoverWorkflowSetupActionsHandler({
                    targetDir: testDir,
                }),
            );

            expect(result).toMatchObject({
                actions: [
                    expect.objectContaining({ action: CUSTOM_SETUP_ACTION }),
                ],
            });
        });

        it("should carry a setup action recognised by the custom pattern into the generated workflow", async () => {
            await writeFile(
                join(testDir, ".github", "workflows", "ci.yml"),
                [
                    "name: ci",
                    "on: push",
                    "jobs:",
                    "  build:",
                    "    runs-on: ubuntu-latest",
                    "    steps:",
                    `      - uses: ${CUSTOM_SETUP_ACTION}@v1`,
                    "",
                ].join("\n"),
            );

            await createCopilotSetupWorkflowHandler({ targetDir: testDir });

            const workflow = await readFile(
                join(
                    testDir,
                    ".github",
                    "workflows",
                    "copilot-setup-steps.yml",
                ),
                "utf-8",
            );
            expect(workflow).toContain(`uses: ${CUSTOM_SETUP_ACTION}@`);
        });

        it("should list the custom setup action in resolve_action_versions", async () => {
            const result = parse(
                await resolveActionVersionsHandler({ targetDir: testDir }),
            );

            expect(result).toMatchObject({
                actionsToResolve: expect.arrayContaining([
                    expect.objectContaining({ action: CUSTOM_SETUP_ACTION }),
                ]),
            });
        });
    });
});

describe("MCP create_copilot_setup_workflow resolvedVersions validation", () => {
    let client: Client;
    let workDir: string;

    beforeEach(async () => {
        workDir = await mkdtemp(join(tmpdir(), "mcp-resolved-versions-"));
        const server = createMcpServer();
        const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        client = new Client({ name: "validation-test", version: "1.0.0" });
        await client.connect(clientTransport);
    });

    afterEach(async () => {
        await client.close();
        await rm(workDir, { recursive: true, force: true });
    });

    async function callWithVersion(sha: string, versionTag: string) {
        const result = await client.callTool({
            name: "create_copilot_setup_workflow",
            arguments: {
                targetDir: workDir,
                resolvedVersions: [
                    { action: "actions/checkout", sha, versionTag },
                ],
            },
        });
        const text = (result.content as { type: string; text?: string }[]).find(
            (c) => c.type === "text",
        )?.text;
        return { isError: result.isError, text: text ?? "" };
    }

    it.each([
        ["a branch name", `feature/${chance.word()}`],
        ["a short SHA", "abc123def456"],
        ["a 39-character hex string", "a".repeat(39)],
        ["a 41-character hex string", "a".repeat(41)],
    ])(
        "should reject %s as the sha with the documented message",
        async (_name, sha) => {
            const { isError, text } = await callWithVersion(sha, "v4.0.0");

            expect(isError).toBe(true);
            expect(text).toContain(SHA_MESSAGE);
        },
    );

    it.each([
        ["a newline followed by a comment line", "v1\n# injected"],
        ["a trailing newline", "v1\n"],
        ["a carriage return", "v1\r# injected"],
        ["a leading separator", "-v1"],
        ["a space", "v1 beta"],
        ["an empty string", ""],
    ])(
        "should reject a versionTag with %s using the documented message",
        async (_name, versionTag) => {
            const { isError, text } = await callWithVersion(
                FULL_SHA,
                versionTag,
            );

            expect(isError).toBe(true);
            expect(text).toContain(VERSION_TAG_MESSAGE);
        },
    );

    it.each(["v4.0.0", "4", "release/v1.2.3+build.5", "v1.2_rc-1"])(
        "should accept the versionTag %s",
        async (versionTag) => {
            const { isError, text } = await callWithVersion(
                FULL_SHA,
                versionTag,
            );

            expect(isError).not.toBe(true);
            expect(text).not.toContain(VERSION_TAG_MESSAGE);
        },
    );
});
