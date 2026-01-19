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

describe("Action Resolution Use Case", () => {
    describe("generateLookupUrl", () => {
        it("should generate GitHub releases URL for an action", () => {
            // Arrange
            const action = "actions/setup-node";

            // Act
            const result = generateLookupUrl(action);

            // Assert
            expect(result).toBe(
                "https://github.com/actions/setup-node/releases/latest",
            );
        });

        it("should handle third-party actions", () => {
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

    describe("buildActionToResolve", () => {
        it("should build ActionToResolve with correct fields", () => {
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

    describe("buildActionsToResolve", () => {
        it("should include checkout and all candidate actions", () => {
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

        it("should deduplicate actions", () => {
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

        it("should filter out already-resolved actions", () => {
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

        it("should return empty array when all actions are resolved", () => {
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

    describe("formatShaPinnedAction", () => {
        it("should format action with SHA and version comment", () => {
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

    describe("findResolvedVersion", () => {
        it("should find matching resolved version", () => {
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

        it("should return undefined for unresolved action", () => {
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

    describe("getActionVersion", () => {
        it("should return SHA-pinned format when action is resolved", () => {
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

        it("should return fallback version when not resolved but fallback provided", () => {
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

        it("should return placeholder when not resolved and no fallback", () => {
            // Act
            const result = getActionVersion("actions/setup-node");

            // Assert
            expect(result).toBe(VERSION_PLACEHOLDER);
        });
    });

    describe("allActionsResolved", () => {
        it("should return true when all actions are resolved", () => {
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

        it("should return false when some actions are not resolved", () => {
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
