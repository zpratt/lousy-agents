import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWisdomClient, WisdomUnavailableError } from "./wisdom-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolve(__dirname, "../../tests/fixtures/.tmp-wisdom");
const graphifyDir = resolve(tmpDir, "graphify-out");

async function writeGraph(data: unknown): Promise<void> {
    await mkdir(graphifyDir, { recursive: true });
    await writeFile(
        resolve(graphifyDir, "graph.json"),
        JSON.stringify(data),
        "utf-8",
    );
}

describe("WisdomClient", () => {
    beforeEach(async () => {
        await mkdir(graphifyDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });

    describe("getGraph", () => {
        it("should return parsed graph when graph.json exists", async () => {
            const graph = { nodes: [{ id: "n1" }], edges: [] };
            await writeGraph(graph);

            const client = createWisdomClient(tmpDir);
            const result = await client.getGraph();

            expect(result.nodes).toHaveLength(1);
            expect(result.nodes[0].id).toBe("n1");
        });

        it("should throw WisdomUnavailableError when graph.json is missing", async () => {
            const client = createWisdomClient("/nonexistent-dir");
            await expect(client.getGraph()).rejects.toBeInstanceOf(
                WisdomUnavailableError,
            );
        });

        it("should throw WisdomUnavailableError when graph.json is invalid JSON", async () => {
            await mkdir(graphifyDir, { recursive: true });
            await writeFile(
                resolve(graphifyDir, "graph.json"),
                "not-valid-json",
                "utf-8",
            );

            const client = createWisdomClient(tmpDir);
            await expect(client.getGraph()).rejects.toBeInstanceOf(
                WisdomUnavailableError,
            );
        });

        it("should throw WisdomUnavailableError when nodes array is missing", async () => {
            await writeGraph({ edges: [] });

            const client = createWisdomClient(tmpDir);
            await expect(client.getGraph()).rejects.toBeInstanceOf(
                WisdomUnavailableError,
            );
        });

        it("should normalize missing edges to an empty array", async () => {
            await writeGraph({ nodes: [{ id: "n1" }] });

            const client = createWisdomClient(tmpDir);
            const result = await client.getGraph();

            expect(result.edges).toEqual([]);
        });
    });

    describe("findNodeById", () => {
        it("should return node when it exists", async () => {
            await writeGraph({
                nodes: [{ id: "copilot-instructions", label: "Copilot" }],
                edges: [],
            });

            const client = createWisdomClient(tmpDir);
            const node = await client.findNodeById("copilot-instructions");

            expect(node).not.toBeNull();
            expect(node?.id).toBe("copilot-instructions");
        });

        it("should return null when node does not exist", async () => {
            await writeGraph({ nodes: [], edges: [] });

            const client = createWisdomClient(tmpDir);
            const node = await client.findNodeById("nonexistent");

            expect(node).toBeNull();
        });
    });
});
