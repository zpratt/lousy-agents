import { describe, expect, it } from "vitest";
import {
    createActionVersionGateway,
    KNOWN_ACTIONS,
    LocalActionVersionGateway,
} from "./action-version-gateway.js";

describe("Action Version Gateway", () => {
    describe("LocalActionVersionGateway", () => {
        describe("getVersion", () => {
            it("should return version for known actions", async () => {
                // Arrange
                const gateway = new LocalActionVersionGateway();

                // Act
                const version = await gateway.getVersion("actions/setup-node");

                // Assert
                expect(version).toBe("v4");
            });

            it("should return undefined for unknown actions", async () => {
                // Arrange
                const gateway = new LocalActionVersionGateway();

                // Act
                const version = await gateway.getVersion("unknown/action");

                // Assert
                expect(version).toBeUndefined();
            });

            it("should return version for actions/checkout", async () => {
                // Arrange
                const gateway = new LocalActionVersionGateway();

                // Act
                const version = await gateway.getVersion("actions/checkout");

                // Assert
                expect(version).toBe("v4");
            });

            it("should return version for jdx/mise-action", async () => {
                // Arrange
                const gateway = new LocalActionVersionGateway();

                // Act
                const version = await gateway.getVersion("jdx/mise-action");

                // Assert
                expect(version).toBe("v2");
            });
        });

        describe("getVersions", () => {
            it("should return versions for multiple known actions", async () => {
                // Arrange
                const gateway = new LocalActionVersionGateway();
                const actionNames = [
                    "actions/checkout",
                    "actions/setup-node",
                    "actions/setup-python",
                ];

                // Act
                const versions = await gateway.getVersions(actionNames);

                // Assert
                expect(versions).toEqual({
                    "actions/checkout": "v4",
                    "actions/setup-node": "v4",
                    "actions/setup-python": "v5",
                });
            });

            it("should exclude unknown actions from result", async () => {
                // Arrange
                const gateway = new LocalActionVersionGateway();
                const actionNames = [
                    "actions/checkout",
                    "unknown/action",
                    "actions/setup-node",
                ];

                // Act
                const versions = await gateway.getVersions(actionNames);

                // Assert
                expect(versions).toEqual({
                    "actions/checkout": "v4",
                    "actions/setup-node": "v4",
                });
                expect(versions["unknown/action"]).toBeUndefined();
            });

            it("should return empty object for empty input", async () => {
                // Arrange
                const gateway = new LocalActionVersionGateway();

                // Act
                const versions = await gateway.getVersions([]);

                // Assert
                expect(versions).toEqual({});
            });
        });
    });

    describe("createActionVersionGateway", () => {
        it("should return a LocalActionVersionGateway instance", () => {
            // Act
            const gateway = createActionVersionGateway();

            // Assert
            expect(gateway).toBeInstanceOf(LocalActionVersionGateway);
        });
    });

    describe("KNOWN_ACTIONS", () => {
        it("should include all expected setup actions", () => {
            // Assert
            expect(KNOWN_ACTIONS).toContain("actions/checkout");
            expect(KNOWN_ACTIONS).toContain("actions/setup-node");
            expect(KNOWN_ACTIONS).toContain("actions/setup-python");
            expect(KNOWN_ACTIONS).toContain("actions/setup-java");
            expect(KNOWN_ACTIONS).toContain("actions/setup-ruby");
            expect(KNOWN_ACTIONS).toContain("actions/setup-go");
            expect(KNOWN_ACTIONS).toContain("jdx/mise-action");
        });
    });
});
