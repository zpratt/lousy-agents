# Spec Audit Output Contract

Use this contract for final audit output. The goal is to make the report usable as high-fidelity input to a spec improvement loop.

## Default Markdown Report

```markdown
# Spec Audit: <spec name>

## Audit Scope

- **Artifact audited**: <path, issue, PRD, or pasted text>
- **Repo context used**: <files/commands consulted, or "not available">
- **Audit mode**: <static-only | repo-aware | issue-aware | implementation-aware>
- **Overall readiness**: <ready with minor edits | needs revision | blocked>

## Executive Summary

- **Blockers**: <count>
- **High**: <count>
- **Medium**: <count>
- **Low**: <count>
- **Primary failure risk**: <one sentence>
- **Recommended next action**: <one sentence>

## Findings

### SA-001 — <short title>

- **Severity**: <Blocker | High | Medium | Low>
- **Confidence**: <High | Medium | Low>
- **Category**: <Consistency | Completeness | Acceptance Criteria | Scope | Architecture | Data/State | Security/Privacy | Verification | Agent Robustness>
- **Evidence**: <quote, section name, line reference, file path, or "evidence gap: ...">
- **Why this matters for coding agents**: <how an agent may misunderstand, underbuild, overbuild, or falsely complete>
- **Socratic question**: <bounded question the spec author should answer>
- **Recommended spec patch**:
  ```markdown
  <drop-in replacement, new bullet, or acceptance-criteria patch>
  ```
- **Verification implication**: <test, command, check, or manual validation that becomes necessary>
- **Downstream agent instruction**: <one instruction to give Codex/Copilot/Claude after the spec is fixed>

## Cross-Finding Themes

- <theme that cuts across findings, if any>

## Suggested Improvement Loop Input

```markdown
Revise the spec using these audit findings as constraints:

<compact numbered list of decisions and patches>
```
```

## Finding Quality Bar

Every finding must be:

- Singular: one flaw per finding
- Evidence-grounded or clearly labeled as an evidence gap
- Actionable: includes a decision question and a patch
- Verifiable: says how success should be checked
- Agent-aware: explains how the flaw affects implementation behavior

Do not include generic recommendations such as "clarify requirements" without a specific question and patch.

## Machine-Readable JSON Schema

When the user asks for JSON, return this shape:

```json
{
  "artifact_audited": "string",
  "repo_context_used": ["string"],
  "audit_mode": "static-only | repo-aware | issue-aware | implementation-aware",
  "overall_readiness": "ready_with_minor_edits | needs_revision | blocked",
  "summary": {
    "blockers": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "primary_failure_risk": "string",
    "recommended_next_action": "string"
  },
  "findings": [
    {
      "id": "SA-001",
      "title": "string",
      "severity": "Blocker | High | Medium | Low",
      "confidence": "High | Medium | Low",
      "category": "Consistency | Completeness | Acceptance Criteria | Scope | Architecture | Data/State | Security/Privacy | Verification | Agent Robustness",
      "evidence": [
        {
          "source": "string",
          "location": "string",
          "excerpt": "string"
        }
      ],
      "agent_failure_mode": "string",
      "socratic_question": "string",
      "recommended_spec_patch": "string",
      "verification_implication": "string",
      "downstream_agent_instruction": "string"
    }
  ],
  "cross_finding_themes": ["string"],
  "improvement_loop_input": "string"
}
```

Return valid JSON only when JSON is requested. Otherwise use the markdown report.

## Patch Style

Recommended patches should preserve the target spec's conventions. Prefer one of these forms:

### Acceptance Criteria Patch

```markdown
#### Acceptance Criteria

- When <trigger>, the <system> shall <observable response>.
- While <state>, the <system> shall <bounded behavior>.
- If <error condition>, then the <system> shall <safe response>.
```

### Task Patch

```markdown
### Task <N>: <title>

**Objective**: <specific objective>

**Affected files**:

- `<path>` — <expected change>

**Requirements**:

- Satisfies <story/criterion reference>

**Verification**:

- [ ] `<command>` passes
- [ ] <observable behavior checked>

**Done when**:

- [ ] <objective completion condition>
```

### Open Question Patch

```markdown
### Open Questions

- [ ] <bounded decision question> Options: <A>, <B>, <C>. Default if unanswered: <safe default or "do not implement until answered">.
```
