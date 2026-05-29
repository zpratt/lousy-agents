---
slug: no-walltime-vs-filesystem-timestamp
title: Never assert filesystem timestamps against Date.now()
type: invariant
created: 2026-05-29
revised: 2026-05-29
provenance: []
triggers:
  paths:
    - "**/*.test.ts"
    - "**/*.spec.ts"
  tags:
    - "test"
    - "spec"
  patterns:
    - "Date.now"
    - "mtimeMs"
    - "toBeGreaterThanOrEqual"
---

A real filesystem/OS timestamp (e.g. `stat().mtimeMs`) and `Date.now()` are **independent clock reads** — the kernel stamps a file's mtime from its own clock, while `Date.now()` reads V8's wall clock. They are not guaranteed monotonic relative to each other. Asserting `mtime >= before` (where `before = Date.now()` captured around a write) is therefore inherently flaky: on CI the recorded mtime can land a few milliseconds *behind* the wall-clock reading, intermittently failing the assertion.

Fudge factors (`before - 1`) and `Math.floor(mtimeMs)` do **not** fix this — they only narrow the window. The flake recurs. This was learned the hard way in `packages/core/src/gateways/file-system-utils.test.ts`, where the `statWithinRoot` mtime test failed twice on `main` after two separate symptom patches.

## When It Applies

- Any test that compares a value sourced from the filesystem or OS (file mtime/ctime/atime, log timestamps) against `Date.now()` / `new Date()`.
- Any assertion of the form `expect(fsTimestamp).toBeGreaterThanOrEqual(wallClockTimestamp)`.

## Correct Application

There are two sound approaches, chosen by layer:

**(a) Unit layer — inject the clock/`stat`.** When the code under test takes time or `stat` as a dependency, provide a fake with fixed values. `packages/agent-shell/src/gateways/log-query.ts` accepts an injected `stat`, and its unit test (`packages/agent-shell/tests/log/query.test.ts`) supplies `{ mtimeMs: 1000 }`, `{ mtimeMs: 2000 }` — fully deterministic, no real clock involved.

**(b) Real-fs layer — compare against a same-source reference.** When the gateway deliberately wraps the real filesystem (so mocking it would defeat the test), do not compare to `Date.now()` at all. Read a reference from the **same** source and compare to that:

```typescript
// ✅ Good — same-source reference, compared to the nearest millisecond
await writeFile(join(testDir, "file.txt"), chance.word());
const reference = await stat(join(testDir, "file.txt"));
const result = await statWithinRoot(testDir, "file.txt");
expect(result.mtimeMs).toBeCloseTo(reference.mtimeMs, 0);

// ❌ Bad — cross-clock comparison, flaky regardless of fudge/floor
const before = Date.now();
await writeFile(join(testDir, "file.txt"), chance.word());
const result = await statWithinRoot(testDir, "file.txt");
expect(Math.floor(result.mtimeMs)).toBeGreaterThanOrEqual(before - 1);
```

## Edge Cases

- Even a same-source reference is not safe with exact equality: Node derives `mtimeMs` as a float from the nanosecond timestamp, and the value is **not bit-stable across stat calls** on the same file (observed jitter ~0.0003 ms, e.g. `...962.1733` vs `...962.1736`). Compare to the nearest millisecond — `toBeCloseTo(ref, 0)` or `Math.floor` equality — not `.toBe()`. The stable integer source is `mtimeNs` (BigInt, via `stat(path, { bigint: true })`) if you need exactness.
- A fake clock (`vi.useFakeTimers` / `vi.setSystemTime`) does **not** rescue approach (b): it controls only JS time, never the kernel's file mtime. Freezing `Date.now()` makes the divergence worse, not better.
- If a test genuinely needs an "is recent" sanity check, assert membership in a generous window (e.g. within minutes) rather than a tight `>=` against a clock read — but prefer the same-source reference whenever possible.
