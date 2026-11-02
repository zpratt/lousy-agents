import { describe, expect, it } from "vitest";
import type { RawEdge } from "./edge-parser.js";
import { limitHardImports } from "./limit-hard-imports.js";

function hardImports(count: number): RawEdge[] {
    return Array.from({ length: count }, (_, index) => ({
        type: "hard-import",
        rawTarget: `./f${index}.md`,
    }));
}

const SOFT_REFERENCE: RawEdge = {
    type: "soft-reference",
    rawTarget: "docs/guide.md",
};
const GLOB_BINDING: RawEdge = { type: "glob-binding", rawTarget: "**/*.ts" };

describe("limitHardImports", () => {
    it("should keep every edge when the hard imports are fewer than the limit", () => {
        const edges = [...hardImports(2), SOFT_REFERENCE];

        expect(limitHardImports(edges, 3)).toEqual({
            edges,
            overLimit: false,
        });
    });

    it("should keep every edge when the hard imports are exactly at the limit", () => {
        const edges = hardImports(3);

        expect(limitHardImports(edges, 3)).toEqual({
            edges,
            overLimit: false,
        });
    });

    it("should keep the first imports up to the limit, in order, and say it went over", () => {
        const edges = hardImports(5);

        expect(limitHardImports(edges, 3)).toEqual({
            edges: edges.slice(0, 3),
            overLimit: true,
        });
    });

    it("should neither count nor drop soft references and glob bindings", () => {
        const imports = hardImports(4);
        const edges = [
            SOFT_REFERENCE,
            imports[0],
            GLOB_BINDING,
            imports[1],
            imports[2],
            imports[3],
            SOFT_REFERENCE,
        ];

        expect(limitHardImports(edges, 2)).toEqual({
            edges: [
                SOFT_REFERENCE,
                imports[0],
                GLOB_BINDING,
                imports[1],
                SOFT_REFERENCE,
            ],
            overLimit: true,
        });
    });

    it("should count a token that is not clearly a path like any other", () => {
        const speculative: RawEdge = {
            type: "hard-import",
            rawTarget: "types/node",
            speculative: true,
        };
        const edges = [speculative, ...hardImports(2)];

        expect(limitHardImports(edges, 2)).toEqual({
            edges: [speculative, edges[1]],
            overLimit: true,
        });
    });
});
