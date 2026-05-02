/**
 * Returns true if `value` is a non-null object that owns a `__proto__` key.
 *
 * Zod v4.4.2+ accepts and silently strips `__proto__` in `.strict()` mode,
 * causing non-conforming parsed objects to pass schema validation. Callers
 * must invoke this guard immediately after JSON.parse() and before any Zod
 * schema call to ensure such inputs are explicitly rejected.
 */
export function hasProtoKey(value: unknown): boolean {
    return (
        typeof value === "object" &&
        value !== null &&
        Object.hasOwn(value, "__proto__")
    );
}
