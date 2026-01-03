import { describe, expect, it, vi } from "vitest";
import { initCommand } from "./init.js";

describe("Init command", () => {
    describe("given the init command is executed", () => {
        it('prints "hello init" to the console', async () => {
            // Arrange
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation();

            // Act
            await initCommand.run();

            // Assert
            expect(consoleLogSpy).toHaveBeenCalledWith("hello init");

            // Cleanup
            consoleLogSpy.mockRestore();
        });
    });
});
