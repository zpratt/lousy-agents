import { describe, expect, it } from "vitest";
import type { SetupStepCandidate } from "../entities/copilot-setup.js";
import {
    deduplicateCandidates,
    extractSetupStepsFromWorkflow,
    findMissingCandidates,
    getExistingActionsFromWorkflow,
    isSetupAction,
    mergeCandidates,
    parseActionName,
} from "./setup-step-discovery.js";

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
});
