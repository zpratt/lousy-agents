---
applyTo: ".github/workflows/*.{yml,yaml}"
---

# Pipeline Instructions

## MANDATORY: After Modifying Workflows

Run these validation commands in order:

```bash
mise lint
```

## Workflow Structure Requirements

1. Every workflow MUST include test and lint jobs.
2. Use official setup actions: `actions/checkout`, `actions/setup-node`, `actions/cache`.
3. Prefer using `mise` for installing tools and dependencies and scripts for verification.

## Action Pinning Format

Pin ALL third-party actions to exact commit SHA with version comment:

```yaml
# CORRECT format:
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

# INCORRECT formats (do NOT use):
uses: actions/checkout@v4        # ❌ version tag only
uses: actions/checkout@v4.1.1    # ❌ version tag only
uses: actions/checkout@main      # ❌ branch reference
```

Before adding any action:
1. Check GitHub for the LATEST stable version
2. Find the full commit SHA for that version
3. Add both SHA and version comment

## Runner Requirements

| Workflow | Runner |
|----------|--------|
| Default (all workflows) | `ubuntu-latest` |
| `copilot-setup-steps.yml` | May use different runners as needed |
