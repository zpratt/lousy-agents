import { describe, expect, it, vi } from "vitest";
import type { InitHooksConfigGatewayPort } from "./init-hooks-gateway-port.js";
import { InitHooksUseCase } from "./init-hooks-use-case.js";

function makeGateway(
    written: string[] = [],
    skipped: string[] = [],
    shouldThrow = false,
): InitHooksConfigGatewayPort {
    return {
        initHooks: vi.fn().mockImplementation(async () => {
            if (shouldThrow) throw new Error("Write failed");
            return { written, skipped };
        }),
    };
}

describe("InitHooksUseCase", () => {
    describe("given a successful gateway write", () => {
        it("returns the written file paths", async () => {
            const gateway = makeGateway(["/repo/.claude/settings.json"]);
            const useCase = new InitHooksUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                addSessionStart: false,
                force: false,
            });

            expect(result.written).toEqual(["/repo/.claude/settings.json"]);
            expect(result.skipped).toEqual([]);
        });
    });

    describe("given an already-configured file with force=false", () => {
        it("returns the skipped file paths", async () => {
            const gateway = makeGateway([], ["/repo/.claude/settings.json"]);
            const useCase = new InitHooksUseCase(gateway);

            const result = await useCase.execute({
                rootDir: "/repo",
                addSessionStart: false,
                force: false,
            });

            expect(result.written).toEqual([]);
            expect(result.skipped).toEqual(["/repo/.claude/settings.json"]);
        });
    });

    describe("given the gateway throws", () => {
        it("propagates the error", async () => {
            const gateway = makeGateway([], [], true);
            const useCase = new InitHooksUseCase(gateway);

            await expect(
                useCase.execute({
                    rootDir: "/repo",
                    addSessionStart: false,
                    force: false,
                }),
            ).rejects.toThrow("Write failed");
        });
    });

    describe("given an empty rootDir", () => {
        it("throws without calling the gateway", async () => {
            const gateway = makeGateway();
            const useCase = new InitHooksUseCase(gateway);

            await expect(
                useCase.execute({
                    rootDir: "",
                    addSessionStart: false,
                    force: false,
                }),
            ).rejects.toThrow("rootDir");
        });
    });

    describe("given a whitespace-only rootDir", () => {
        it("throws without calling the gateway", async () => {
            const gateway = makeGateway();
            const useCase = new InitHooksUseCase(gateway);

            await expect(
                useCase.execute({
                    rootDir: "   ",
                    addSessionStart: false,
                    force: false,
                }),
            ).rejects.toThrow("rootDir");
        });
    });

    describe("given addSessionStart=true", () => {
        it("passes addSessionStart to the gateway", async () => {
            const gatewayFn = vi
                .fn()
                .mockResolvedValue({ written: [], skipped: [] });
            const gateway: InitHooksConfigGatewayPort = {
                initHooks: gatewayFn,
            };
            const useCase = new InitHooksUseCase(gateway);

            await useCase.execute({
                rootDir: "/repo",
                addSessionStart: true,
                force: false,
            });

            expect(gatewayFn).toHaveBeenCalledWith("/repo", {
                addSessionStart: true,
                force: false,
            });
        });
    });
});
