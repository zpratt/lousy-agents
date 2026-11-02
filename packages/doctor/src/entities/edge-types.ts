import { z } from "zod";

export type HarnessName =
    | "claude"
    | "copilot"
    | "codex"
    | "antigravity"
    | "hermes"
    | "crush"
    | "pi"
    | "shared";

/**
 * Mirrors `@lousy-agents/core`'s `AgenticConstructType`. Redeclared locally
 * (structurally identical, so still interchangeable with core's callers
 * like `primaryConstructTypeForPath`) because `core` is a private,
 * unpublished package — importing its types here would leak an
 * unresolvable reference into this package's published `.d.ts` output.
 */
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

/**
 * Why an edge is malformed. "home" and "absolute" mirror the core import
 * expansion statuses (both reported by core as instruction/import-escape).
 * "symlink-outside", "hard-link", "not-regular" and "too-large" are the
 * import targets core refuses to read: a symlink that leaves the repository,
 * a file with more than one hard link, a directory or other non-regular file,
 * and a file over the size cap. "unreadable" is a target the system would not
 * look at or open (too many open files, access denied): nothing is known
 * about whether it exists, so it is never reported as a missing target.
 *
 * The schema is the one definition: the report format validates with it and
 * the type is derived from it, so the two cannot drift.
 */
export const EdgeMalformedReasonSchema = z.enum([
    "missing-target",
    "path-traversal",
    "home",
    "absolute",
    "symlink-outside",
    "hard-link",
    "not-regular",
    "too-large",
    "unreadable",
]);

export type EdgeMalformedReason = z.infer<typeof EdgeMalformedReasonSchema>;

export interface Edge {
    type: EdgeType;
    direction: EdgeDirection;
    target: string;
    malformed: boolean;
    reason?: EdgeMalformedReason;
}

export interface InventoryRecord {
    id: string;
    path: string;
    harness: HarnessName;
    constructType: ConstructType;
    loadMechanism: "referenced" | "convention-loaded";
    edges: Edge[];
    serverName?: string;
    transport?: string;
}
