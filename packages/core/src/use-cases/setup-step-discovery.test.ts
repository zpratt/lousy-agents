import Chance from "chance";
import { describe, expect, it } from "vitest";
import type { SetupStepCandidate } from "../entities/copilot-setup.js";
import {
    deduplicateCandidates,
    extractActionsFromWorkflow,
    extractAllWorkflowSteps,
    extractSetupStepsFromWorkflow,
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    isSetupAction,
    mergeCandidates,
    parseActionName,
    parseActionVersion,
    runCommandKey,
} from "./setup-step-discovery.js";

const chance = new Chance();

const MALFORMED_WORKFLOWS: ReadonlyArray<readonly [string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["a string", "workflow"],
    ["a number", 42],
    ["an object without jobs", {}],
    ["null jobs", { jobs: null }],
    ["string jobs", { jobs: "build" }],
    ["a null job", { jobs: { build: null } }],
    ["a primitive job", { jobs: { build: 42 } }],
    ["a job without steps", { jobs: { build: {} } }],
    [
        "a job whose steps is not an array",
        { jobs: { build: { steps: "run" } } },
    ],
];

describe("Setup Step Discovery", () => {
    describe("parseActionName", () => {
        it("should extract action name without version", () => {
            // Act
            const result = parseActionName("actions/setup-node@v4");

            // Assert
            expect(result).toBe("actions/setup-node");
        });

        it("should return action name as-is when no version present", () => {
            // Act
            const result = parseActionName("actions/setup-node");

            // Assert
            expect(result).toBe("actions/setup-node");
        });
    });

    describe("isSetupAction", () => {
        it("should return true for matching action", () => {
            // Arrange
            const patterns = ["actions/setup-node", "actions/setup-python"];

            // Act
            const result = isSetupAction("actions/setup-node", patterns);

            // Assert
            expect(result).toBe(true);
        });

        it("should return false for non-matching action", () => {
            // Arrange
            const patterns = ["actions/setup-node", "actions/setup-python"];

            // Act
            const result = isSetupAction("actions/checkout", patterns);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe("getExistingActionsFromWorkflow", () => {
        it("should extract action names from workflow steps", () => {
            // Arrange
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            { uses: "actions/checkout@v4" },
                            { uses: "actions/setup-node@v4" },
                        ],
                    },
                },
            };

            // Act
            const result = getExistingActionsFromWorkflow(workflow);

            // Assert
            expect(result).toContain("actions/checkout");
            expect(result).toContain("actions/setup-node");
        });

        it("should return empty set for invalid workflow", () => {
            // Act
            const result = getExistingActionsFromWorkflow(null);

            // Assert
            expect(result.size).toBe(0);
        });
    });

    describe("findMissingCandidates", () => {
        it("should return candidates not in existing actions", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
                { action: "actions/setup-python", source: "version-file" },
            ];
            const existingActions = new Set(["actions/setup-node"]);

            // Act
            const result = findMissingCandidates(candidates, existingActions);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].action).toBe("actions/setup-python");
        });

        it("should return empty array when all candidates exist", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
            ];
            const existingActions = new Set(["actions/setup-node"]);

            // Act
            const result = findMissingCandidates(candidates, existingActions);

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("when a run step candidate is checked against an existing workflow", () => {
        const installCommand = `npm ci --${chance.word()}`;
        const runCandidate: SetupStepCandidate = {
            action: "run:npm",
            source: "version-file",
            run: installCommand,
        };

        it("should not report the run step as missing when the workflow already runs the command", () => {
            const workflow = {
                jobs: { setup: { steps: [{ run: installCommand }] } },
            };

            const result = findMissingCandidates(
                [runCandidate],
                getExistingActionsFromWorkflow(workflow),
            );

            expect(result).toEqual([]);
        });

        it("should report the run step as missing when the workflow does not run the command", () => {
            const workflow = {
                jobs: {
                    setup: { steps: [{ run: `${installCommand} --other` }] },
                },
            };

            const result = findMissingCandidates(
                [runCandidate],
                getExistingActionsFromWorkflow(workflow),
            );

            expect(result).toEqual([runCandidate]);
        });
    });

    describe("mergeCandidates", () => {
        it("should give precedence to earlier sources", () => {
            // Arrange
            const source1: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    source: "workflow",
                    version: "v4",
                },
            ];
            const source2: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    source: "version-file",
                    version: "v3",
                },
            ];

            // Act
            const result = mergeCandidates(source1, source2);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].source).toBe("workflow");
            expect(result[0].version).toBe("v4");
        });

        it("should include unique candidates from all sources", () => {
            // Arrange
            const source1: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "workflow" },
            ];
            const source2: SetupStepCandidate[] = [
                { action: "actions/setup-python", source: "version-file" },
            ];

            // Act
            const result = mergeCandidates(source1, source2);

            // Assert
            expect(result).toHaveLength(2);
        });
    });

    describe("extractSetupStepsFromWorkflow", () => {
        it("should extract setup steps matching patterns", () => {
            // Arrange
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            { uses: "actions/checkout@v4" },
                            {
                                uses: "actions/setup-node@v4",
                                with: { "node-version": "20" },
                            },
                        ],
                    },
                },
            };
            const patterns = ["actions/setup-node"];

            // Act
            const result = extractSetupStepsFromWorkflow(workflow, patterns);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].action).toBe("actions/setup-node");
            expect(result[0].version).toBe("v4");
            expect(result[0].config).toEqual({ "node-version": "20" });
        });

        it("should return empty array for invalid workflow", () => {
            // Act
            const result = extractSetupStepsFromWorkflow(null, [
                "actions/setup-node",
            ]);

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("deduplicateCandidates", () => {
        it("should remove duplicate actions keeping first occurrence", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "workflow",
                },
                {
                    action: "actions/setup-node",
                    version: "v3",
                    source: "version-file",
                },
                { action: "actions/setup-python", source: "version-file" },
            ];

            // Act
            const result = deduplicateCandidates(candidates);

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0].action).toBe("actions/setup-node");
            expect(result[0].version).toBe("v4");
            expect(result[1].action).toBe("actions/setup-python");
        });
    });

    describe("parseActionVersion", () => {
        it("should extract the version after the @ separator", () => {
            const version = `v${chance.natural({ min: 1, max: 9 })}`;

            const result = parseActionVersion(`actions/setup-node@${version}`);

            expect(result).toBe(version);
        });

        it("should return undefined when the reference has no version", () => {
            const result = parseActionVersion("actions/setup-node");

            expect(result).toBeUndefined();
        });
    });

    describe("runCommandKey", () => {
        it("should prefix the trimmed command", () => {
            const command = `npm ${chance.word()}`;

            const result = runCommandKey(`  ${command}  `);

            expect(result).toBe(`run-command:${command}`);
        });
    });

    describe("when the workflow structure is malformed", () => {
        it.each(MALFORMED_WORKFLOWS)(
            "should find no steps in %s",
            (_label, workflow) => {
                expect(extractAllWorkflowSteps(workflow)).toEqual([]);
                expect(getExistingActionsFromWorkflow(workflow)).toEqual(
                    new Set(),
                );
                expect(extractActionsFromWorkflow(workflow)).toEqual([]);
                expect(
                    extractSetupStepsFromWorkflow(workflow, [
                        "actions/checkout",
                    ]),
                ).toEqual([]);
            },
        );

        it("should skip steps that are not objects and keep the usable ones", () => {
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            null,
                            "run",
                            7,
                            { uses: "actions/checkout@v4" },
                        ],
                    },
                },
            };

            const allSteps = extractAllWorkflowSteps(workflow);
            const actions = extractActionsFromWorkflow(workflow);

            expect(allSteps).toHaveLength(1);
            expect(actions).toEqual([
                { name: "actions/checkout", version: "v4" },
            ]);
        });
    });

    describe("extractAllWorkflowSteps", () => {
        it("should return name, uses and with for every step across all jobs in order", () => {
            const stepName = chance.word();
            const nodeVersion = String(chance.natural({ min: 20, max: 30 }));
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            { name: stepName, uses: "actions/checkout@v4" },
                            { name: "Install", run: "npm ci" },
                        ],
                    },
                    test: {
                        steps: [
                            {
                                uses: "actions/setup-node@v4",
                                with: { "node-version": nodeVersion },
                            },
                        ],
                    },
                },
            };

            const result = extractAllWorkflowSteps(workflow);

            expect(result).toStrictEqual([
                {
                    name: stepName,
                    uses: "actions/checkout@v4",
                    with: undefined,
                },
                { name: "Install", uses: undefined, with: undefined },
                {
                    name: undefined,
                    uses: "actions/setup-node@v4",
                    with: { "node-version": nodeVersion },
                },
            ]);
        });

        it("should treat non-string name or uses and non-object with as absent", () => {
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            { name: 5, uses: false, with: "text" },
                            { with: null },
                        ],
                    },
                },
            };

            const result = extractAllWorkflowSteps(workflow);

            expect(result).toStrictEqual([
                { name: undefined, uses: undefined, with: undefined },
                { name: undefined, uses: undefined, with: undefined },
            ]);
        });

        it("should iterate jobs given as an array", () => {
            const workflow = {
                jobs: [{ steps: [{ uses: "actions/checkout@v4" }] }],
            };

            const result = extractAllWorkflowSteps(workflow);

            expect(result).toHaveLength(1);
        });
    });

    describe("getExistingActionsFromWorkflow run steps", () => {
        it("should record a trimmed run command key for a run step", () => {
            const command = `npm ${chance.word()}`;
            const workflow = {
                jobs: { build: { steps: [{ run: `  ${command}  ` }] } },
            };

            const result = getExistingActionsFromWorkflow(workflow);

            expect(result).toEqual(new Set([`run-command:${command}`]));
        });

        it("should record only the action when a step has both uses and run", () => {
            const workflow = {
                jobs: {
                    build: {
                        steps: [{ uses: "actions/checkout@v4", run: "echo" }],
                    },
                },
            };

            const result = getExistingActionsFromWorkflow(workflow);

            expect(result).toEqual(new Set(["actions/checkout"]));
        });

        it("should ignore steps with neither uses nor run", () => {
            const workflow = {
                jobs: { build: { steps: [{ name: chance.word() }] } },
            };

            const result = getExistingActionsFromWorkflow(workflow);

            expect(result).toEqual(new Set());
        });
    });

    describe("extractActionsFromWorkflow", () => {
        it("should return only references that name a version", () => {
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            { uses: "actions/checkout@v4" },
                            { uses: "actions/setup-node" },
                            { uses: "actions/cache@" },
                            { run: "npm ci" },
                            { uses: 42 },
                        ],
                    },
                },
            };

            const result = extractActionsFromWorkflow(workflow);

            expect(result).toEqual([
                { name: "actions/checkout", version: "v4" },
            ]);
        });
    });

    describe("extractSetupStepsFromWorkflow details", () => {
        it("should carry version and with configuration, treating a non-object with as absent", () => {
            const nodeVersion = String(chance.natural({ min: 20, max: 30 }));
            const workflow = {
                jobs: {
                    build: {
                        steps: [
                            {
                                uses: "actions/setup-node@v4",
                                with: { "node-version": nodeVersion },
                            },
                            { uses: "actions/setup-node", with: "invalid" },
                            { uses: "actions/checkout@v4" },
                        ],
                    },
                },
            };

            const result = extractSetupStepsFromWorkflow(workflow, [
                "actions/setup-node",
            ]);

            expect(result).toStrictEqual([
                {
                    action: "actions/setup-node",
                    version: "v4",
                    config: { "node-version": nodeVersion },
                    source: "workflow",
                },
                {
                    action: "actions/setup-node",
                    version: undefined,
                    config: undefined,
                    source: "workflow",
                },
            ]);
        });
    });

    describe("mergeCandidates edge cases", () => {
        it("should return an empty array when given no sources", () => {
            const result = mergeCandidates();

            expect(result).toEqual([]);
        });

        it("should drop duplicates that occur within a single source", () => {
            const source: SetupStepCandidate[] = [
                {
                    action: "actions/setup-node",
                    version: "v4",
                    source: "workflow",
                },
                {
                    action: "actions/setup-node",
                    version: "v3",
                    source: "workflow",
                },
            ];

            const result = mergeCandidates(source);

            expect(result).toEqual([source[0]]);
        });
    });
});
