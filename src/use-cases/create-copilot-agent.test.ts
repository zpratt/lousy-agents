import Chance from "chance";
import { describe, expect, it, vi } from "vitest";
import type { AgentFileGateway } from "../gateways/agent-file-gateway.js";
import { CreateCopilotAgentUseCase } from "./create-copilot-agent.js";

const chance = new Chance();

function createMockGateway(): AgentFileGateway {
    return {
        agentFileExists: vi.fn().mockResolvedValue(false),
        ensureAgentsDirectory: vi.fn().mockResolvedValue(undefined),
        writeAgentFile: vi.fn().mockResolvedValue(undefined),
        getAgentFilePath: vi.fn().mockReturnValue("/mock/path/agent.md"),
    };
}

describe("CreateCopilotAgentUseCase", () => {
    describe("given a valid agent name", () => {
        it("should normalize the agent name", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = "Test Specialist";

            // Act
            const result = await useCase.execute(targetDir, agentName);

            // Assert
            expect(result.success).toBe(true);
            expect(result.normalizedName).toBe("test-specialist");
        });

        it("should ensure the agents directory exists", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = chance.word();

            // Act
            await useCase.execute(targetDir, agentName);

            // Assert
            expect(gateway.ensureAgentsDirectory).toHaveBeenCalledWith(
                targetDir,
            );
        });

        it("should write the agent file", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = "security";

            // Act
            await useCase.execute(targetDir, agentName);

            // Assert
            expect(gateway.writeAgentFile).toHaveBeenCalledWith(
                targetDir,
                "security",
                expect.stringContaining("name: security"),
            );
        });

        it("should return the file path on success", async () => {
            // Arrange
            const gateway = createMockGateway();
            const expectedPath = "/mock/path/test.md";
            gateway.getAgentFilePath = vi.fn().mockReturnValue(expectedPath);
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = chance.word();

            // Act
            const result = await useCase.execute(targetDir, agentName);

            // Assert
            expect(result.filePath).toBe(expectedPath);
        });
    });

    describe("given an agent file that already exists", () => {
        it("should return an error result", async () => {
            // Arrange
            const gateway = createMockGateway();
            gateway.agentFileExists = vi.fn().mockResolvedValue(true);
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = "security";

            // Act
            const result = await useCase.execute(targetDir, agentName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("already exists");
        });

        it("should not write the agent file", async () => {
            // Arrange
            const gateway = createMockGateway();
            gateway.agentFileExists = vi.fn().mockResolvedValue(true);
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = "security";

            // Act
            await useCase.execute(targetDir, agentName);

            // Assert
            expect(gateway.writeAgentFile).not.toHaveBeenCalled();
        });

        it("should include the file path in the error", async () => {
            // Arrange
            const gateway = createMockGateway();
            gateway.agentFileExists = vi.fn().mockResolvedValue(true);
            const expectedPath = "/project/.github/agents/security.md";
            gateway.getAgentFilePath = vi.fn().mockReturnValue(expectedPath);
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/project";
            const agentName = "security";

            // Act
            const result = await useCase.execute(targetDir, agentName);

            // Assert
            expect(result.error).toContain(expectedPath);
        });
    });

    describe("given an empty agent name", () => {
        it("should return an error result", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = "";

            // Act
            const result = await useCase.execute(targetDir, agentName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("Agent name is required");
        });
    });

    describe("given an agent name with only spaces", () => {
        it("should return an error result", async () => {
            // Arrange
            const gateway = createMockGateway();
            const useCase = new CreateCopilotAgentUseCase(gateway);
            const targetDir = "/test/dir";
            const agentName = "   ";

            // Act
            const result = await useCase.execute(targetDir, agentName);

            // Assert
            expect(result.success).toBe(false);
            expect(result.error).toContain("Agent name is required");
        });
    });
});
