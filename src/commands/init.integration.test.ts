import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Chance from "chance";
import {
    GenericContainer,
    type StartedTestContainer,
    Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initCommand } from "./init.js";

const chance = new Chance();
const API_PORT = 3000;

/**
 * Minimal Fastify API implementation to add to the scaffolded project.
 * Starts a server with a /health endpoint on port 3000.
 */
const TRIVIAL_API_SOURCE = `
import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => {
	return { status: "ok" };
});

const start = async () => {
	await app.listen({ port: ${API_PORT}, host: "0.0.0.0" });
};

start();
`;

/**
 * Dockerfile to build and run the scaffolded API project.
 * Uses a multi-stage approach: install deps, then run with tsx.
 */
function createDockerfile(nodeVersion: string): string {
    return `FROM node:${nodeVersion}-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE ${API_PORT}
CMD ["npx", "tsx", "src/index.ts"]
`;
}

describe("API template end-to-end", () => {
    let container: StartedTestContainer;
    let projectDir: string;
    let baseUrl: string;

    beforeAll(async () => {
        // Arrange: scaffold a new API project
        projectDir = join(tmpdir(), `e2e-api-${chance.guid()}`);
        await mkdir(projectDir, { recursive: true });

        const projectName = `test-api-${chance.word({ length: 6 }).toLowerCase()}`;
        const mockPrompt = () => Promise.resolve(projectName);

        await initCommand.run({
            rawArgs: [],
            args: { _: [], kind: "api", name: projectName },
            cmd: initCommand,
            data: { prompt: mockPrompt, targetDir: projectDir },
        });

        // Add trivial API implementation
        const srcDir = join(projectDir, "src");
        await mkdir(srcDir, { recursive: true });
        await writeFile(join(srcDir, "index.ts"), TRIVIAL_API_SOURCE, "utf-8");

        // Read the Node.js version from the scaffolded .nvmrc
        const nvmrcContent = await readFile(
            join(projectDir, ".nvmrc"),
            "utf-8",
        );
        const nodeVersion = nvmrcContent.trim().replace(/^v/, "");

        // Write a Dockerfile for the container
        await writeFile(
            join(projectDir, "Dockerfile"),
            createDockerfile(nodeVersion),
            "utf-8",
        );

        // Build and start the container
        container = await GenericContainer.fromDockerfile(projectDir)
            .build("e2e-api-test", { deleteOnExit: true })
            .then((image) =>
                image
                    .withExposedPorts(API_PORT)
                    .withWaitStrategy(
                        Wait.forHttp("/health", API_PORT).withStartupTimeout(
                            60000,
                        ),
                    )
                    .start(),
            );

        const host = container.getHost();
        const mappedPort = container.getMappedPort(API_PORT);
        baseUrl = `http://${host}:${mappedPort}`;
    }, 120000);

    afterAll(async () => {
        if (container) {
            await container.stop();
        }
        if (projectDir) {
            await rm(projectDir, { recursive: true, force: true });
        }
    });

    describe("given a scaffolded API project running in a container", () => {
        it("should respond with 200 and health status on GET /health", async () => {
            // Act
            const response = await fetch(`${baseUrl}/health`);

            // Assert
            expect(response.status).toBe(200);
            const body = (await response.json()) as { status: string };
            expect(body.status).toBe("ok");
        });

        it("should return proper content-type header", async () => {
            // Act
            const response = await fetch(`${baseUrl}/health`);

            // Assert
            expect(response.headers.get("content-type")).toContain(
                "application/json",
            );
        });

        it("should return 404 for undefined routes", async () => {
            // Act
            const response = await fetch(`${baseUrl}/nonexistent`);

            // Assert
            expect(response.status).toBe(404);
        });
    });
});
