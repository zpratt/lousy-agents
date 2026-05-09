---
slug: fail-closed-default
title: Use fail-closed defaults for policy decisions
type: invariant
created: 2026-05-02
revised: 2026-05-02
provenance: []
triggers:
  paths:
    - "src/policy/**"
    - "src/rules/**"
    - "src/auth/**"
  tags:
    - "policy"
    - "decision"
    - "deny"
  patterns:
    - "fail-closed"
    - "return true"
---

When implementing policy or permission decisions, always default to **deny** when the outcome is uncertain. A fail-closed stance means that if a check fails, throws, or produces an unexpected result, access is denied rather than granted.

## When It Applies

- Authorization checks that determine whether an action is permitted
- Feature flags where the absence of a value should prevent the feature from running
- Validation functions where a parse failure should block the operation

## Correct Application

```typescript
// ✅ Good — deny by default when uncertain
function isAllowed(rule: PolicyRule | undefined): boolean {
  if (!rule) return false; // fail-closed: no rule = deny
  return rule.effect === 'allow';
}

// ❌ Bad — allow by default when uncertain
function isAllowed(rule: PolicyRule | undefined): boolean {
  if (!rule) return true; // fail-open: no rule = allow
  return rule.effect === 'allow';
}
```

## Edge Cases

Explicit `allow` should only be returned when the rule is present, fully valid, and unambiguously grants permission. Any ambiguous or error state should resolve to deny.
