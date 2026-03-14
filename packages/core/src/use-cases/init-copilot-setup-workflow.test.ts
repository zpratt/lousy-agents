import { describe, expect, it, vi } from "vitest";
import type { EnvironmentGateway } from "../gateways/environment-gateway.js";
import type { WorkflowGateway } from "../gateways/workflow-gateway.js";
import type { CopilotSetupConfig } from "../lib/copilot-setup-config.js";
import { initCopilotSetupWorkflow } from "./init-copilot-setup-workflow.js";

const stubConfig: CopilotSetupConfig = {
    versionFiles: [{ filename: ".nvmrc", type: "node" }],
    setupActions: [
        {
            action: "actions/setup-node",
            type: "node",
            versionFileKey: "node-version-file",
        },
    ],
    setupActionPatterns: ["actions/setup-node"],
    packageManagers: [
        {
            type: "npm",
            manifestFile: "package.json",
            lockfile: "package-lock.json",
            installCommand: "npm ci",
        },
    ],
};

function makeWorkflowGateway(
    overrides: Partial<WorkflowGateway> = {},
): WorkflowGateway {
    return {
        copilotSetupWorkflowExists: vi.fn().mockResolvedValue(false),
        parseWorkflowsForSetupActions: vi.fn().mockResolvedValue([]),
        getCopilotSetupWorkflowPath: vi
            .fn()
            .mockResolvedValue(
                "/tmp/test/.github/workflows/copilot-setup-steps.yml",
            ),
        readCopilotSetupWorkflow: vi.fn().mockResolvedValue(null),
        writeCopilotSetupWorkflow: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function makeEnvironmentGateway(
    overrides: Partial<EnvironmentGateway> = {},
): EnvironmentGateway {
    return {
        detectEnvironment: vi.fn().mockResolvedValue({
            hasMise: false,
            versionFiles: [],
            packageManagers: [],
        }),
        ...overrides,
    };
}

describe("initCopilotSetupWorkflow", () => {
    describe("when copilot-setup-steps.yml already exists", () => {
        it("should return created: false without writing a workflow file", async () => {
            // Arrange
            const workflowGateway = makeWorkflowGateway({
                copilotSetupWorkflowExists: vi.fn().mockResolvedValue(true),
            });
            const environmentGateway = makeEnvironmentGateway();

            // Act
            const result = await initCopilotSetupWorkflow(
                { targetDir: "/tmp/test", resolvedVersions: [] },
                workflowGateway,
                environmentGateway,
                stubConfig,
            );

            // Assert
            expect(result.created).toBe(false);
            expect(result.stepCount).toBe(0);
            expect(
                workflowGateway.writeCopilotSetupWorkflow,
            ).not.toHaveBeenCalled();
        });
    });

    describe("when no copilot-setup-steps.yml exists", () => {
        it("should generate and write the workflow file", async () => {
            // Arrange
            const workflowGateway = makeWorkflowGateway();
            const environmentGateway = makeEnvironmentGateway();

            // Act
            const result = await initCopilotSetupWorkflow(
                { targetDir: "/tmp/test", resolvedVersions: [] },
                workflowGateway,
                environmentGateway,
                stubConfig,
            );

            // Assert
            expect(result.created).toBe(true);
            expect(
                workflowGateway.writeCopilotSetupWorkflow,
            ).toHaveBeenCalledOnce();
            const [, writtenContent] = (
                workflowGateway.writeCopilotSetupWorkflow as ReturnType<
                    typeof vi.fn
                >
            ).mock.calls[0] as [string, string];
            expect(typeof writtenContent).toBe("string");
            expect(writtenContent).toContain("copilot-setup-steps");
        });

        it("should count checkout step in stepCount", async () => {
            // Arrange
            const workflowGateway = makeWorkflowGateway();
            const environmentGateway = makeEnvironmentGateway({
                detectEnvironment: vi.fn().mockResolvedValue({
                    hasMise: false,
                    versionFiles: [
                        { type: "node", filename: ".nvmrc", version: "20" },
                    ],
                    packageManagers: [],
                }),
            });

            // Act
            const result = await initCopilotSetupWorkflow(
                { targetDir: "/tmp/test", resolvedVersions: [] },
                workflowGateway,
                environmentGateway,
                stubConfig,
            );

            // Assert — checkout step is always added, so at least 1
            expect(result.created).toBe(true);
            expect(result.stepCount).toBeGreaterThanOrEqual(1);
        });

        it("should pass targetDir to gateway methods", async () => {
            // Arrange
            const targetDir = "/some/project";
            const workflowGateway = makeWorkflowGateway();
            const environmentGateway = makeEnvironmentGateway();

            // Act
            await initCopilotSetupWorkflow(
                { targetDir, resolvedVersions: [] },
                workflowGateway,
                environmentGateway,
                stubConfig,
            );

            // Assert
            expect(
                workflowGateway.copilotSetupWorkflowExists,
            ).toHaveBeenCalledWith(targetDir);
            expect(environmentGateway.detectEnvironment).toHaveBeenCalledWith(
                targetDir,
            );
            expect(
                workflowGateway.parseWorkflowsForSetupActions,
            ).toHaveBeenCalledWith(targetDir);
            expect(
                workflowGateway.writeCopilotSetupWorkflow,
            ).toHaveBeenCalledWith(targetDir, expect.any(String));
        });
    });
});
