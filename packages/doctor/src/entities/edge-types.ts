export type HarnessName =
    | "claude"
    | "copilot"
    | "codex"
    | "antigravity"
    | "hermes"
    | "crush"
    | "pi"
    | "shared";

export type ConstructType =
    | "instruction"
    | "skill"
    | "agent"
    | "subagent"
    | "mcp-server"
    | "plugin"
    | "hook";

export type EdgeType = "hard-import" | "soft-reference" | "glob-binding";

export type FindingCategory =
    | "missing-required"
    | "malformed-reference"
    | "wrong-direction"
    | "drift"
    | "governance"
    | "composition-style";

export interface EdgeDirection {
    from: string;
    to: string | string[];
}

export interface Edge {
    type: EdgeType;
    direction: EdgeDirection;
    target: string;
    malformed: boolean;
    reason?: "missing-target" | "path-traversal";
}

export interface InventoryRecord {
    id: string;
    path: string;
    harness: HarnessName;
    constructType: ConstructType;
    loadMechanism: "referenced" | "convention-loaded";
    edges: Edge[];
}
