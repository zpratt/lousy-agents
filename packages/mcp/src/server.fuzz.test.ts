import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import type { ToolArgs, ToolResult } from "./tools/types.js";

const chance = new Chance();

function assertValidToolResult(result: ToolResult): void {
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);

    const first = result.content[0];
    expect(first).toHaveProperty("type", "text");
    expect(first).toHaveProperty("text");
    expect(typeof first.text).toBe("string");

    let parsed: unknown;
    try {
        parsed = JSON.parse(first.text);
    } catch (_error) {
        expect.fail(`Invalid JSON in response: ${first.text.slice(0, 200)}`);
    }
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
}

const adversarialTargetDirReadOnly = fc.oneof(
    fc.constant("/nonexistent/path"),
    fc.constant("../../../etc/passwd"),
    fc.constant("/tmp/\0injected"),
    fc.constant("file:///etc/shadow"),
    fc.constant("/".repeat(4096)),
    fc
        .string({ minLength: 1, maxLength: 500 })
        .filter((s) => s !== "." && s !== "..")
        .map((s) => `/nonexistent-fuzz-${s}`),
    fc
        .stringMatching(/^[a-zA-Z0-9\s/\\:._~\-!@#$%^&*()+=]{1,200}$/)
        .filter((s) => s !== "." && s !== "..")
        .map((s) => `/nonexistent-fuzz-${s}`),
);

const readOnlyHandlers = [
    { name: "discover_environment", handler: discoverEnvironmentHandler },
    {
        name: "discover_workflow_setup_actions",
        handler: discoverWorkflowSetupActionsHandler,
    },
    { name: "discover_feedback_loops", handler: discoverFeedbackLoopsHandler },
    {
        name: "validate_instruction_coverage",
        handler: validateInstructionCoverageHandler,
    },
    {
        name: "read_copilot_setup_workflow",
        handler: readCopilotSetupWorkflowHandler,
    },
    {
        name: "analyze_action_versions",
        handler: analyzeActionVersionsHandler,
    },
    {
        name: "analyze_instruction_quality",
        handler: analyzeInstructionQualityHandler,
    },
    {
        name: "resolve_action_versions",
        handler: resolveActionVersionsHandler,
    },
];

const writeHandlers = [
    {
        name: "create_claude_code_web_setup",
        handler: createClaudeCodeWebSetupHandler,
    },
    {
        name: "create_copilot_setup_workflow",
        handler: createCopilotSetupWorkflowHandler,
    },
];

function createProtoPayload(value: Record<string, unknown>): object {
    const obj = Object.create(null);
    // biome-ignore lint/complexity/useLiteralKeys: Using computed key intentionally to create own property, not prototype chain
    obj["__proto__"] = value;
    return obj;
}

const prototypePollutionPayload = fc.oneof(
    fc.constant(createProtoPayload({ polluted: true })),
    fc.constant({ constructor: { prototype: { polluted: true } } }),
    fc.constant(
        Object.assign(Object.create(null), {
            ["__proto__"]: { isAdmin: true },
        }),
    ),
    fc.constant(
        Object.assign(Object.create(null), {
            targetDir: "/tmp",
            ["__proto__"]: { polluted: true },
        }),
    ),
    fc.constant({
        targetDir: "/tmp",
        constructor: { prototype: { polluted: true } },
    }),
    fc.constant({
        prototype: { polluted: true },
    }),
);

const adversarialResolvedVersions = fc.oneof(
    fc.constant(undefined),
    fc.constant([]),
    fc.array(
        fc.record({
            action: fc.oneof(
                fc.string(),
                fc.constant(""),
                fc.constant("../traversal"),
            ),
            sha: fc.oneof(
                fc.string(),
                fc.constant(""),
                fc.stringMatching(/^[0-9a-f]{0,40}$/),
            ),
            versionTag: fc.oneof(
                fc.string(),
                fc.constant(""),
                fc.constant("v0.0.0"),
            ),
        }),
        { minLength: 0, maxLength: 10 },
    ),
);

const adversarialActions = fc.oneof(
    fc.constant(undefined),
    fc.constant([]),
    fc.array(
        fc.oneof(
            fc.string(),
            fc.constant(""),
            fc.constant("../../../etc/passwd"),
            fc.constant("<script>alert(1)</script>"),
            fc.constant("actions/checkout"),
            fc.stringMatching(/^[a-zA-Z0-9\s/\\:._~\-!@#$%^&*()+=]{0,200}$/),
        ),
        { minLength: 0, maxLength: 20 },
    ),
);

describe("MCP Server Fuzzing", { timeout: 30_000 }, () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = join(tmpdir(), `fuzz-mcp-${chance.guid()}`);
        await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("Security Invariant 1: Input Validation Robustness", () => {
        describe("given adversarial targetDir values to read-only handlers", () => {
            for (const { name, handler } of readOnlyHandlers) {
                it(`${name} handler never throws on adversarial targetDir`, async () => {
                    await fc.assert(
                        fc.asyncProperty(
                            adversarialTargetDirReadOnly,
                            async (targetDir) => {
                                const result = await handler({ targetDir });
                                assertValidToolResult(result);
                            },
                        ),
                        { numRuns: 50 },
                    );
                });
            }
        });

        describe("given adversarial targetDir values to write handlers (sandbox-isolated)", () => {
            for (const { name, handler } of writeHandlers) {
                it(`${name} handler never throws on adversarial targetDir within sandbox`, async () => {
                    await fc.assert(
                        fc.asyncProperty(
                            fc.oneof(
                                fc.constant(testDir),
                                fc.constant(join(testDir, "subdir")),
                                fc.constant(join(testDir, "deep/nested/path")),
                                fc.constant(join(testDir, "a".repeat(200))),
                                fc
                                    .string({ minLength: 1, maxLength: 50 })
                                    .map((s) =>
                                        join(testDir, s.replace(/[/\\]/g, "_")),
                                    ),
                            ),
                            async (targetDir) => {
                                const result = await handler({ targetDir });
                                assertValidToolResult(result);
                            },
                        ),
                        { numRuns: 20 },
                    );
                });
            }
        });

        describe("given completely arbitrary argument objects to read-only handlers", () => {
            for (const { name, handler } of readOnlyHandlers) {
                it(`${name} handler returns valid ToolResult for arbitrary objects`, async () => {
                    await fc.assert(
                        fc.asyncProperty(
                            fc.record({
                                targetDir: fc.oneof(
                                    fc.string(),
                                    fc.constant("/nonexistent"),
                                ),
                            }),
                            async (args) => {
                                const result = await handler(args);
                                assertValidToolResult(result);
                            },
                        ),
                        { numRuns: 30 },
                    );
                });
            }
        });

        describe("given adversarial inputs to create_copilot_setup_workflow (sandbox-isolated)", () => {
            it("never throws on arbitrary CreateWorkflowArgs within sandbox", async () => {
                await fc.assert(
                    fc.asyncProperty(
                        fc.constant(undefined).map(() => testDir),
                        adversarialResolvedVersions,
                        async (targetDir, resolvedVersions) => {
                            const result =
                                await createCopilotSetupWorkflowHandler({
                                    targetDir,
                                    resolvedVersions,
                                });
                            assertValidToolResult(result);
                        },
                    ),
                    { numRuns: 30 },
                );
            });
        });

        describe("given adversarial inputs to resolve_action_versions", () => {
            it("never throws on arbitrary ResolveActionsArgs", async () => {
                await fc.assert(
                    fc.asyncProperty(
                        adversarialTargetDirReadOnly,
                        adversarialActions,
                        adversarialResolvedVersions,
                        async (targetDir, actions, resolvedVersions) => {
                            const result = await resolveActionVersionsHandler({
                                targetDir,
                                actions,
                                resolvedVersions,
                            });
                            assertValidToolResult(result);
                        },
                    ),
                    { numRuns: 30 },
                );
            });
        });
    });

    describe("Security Invariant 2: Prototype Pollution Resistance", () => {
        it("prototype pollution payloads do not modify Object.prototype", async () => {
            await fc.assert(
                fc.asyncProperty(prototypePollutionPayload, async (payload) => {
                    const protoBefore = Object.getOwnPropertyNames(
                        Object.prototype,
                    ).sort();

                    const args = payload as ToolArgs;
                    const readOnlyResults = await Promise.all([
                        discoverEnvironmentHandler(args),
                        discoverWorkflowSetupActionsHandler(args),
                        discoverFeedbackLoopsHandler(args),
                        analyzeActionVersionsHandler(args),
                        analyzeInstructionQualityHandler(args),
                        resolveActionVersionsHandler(args),
                        readCopilotSetupWorkflowHandler(args),
                        validateInstructionCoverageHandler(args),
                    ]);

                    const writeResults = await Promise.all([
                        createCopilotSetupWorkflowHandler({
                            ...args,
                            targetDir: testDir,
                        }),
                        createClaudeCodeWebSetupHandler({
                            ...args,
                            targetDir: testDir,
                        }),
                    ]);

                    const protoAfter = Object.getOwnPropertyNames(
                        Object.prototype,
                    ).sort();
                    expect(protoAfter).toEqual(protoBefore);

                    expect(
                        (Object.prototype as Record<string, unknown>).polluted,
                    ).toBeUndefined();
                    expect(
                        (Object.prototype as Record<string, unknown>).isAdmin,
                    ).toBeUndefined();

                    for (const result of [
                        ...readOnlyResults,
                        ...writeResults,
                    ]) {
                        assertValidToolResult(result);
                    }
                }),
                { numRuns: 20 },
            );
        });

        it("deeply nested __proto__ chains do not pollute prototypes", async () => {
            const deepPayload = Object.assign(Object.create(null), {
                targetDir: "/nonexistent",
                nested: Object.assign(Object.create(null), {
                    ["__proto__"]: Object.assign(Object.create(null), {
                        deep: Object.assign(Object.create(null), {
                            ["__proto__"]: { polluted: true },
                        }),
                    }),
                }),
            });

            const protoBefore = Object.getOwnPropertyNames(
                Object.prototype,
            ).sort();

            const results = await Promise.all([
                discoverEnvironmentHandler(deepPayload),
                resolveActionVersionsHandler(deepPayload),
            ]);

            for (const result of results) {
                assertValidToolResult(result);
            }

            const protoAfter = Object.getOwnPropertyNames(
                Object.prototype,
            ).sort();
            expect(protoAfter).toEqual(protoBefore);
            expect(
                (Object.prototype as Record<string, unknown>).polluted,
            ).toBeUndefined();
        });
    });

    describe("Security Invariant 3: Response Format Integrity", () => {
        it("all handlers produce parseable JSON in content text for valid directories", async () => {
            const results = await Promise.all([
                discoverEnvironmentHandler({ targetDir: testDir }),
                discoverWorkflowSetupActionsHandler({ targetDir: testDir }),
                discoverFeedbackLoopsHandler({ targetDir: testDir }),
                readCopilotSetupWorkflowHandler({ targetDir: testDir }),
                analyzeActionVersionsHandler({ targetDir: testDir }),
                analyzeInstructionQualityHandler({ targetDir: testDir }),
                resolveActionVersionsHandler({ targetDir: testDir }),
                createCopilotSetupWorkflowHandler({ targetDir: testDir }),
                createClaudeCodeWebSetupHandler({ targetDir: testDir }),
                validateInstructionCoverageHandler({ targetDir: testDir }),
            ]);

            for (const result of results) {
                assertValidToolResult(result);
                const parsed = JSON.parse(result.content[0].text);
                expect(parsed).toHaveProperty("success");
                expect(typeof parsed.success).toBe("boolean");
            }
        });

        it("error responses always include success: false and error field", async () => {
            const nonexistentDir = join(
                tmpdir(),
                `nonexistent-${chance.guid()}`,
            );

            const handlersToTest = [
                discoverEnvironmentHandler,
                discoverWorkflowSetupActionsHandler,
                readCopilotSetupWorkflowHandler,
                analyzeActionVersionsHandler,
                analyzeInstructionQualityHandler,
                createClaudeCodeWebSetupHandler,
            ];

            for (const handler of handlersToTest) {
                const result = await handler({ targetDir: nonexistentDir });
                assertValidToolResult(result);
                const parsed = JSON.parse(result.content[0].text);
                expect(parsed.success).toBe(false);
                expect(parsed).toHaveProperty("error");
                expect(typeof parsed.error).toBe("string");
            }
        });

        it("response JSON never contains circular references", async () => {
            const allHandlers = [...readOnlyHandlers, ...writeHandlers];
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(...allHandlers),
                    async ({ handler }) => {
                        const result = await handler({ targetDir: testDir });
                        const serialized = JSON.stringify(result);
                        expect(typeof serialized).toBe("string");

                        const parsed = JSON.parse(result.content[0].text);
                        const reSerialized = JSON.stringify(parsed);
                        expect(typeof reSerialized).toBe("string");
                    },
                ),
                { numRuns: 24 },
            );
        });
    });

    describe("Continuous Fuzzing: createMcpServer resilience", () => {
        it("server creation returns defined server instance", () => {
            fc.assert(
                fc.property(fc.nat({ max: 100 }), (_seed) => {
                    const server = createMcpServer();
                    expect(server).toBeDefined();
                }),
                { numRuns: 20 },
            );
        });
    });

    describe("Continuous Fuzzing: resolve_action_versions with generated inputs", () => {
        it("always returns valid ToolResult regardless of action name contents", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(fc.string({ minLength: 0, maxLength: 300 }), {
                        minLength: 0,
                        maxLength: 50,
                    }),
                    async (actions) => {
                        const result = await resolveActionVersionsHandler({
                            actions,
                        });
                        assertValidToolResult(result);
                        const parsed = JSON.parse(result.content[0].text);
                        expect(parsed.success).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it("filters resolved versions correctly for any combination of inputs", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(
                        fc.record({
                            action: fc.stringMatching(/^[a-z-]+\/[a-z-]+$/),
                            sha: fc.stringMatching(/^[0-9a-f]{40}$/),
                            versionTag: fc.stringMatching(/^v\d+\.\d+\.\d+$/),
                        }),
                        { minLength: 0, maxLength: 10 },
                    ),
                    async (resolvedVersions) => {
                        const actions = resolvedVersions.map((rv) => rv.action);
                        const result = await resolveActionVersionsHandler({
                            actions,
                            resolvedVersions,
                        });
                        assertValidToolResult(result);
                        const parsed = JSON.parse(result.content[0].text);
                        expect(parsed.success).toBe(true);
                        if (
                            actions.length > 0 &&
                            actions.every((a) =>
                                resolvedVersions.some((rv) => rv.action === a),
                            )
                        ) {
                            expect(parsed.actionsToResolve).toEqual([]);
                        }
                    },
                ),
                { numRuns: 30 },
            );
        });
    });
});
