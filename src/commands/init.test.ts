import { beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "./init.js";

describe("Init command", () => {
    describe("when prompting for project type", () => {
        let mockPrompt: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            mockPrompt = vi.fn().mockResolvedValue("CLI");
        });

        it("should display a prompt asking what type of project is being initialized", async () => {
            // Arrange - done in beforeEach

            // Act
            await initCommand.run({ prompt: mockPrompt });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                "What type of project are you initializing?",
                expect.objectContaining({
                    type: "select",
                }),
            );
        });

        it("should present four project type options", async () => {
            // Arrange - done in beforeEach

            // Act
            await initCommand.run({ prompt: mockPrompt });

            // Assert
            expect(mockPrompt).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    options: ["CLI", "webapp", "REST API", "GraphQL API"],
                }),
            );
        });

        it("should capture the user selection", async () => {
            // Arrange
            const expectedSelection = "CLI";
            mockPrompt.mockResolvedValue(expectedSelection);

            // Act
            await initCommand.run({ prompt: mockPrompt });

            // Assert
            expect(mockPrompt).toHaveBeenCalled();
        });
    });
});
