import { describe, expect, it } from "vitest";
import type {
    ResolvedVersion,
    SetupStepCandidate,
} from "../entities/copilot-setup.js";
import {
    allActionsResolved,
    buildActionsToResolve,
    buildActionToResolve,
    findResolvedVersion,
    formatShaPinnedAction,
    generateLookupUrl,
    getActionVersion,
    VERSION_PLACEHOLDER,
} from "./action-resolution.js";

describe("Action version resolution", () => {
    describe("when generating a lookup URL for an action", () => {
        it("should point to the GitHub releases page for official actions", () => {
            // Arrange
            const action = "actions/setup-node";

            // Act
            const result = generateLookupUrl(action);

            // Assert
            expect(result).toBe(
                "https://github.com/actions/setup-node/releases/latest",
            );
        });

        it("should point to the GitHub releases page for third-party actions", () => {
            // Arrange
            const action = "jdx/mise-action";

            // Act
            const result = generateLookupUrl(action);

            // Assert
            expect(result).toBe(
                "https://github.com/jdx/mise-action/releases/latest",
            );
        });
    });

    describe("when building resolution metadata for an action", () => {
        it("should include the action name, placeholder, and lookup URL", () => {
            // Arrange
            const action = "actions/setup-python";

            // Act
            const result = buildActionToResolve(action);

            // Assert
            expect(result).toEqual({
                action: "actions/setup-python",
                currentPlaceholder: VERSION_PLACEHOLDER,
                lookupUrl:
                    "https://github.com/actions/setup-python/releases/latest",
            });
        });
    });

    describe("when building a list of actions needing resolution", () => {
        it("should include checkout action along with all detected setup actions", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
                { action: "actions/setup-python", source: "version-file" },
            ];

            // Act
            const result = buildActionsToResolve(candidates);

            // Assert
            expect(result).toHaveLength(3);
            expect(result.map((r) => r.action)).toEqual([
                "actions/checkout",
                "actions/setup-node",
                "actions/setup-python",
            ]);
        });

        it("should remove duplicate actions from the list", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
                { action: "actions/setup-node", source: "workflow" },
            ];

            // Act
            const result = buildActionsToResolve(candidates);

            // Assert
            expect(result).toHaveLength(2);
            expect(result.map((r) => r.action)).toEqual([
                "actions/checkout",
                "actions/setup-node",
            ]);
        });

        it("should exclude actions that have already been resolved", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
                { action: "actions/setup-python", source: "version-file" },
            ];
            const resolvedVersions: ResolvedVersion[] = [
                {
                    action: "actions/checkout",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
                {
                    action: "actions/setup-node",
                    sha: "def456",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const result = buildActionsToResolve(candidates, resolvedVersions);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].action).toBe("actions/setup-python");
        });

        it("should return empty list when all actions have been resolved", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
            ];
            const resolvedVersions: ResolvedVersion[] = [
                {
                    action: "actions/checkout",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
                {
                    action: "actions/setup-node",
                    sha: "def456",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const result = buildActionsToResolve(candidates, resolvedVersions);

            // Assert
            expect(result).toHaveLength(0);
        });
    });

    describe("when formatting an action reference with SHA pinning", () => {
        it("should include the SHA and version tag as a comment", () => {
            // Arrange
            const action = "actions/setup-node";
            const sha = "1a2b3c4d5e6f";
            const versionTag = "v4.0.0";

            // Act
            const result = formatShaPinnedAction(action, sha, versionTag);

            // Assert
            expect(result).toBe("actions/setup-node@1a2b3c4d5e6f  # v4.0.0");
        });
    });

    describe("when looking up a resolved version for an action", () => {
        it("should return the resolved version when it exists", () => {
            // Arrange
            const resolvedVersions: ResolvedVersion[] = [
                {
                    action: "actions/checkout",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
                {
                    action: "actions/setup-node",
                    sha: "def456",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const result = findResolvedVersion(
                "actions/setup-node",
                resolvedVersions,
            );

            // Assert
            expect(result).toEqual({
                action: "actions/setup-node",
                sha: "def456",
                versionTag: "v4.0.0",
            });
        });

        it("should return undefined when the action has not been resolved", () => {
            // Arrange
            const resolvedVersions: ResolvedVersion[] = [
                {
                    action: "actions/checkout",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const result = findResolvedVersion(
                "actions/setup-python",
                resolvedVersions,
            );

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("when determining the version string for an action", () => {
        it("should use SHA-pinned format when the action has been resolved", () => {
            // Arrange
            const resolvedVersions: ResolvedVersion[] = [
                {
                    action: "actions/setup-node",
                    sha: "abc123def456",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const result = getActionVersion(
                "actions/setup-node",
                resolvedVersions,
            );

            // Assert
            expect(result).toBe("abc123def456  # v4.0.0");
        });

        it("should use fallback version when action is not resolved but fallback is provided", () => {
            // Arrange
            const fallbackVersion = "v4";

            // Act
            const result = getActionVersion(
                "actions/setup-node",
                undefined,
                fallbackVersion,
            );

            // Assert
            expect(result).toBe("v4");
        });

        it("should use placeholder when action is not resolved and no fallback is provided", () => {
            // Act
            const result = getActionVersion("actions/setup-node");

            // Assert
            expect(result).toBe(VERSION_PLACEHOLDER);
        });
    });

    describe("when checking if all actions have been resolved", () => {
        it("should return true when all required actions are resolved", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
            ];
            const resolvedVersions: ResolvedVersion[] = [
                {
                    action: "actions/checkout",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
                {
                    action: "actions/setup-node",
                    sha: "def456",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const result = allActionsResolved(candidates, resolvedVersions);

            // Assert
            expect(result).toBe(true);
        });

        it("should return false when some required actions are still pending", () => {
            // Arrange
            const candidates: SetupStepCandidate[] = [
                { action: "actions/setup-node", source: "version-file" },
                { action: "actions/setup-python", source: "version-file" },
            ];
            const resolvedVersions: ResolvedVersion[] = [
                {
                    action: "actions/checkout",
                    sha: "abc123",
                    versionTag: "v4.0.0",
                },
            ];

            // Act
            const result = allActionsResolved(candidates, resolvedVersions);

            // Assert
            expect(result).toBe(false);
        });
    });
});
