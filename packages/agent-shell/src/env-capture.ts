const TAG_PREFIX = "AGENTSHELL_TAG_";
const MAX_VALUE_BYTES = 1024;
const MAX_TAGS = 50;
const TRUNCATION_SUFFIX = "…[truncated]";

const PROTOTYPE_POLLUTION_KEYS = new Set([
    "__proto__",
    "constructor",
    "prototype",
]);

const ALLOWLIST_PREFIXES = ["npm_lifecycle_", "github_", "agentshell_"];
const ALLOWLIST_EXACT = new Set([
    "npm_package_name",
    "npm_package_version",
    "node_env",
    "ci",
]);

const BLOCKLIST_PATTERNS = ["secret", "token", "key", "password", "credential"];

function isAllowlisted(name: string): boolean {
    const lower = name.toLowerCase();

    if (ALLOWLIST_EXACT.has(lower)) {
        return true;
    }

    return ALLOWLIST_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isBlocklisted(name: string): boolean {
    const lower = name.toLowerCase();
    return BLOCKLIST_PATTERNS.some((pattern) => lower.includes(pattern));
}

function isTagVariable(name: string): boolean {
    return name.startsWith(TAG_PREFIX);
}

function truncateValue(value: string): { value: string; truncated: boolean } {
    const bytes = Buffer.byteLength(value, "utf-8");
    if (bytes <= MAX_VALUE_BYTES) {
        return { value, truncated: false };
    }

    const buf = Buffer.from(value, "utf-8");
    const sliced = buf.subarray(0, MAX_VALUE_BYTES).toString("utf-8");
    return { value: `${sliced}${TRUNCATION_SUFFIX}`, truncated: true };
}

export function captureEnv(
    env: Record<string, string | undefined>,
): Record<string, string> {
    const result: Record<string, string> = {};
    let anyTruncated = false;

    for (const [name, value] of Object.entries(env)) {
        if (value === undefined) continue;
        if (!isAllowlisted(name)) continue;
        if (isBlocklisted(name)) continue;
        if (isTagVariable(name)) continue;

        const { value: finalValue, truncated } = truncateValue(value);
        result[name] = finalValue;
        if (truncated) anyTruncated = true;
    }

    if (anyTruncated) {
        result._env_truncated = "true";
    }

    return result;
}

export function captureTags(
    env: Record<string, string | undefined>,
): Record<string, string> {
    const result: Record<string, string> = Object.create(null);
    let anyTruncatedOrDiscarded = false;

    const entries: Array<[string, string]> = [];

    for (const [name, value] of Object.entries(env)) {
        if (value === undefined) continue;
        if (!name.startsWith(TAG_PREFIX)) continue;

        const tagKey = name.slice(TAG_PREFIX.length).toLowerCase();

        if (PROTOTYPE_POLLUTION_KEYS.has(tagKey)) continue;

        entries.push([tagKey, value]);
    }

    entries.sort((a, b) => a[0].localeCompare(b[0]));

    if (entries.length > MAX_TAGS) {
        anyTruncatedOrDiscarded = true;
        entries.length = MAX_TAGS;
    }

    for (const [key, rawValue] of entries) {
        const { value, truncated } = truncateValue(rawValue);
        result[key] = value;
        if (truncated) anyTruncatedOrDiscarded = true;
    }

    if (anyTruncatedOrDiscarded) {
        result._tags_truncated = "true";
    }

    return result;
}
