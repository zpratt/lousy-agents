import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("API integration", () => {
    let app: FastifyInstance;
    let baseUrl: string;

    beforeAll(async () => {
        app = buildApp();
        await app.listen({ port: 0, host: "127.0.0.1" });
        const address = app.server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await app.close();
    });

    describe("GET /health", () => {
        it("should respond with 200 and health status", async () => {
            const response = await fetch(`${baseUrl}/health`);

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: "ok" });
        });

        it("should return application/json content type", async () => {
            const response = await fetch(`${baseUrl}/health`);

            expect(response.headers.get("content-type")).toContain(
                "application/json",
            );
        });
    });

    describe("undefined routes", () => {
        it("should return 404 for non-existent routes", async () => {
            const response = await fetch(`${baseUrl}/nonexistent`);

            expect(response.status).toBe(404);
        });
    });
});
