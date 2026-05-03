---
slug: zod-external-validation
title: Validate all external data with Zod before use
type: invariant
created: 2026-05-02
revised: 2026-05-02
provenance: []
triggers:
  paths:
    - "src/**/*.ts"
    - "packages/*/src/**/*.ts"
  tags:
    - "ts"
    - "gateway"
    - "schema"
  patterns:
    - "as Type"
    - "response.json()"
    - "JSON.parse("
---

Never trust data from external sources (HTTP responses, files, environment variables, CLI arguments) without runtime validation. Use Zod to parse and validate the shape at the boundary.

## When It Applies

- Reading API responses with `fetch`
- Parsing JSON files (configuration, hook input, settings)
- Reading environment variables
- Accepting CLI arguments that must conform to a shape

## Correct Application

```typescript
// ✅ Good — parse with Zod at the boundary
const data: unknown = await response.json();
const validated = MySchema.parse(data); // throws ZodError if invalid

// ❌ Bad — type assertion on external data
const data = (await response.json()) as MyType; // no runtime check
```

## Edge Cases

- Always check `response.ok` before calling `.json()`.
- Prefer `.safeParse()` when you need to handle errors gracefully without throwing.
- Use `.passthrough()` on schemas for forward-compatible hook input where unknown fields must be preserved.
