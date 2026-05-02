/**
 * Returns true if `value` is a non-null object (or array) that owns a
 * `__proto__` key at any nesting level up to MAX_PROTO_SCAN_DEPTH.
 *
 * Zod v4.4.2+ accepts and silently strips `__proto__` in `.strict()` mode,
 * causing non-conforming parsed objects to pass schema validation. Callers
 * must invoke this guard immediately after JSON.parse() and before any
 * `.strict()` Zod schema call to ensure such inputs are explicitly rejected.
 *
 * Structures deeper than MAX_PROTO_SCAN_DEPTH are conservatively rejected
 * to prevent unbounded recursion on attacker-controlled input.
 */

const MAX_PROTO_SCAN_DEPTH = 32;

function hasProtoKeyAtDepth(value: unknown, depth: number): boolean {
    if (depth > MAX_PROTO_SCAN_DEPTH) {
        return true;
    }
    if (typeof value !== "object" || value === null) {
        return false;
    }
    if (Object.hasOwn(value, "__proto__")) {
        return true;
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
        if (hasProtoKeyAtDepth(v, depth + 1)) {
            return true;
        }
    }
    return false;
}

export function hasProtoKey(value: unknown): boolean {
    return hasProtoKeyAtDepth(value, 0);
}
