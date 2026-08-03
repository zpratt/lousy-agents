# Platform Guidance for Codex, GitHub Copilot, and Claude

Use this reference when the audit output must drive a downstream coding-agent or spec-improvement loop.

## Platform-Neutral Principles

- Keep findings independent of tool-specific UI concepts.
- Use stable finding IDs so later agents can reference fixes precisely.
- Provide drop-in markdown patches, not prose-only advice.
- Tell downstream agents what not to implement until a question is resolved.
- Prefer small, bounded decisions over open-ended author prompts.
- Preserve repo conventions discovered from `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/`, `CONTRIBUTING.md`, and README files.

## Codex Handoff

Codex is effective when given explicit file targets, tests, and constraints.

Recommended handoff shape:

```markdown
Use the audit findings below to revise the spec only. Do not implement product code.

Constraints:
- Preserve existing spec structure unless a finding explicitly changes it.
- Apply only findings marked Blocker, High, or Medium.
- For any finding with an unresolved Socratic question, add it to Open Questions instead of guessing.
- After editing, show `git diff -- <spec-path>` and summarize which finding IDs were resolved.

Findings:
<SA findings>
```

## GitHub Copilot Handoff

Copilot in an IDE benefits from local context, concise instructions, and narrow edit ranges.

Recommended handoff shape:

```markdown
Revise `<spec-path>` using these spec-audit findings. Keep changes limited to the spec file. For each finding ID, either apply the recommended patch or add the Socratic question to Open Questions. Do not modify source code.

Focus first on: <Blocker/High IDs>.
```

For GitHub Issues or PR comments, use compact bullets:

```markdown
### Spec audit findings to resolve before implementation

- **SA-001 / High**: <title>. Decision needed: <question>. Suggested patch: <one-line summary>.
- **SA-002 / Medium**: <title>. Decision needed: <question>. Suggested patch: <one-line summary>.
```

## Claude Handoff

Claude often follows structured review and planning well. Give it the evidence boundary and ask it to preserve uncertainty.

Recommended handoff shape:

```markdown
Act as a spec improvement editor, not an implementer. Apply the audit findings to improve the spec for coding-agent execution.

Rules:
1. Do not invent answers to Socratic questions.
2. If a question is unanswered, add it to Open Questions with options.
3. Preserve EARS acceptance criteria.
4. Keep task changes small enough for one coding-agent session.
5. Return a mapping of finding ID -> edit made.

Audit findings:
<SA findings>
```

## When the User Wants a Prompt Instead of a Report

Return a reusable prompt like this:

```markdown
Audit this feature specification as an adversarial reviewer. Identify contradictions, gaps, logic flaws, ambiguity, untestable criteria, missing edge cases, and agent-failure risks. Produce findings in the SA schema: severity, confidence, evidence, coding-agent failure mode, Socratic question, recommended spec patch, verification implication, and downstream agent instruction. Do not rewrite the spec unless asked.
```
