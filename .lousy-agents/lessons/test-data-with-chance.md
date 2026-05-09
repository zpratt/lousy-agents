---
slug: test-data-with-chance
title: Use Chance.js for test fixture generation
type: pattern
created: 2026-05-02
revised: 2026-05-02
provenance: []
triggers:
  paths:
    - "**/*.test.ts"
    - "**/*.spec.ts"
  tags:
    - "test"
    - "spec"
  patterns:
    - "hardcoded"
    - "const userId = '123'"
    - "new Chance()"
---

Use `Chance.js` to generate random but readable test fixtures. Hardcoded values duplicated across test setup and assertions are a maintenance hazard and make failures harder to trace.

## When It Applies

- Any test that requires an ID, name, URL, date, or string whose exact value does not matter
- Test setup that generates expected values to compare against computed results

## Correct Application

```typescript
import Chance from 'chance';
const chance = new Chance();

// ✅ Good — generated fixture extracted to a variable
const userId = chance.guid();
const expectedUser = { id: userId, name: chance.name() };
// ...
expect(result.id).toBe(userId); // same variable in both setup and assertion

// ❌ Bad — hardcoded in setup, hardcoded in assertion
const user = { id: '123', name: 'Alice' };
expect(result.id).toBe('123'); // duplicated literal
```

## Edge Cases

- Avoid overly complex Chance.js configurations that produce unreadable failure messages.
- Use `chance.pickone([...])` when the value must come from a known set.
- Keep the `chance` instance at module scope or describe-block scope; do not call `new Chance()` inside individual tests unless you need a seeded instance.
