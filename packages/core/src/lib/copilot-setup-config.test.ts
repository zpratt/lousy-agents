import { beforeEach, describe, expect, it } from "vitest";
import {
    getVersionFileConfigKeyMap,
    getVersionFilenameToTypeMap,
    getVersionTypeToActionMap,
    loadCopilotSetupConfig,
    resetCopilotSetupConfigCache,
} from "./copilot-setup-config.js";

describe("Copilot Setup Config", () => {
    beforeEach(() => {
        resetCopilotSetupConfigCache();
    });

    describe("loadCopilotSetupConfig", () => {
        it("should return default configuration", async () => {
            // Act
            const config = await loadCopilotSetupConfig();

            // Assert
            expect(config).toBeDefined();
            expect(config.versionFiles).toBeDefined();
            expect(config.setupActions).toBeDefined();
            expect(config.setupActionPatterns).toBeDefined();
        });

        it("should include default version files", async () => {
            // Act
            const config = await loadCopilotSetupConfig();

            // Assert
            const filenames = config.versionFiles.map((f) => f.filename);
            expect(filenames).toContain(".nvmrc");
            expect(filenames).toContain(".node-version");
            expect(filenames).toContain(".python-version");
            expect(filenames).toContain(".java-version");
            expect(filenames).toContain(".ruby-version");
            expect(filenames).toContain(".go-version");
        });

        it("should include default setup actions", async () => {
            // Act
            const config = await loadCopilotSetupConfig();

            // Assert
            const actions = config.setupActions.map((a) => a.action);
            expect(actions).toContain("actions/setup-node");
            expect(actions).toContain("actions/setup-python");
            expect(actions).toContain("actions/setup-java");
            expect(actions).toContain("actions/setup-ruby");
            expect(actions).toContain("actions/setup-go");
        });

        it("should include default setup action patterns", async () => {
            // Act
            const config = await loadCopilotSetupConfig();

            // Assert
            expect(config.setupActionPatterns).toContain("actions/setup-node");
            expect(config.setupActionPatterns).toContain("jdx/mise-action");
        });
    });

    describe("getVersionTypeToActionMap", () => {
        it("should return correct action for each type", async () => {
            // Arrange
            const config = await loadCopilotSetupConfig();

            // Act
            const map = getVersionTypeToActionMap(config);

            // Assert
            expect(map.node).toBe("actions/setup-node");
            expect(map.python).toBe("actions/setup-python");
            expect(map.java).toBe("actions/setup-java");
        });
    });

    describe("getVersionFileConfigKeyMap", () => {
        it("should return correct config key for each type", async () => {
            // Arrange
            const config = await loadCopilotSetupConfig();

            // Act
            const map = getVersionFileConfigKeyMap(config);

            // Assert
            expect(map.node).toBe("node-version-file");
            expect(map.python).toBe("python-version-file");
            expect(map.java).toBe("java-version-file");
        });
    });

    describe("getVersionFilenameToTypeMap", () => {
        it("should return correct type for each filename", async () => {
            // Arrange
            const config = await loadCopilotSetupConfig();

            // Act
            const map = getVersionFilenameToTypeMap(config);

            // Assert
            expect(map[".nvmrc"]).toBe("node");
            expect(map[".node-version"]).toBe("node");
            expect(map[".python-version"]).toBe("python");
        });
    });
});
