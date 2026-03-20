import { isAbsolute, join } from "node:path";
import { isWithinProjectRoot } from "./path-utils.js";
import { type PolicyConfig, PolicyConfigSchema } from "./types.js";

export interface PolicyDeps {
    realpath: (path: string) => Promise<string>;
    readFile: (path: string, encoding: string) => Promise<string>;
    getRepositoryRoot: () => string;
}

export interface PolicyDecision {
    decision: "allow" | "deny";
    matchedRule: string | null;
}

const DEFAULT_POLICY_SUBPATH = ".github/hooks/agent-shell/policy.json";

/**
 * Glob matcher supporting only `*` wildcards.
 *
 * Splits the rule on `*` into literal segments and checks that each
 * segment appears in the command in order. O(n·m) worst case where
 * n = command length and m = rule length, with no exponential
 * backtracking (unlike regex `.*` quantifiers).
 */
function matchesRule(command: string, rule: string): boolean {
    const segments = rule.split("*");

    // No wildcards — require exact match
    if (segments.length === 1) return command === rule;

    // First segment must match the start of the command
    const first = segments[0];
    if (!command.startsWith(first)) return false;

    let searchFrom = first.length;

    // Inner segments must appear in order
    for (let i = 1; i < segments.length - 1; i++) {
        const idx = command.indexOf(segments[i], searchFrom);
        if (idx === -1) return false;
        searchFrom = idx + segments[i].length;
    }

    // Last segment must match the end of the command
    const last = segments[segments.length - 1];
    if (segments.length > 1 && !command.endsWith(last)) return false;

    // Ensure the last segment doesn't overlap with already-matched content
    if (segments.length > 1 && command.length - last.length < searchFrom) {
        return false;
    }

    return true;
}

export function evaluatePolicy(
    policy: PolicyConfig | null,
    command: string,
): PolicyDecision {
    if (policy === null) {
        return { decision: "allow", matchedRule: null };
    }

    const trimmed = command.trim();

    for (const rule of policy.deny) {
        if (matchesRule(trimmed, rule)) {
            return { decision: "deny", matchedRule: rule };
        }
    }

    if (policy.allow !== undefined) {
        const matchesAny = policy.allow.some((rule) =>
            matchesRule(trimmed, rule),
        );
        if (!matchesAny) {
            return { decision: "deny", matchedRule: null };
        }
    }

    return { decision: "allow", matchedRule: null };
}

function isEnoent(error: unknown): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        (error as Error & { code: string }).code === "ENOENT"
    );
}

function resolvePolicyPath(
    env: Record<string, string | undefined>,
    repoRoot: string,
): string {
    const override = env.AGENTSHELL_POLICY_PATH;

    if (override !== undefined && override !== "") {
        if (isAbsolute(override)) {
            // Absolute path — use as-is (will be validated after realpath)
            return override;
        }
        // Relative path — resolve relative to repo root
        return join(repoRoot, override);
    }

    return join(repoRoot, DEFAULT_POLICY_SUBPATH);
}

export async function loadPolicy(
    env: Record<string, string | undefined>,
    deps: PolicyDeps,
): Promise<PolicyConfig | null> {
    const rawRepoRoot = deps.getRepositoryRoot();
    const repoRoot = await deps.realpath(rawRepoRoot);
    const candidatePath = resolvePolicyPath(env, repoRoot);

    let resolvedPath: string;
    try {
        resolvedPath = await deps.realpath(candidatePath);
    } catch (error: unknown) {
        if (isEnoent(error)) {
            return null;
        }
        throw error;
    }

    if (!isWithinProjectRoot(resolvedPath, repoRoot)) {
        throw new Error(
            `Policy file path resolves outside the repository root: ${resolvedPath}`,
        );
    }

    let content: string;
    try {
        content = await deps.readFile(resolvedPath, "utf-8");
    } catch (error: unknown) {
        if (isEnoent(error)) {
            return null;
        }
        throw error;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error(
            `Invalid JSON in policy file ${resolvedPath}: file exists but contains malformed JSON`,
        );
    }

    return PolicyConfigSchema.parse(parsed);
}
