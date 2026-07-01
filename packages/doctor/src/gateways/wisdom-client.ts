import { readTextWithinRoot } from "@lousy-agents/core/gateways/file-system-utils.js";
import { z } from "zod";

const MAX_GRAPH_BYTES = 10_485_760;

export class WisdomUnavailableError extends Error {
    constructor(reason: string) {
        super(`Wisdom graph unavailable: ${reason}`);
        this.name = "WisdomUnavailableError";
    }
}

const WisdomNodeSchema = z
    .object({
        id: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
        sourceFile: z.string().optional(),
        lineStart: z.number().int().min(1).optional().catch(undefined),
        lineEnd: z.number().int().min(1).optional().catch(undefined),
    })
    .passthrough();

const WisdomGraphSchema = z.object({
    nodes: z.array(WisdomNodeSchema),
    edges: z.array(z.unknown()).default([]),
    snapshotRef: z.string().optional(),
});

export type WisdomNode = z.infer<typeof WisdomNodeSchema>;
export type WisdomGraph = z.infer<typeof WisdomGraphSchema>;

export interface WisdomClient {
    getGraph(): Promise<WisdomGraph>;
    findNodeById(nodeId: string): Promise<WisdomNode | null>;
}

export function createWisdomClient(wisdomDir: string): WisdomClient {
    async function getGraph(): Promise<WisdomGraph> {
        let raw: string;
        try {
            raw = await readTextWithinRoot(
                wisdomDir,
                "graphify-out/graph.json",
                MAX_GRAPH_BYTES,
            );
        } catch {
            throw new WisdomUnavailableError(
                "graph.json not found in wisdom directory — ensure the wisdom submodule is initialized",
            );
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new WisdomUnavailableError("graph.json is not valid JSON");
        }

        try {
            return WisdomGraphSchema.parse(parsed);
        } catch {
            throw new WisdomUnavailableError(
                "graph.json does not match expected schema (nodes must be an array with id strings)",
            );
        }
    }

    async function findNodeById(nodeId: string): Promise<WisdomNode | null> {
        const graph = await getGraph();
        return graph.nodes.find((n) => n.id === nodeId) ?? null;
    }

    return { getGraph, findNodeById };
}
