import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("API integration", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    describe("GET /health", () => {
        it("should respond with 200 and health status", async () => {
            const response = await app.inject({
                method: "GET",
                url: "/health",
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ status: "ok" });
        });

        it("should return application/json content type", async () => {
            const response = await app.inject({
                method: "GET",
                url: "/health",
            });

            expect(response.headers["content-type"]).toContain(
                "application/json",
            );
        });
    });

    describe("undefined routes", () => {
        it("should return 404 for non-existent routes", async () => {
            const response = await app.inject({
                method: "GET",
                url: "/nonexistent",
            });

            expect(response.statusCode).toBe(404);
        });
    });
});
