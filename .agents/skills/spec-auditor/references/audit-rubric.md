# Adversarial Spec Audit Rubric

Use these passes to stress-test a spec before a coding agent implements it. Apply the passes that fit the artifact; do not force irrelevant findings.

## Pass 1: Internal Consistency

Look for contradictions across problem statement, stories, acceptance criteria, design, tasks, and out-of-scope sections.

Check for:

- The same concept named in multiple ways without mapping
- Acceptance criteria that require behavior not represented in tasks
- Tasks that implement behavior not requested in requirements
- Out-of-scope items that reappear in tasks or acceptance criteria
- Diagrams that disagree with prose
- Value statement or persona that conflicts with the actual workflow
- Different default states, feature flag behavior, or permission rules in different sections

Failure pattern: a coding agent picks one section as authoritative and silently ignores the conflicting section.

## Pass 2: Completeness of Behavior

Look for missing paths needed for a complete implementation.

Check for:

- Happy path without error, empty, loading, timeout, retry, cancellation, rollback, or recovery paths
- Missing create/read/update/delete implications
- Missing first-run, migration, upgrade, downgrade, or backfill behavior
- Missing admin/operator experience
- Missing accessibility, localization, audit logging, observability, or notification requirements when domain-relevant
- Missing feature flag, rollout, tenant, environment, or configuration behavior
- Missing privacy, security, authorization, or data retention behavior

Failure pattern: an agent implements the obvious path, marks the task done, and leaves production edge cases undefined.

## Pass 3: EARS and Acceptance Criteria Quality

A good acceptance criterion is testable, bounded, and maps to a user-visible or system-observable behavior.

Check for:

- Criteria that do not use an EARS-like trigger/condition/response structure
- Subjective verbs: improve, optimize, support, handle, robust, seamless, intuitive, appropriate, fast, efficient, better
- Missing actor, trigger, system response, or observable outcome
- Criteria that describe implementation mechanics instead of required behavior
- Criteria that bundle multiple independent behaviors into one bullet
- Criteria with no negative/error condition
- Criteria that cannot be verified by automated tests, commands, screenshots, logs, or explicit inspection

Failure pattern: an agent satisfies the spirit in its own interpretation but not the author's intent.

## Pass 4: Scope and Increment Boundaries

Check whether the work is sized and bounded for coding-agent execution.

Check for:

- More than one feature hidden inside one spec
- Tasks larger than one agent session
- Tasks spanning unrelated components without sequencing
- Missing dependencies between tasks
- Ambiguous ownership between frontend, backend, infra, data, docs, and tests
- Out-of-scope not explicit enough to prevent over-build
- Future considerations that are accidentally required by acceptance criteria

Failure pattern: an agent makes broad, risky changes or stops halfway with a partial implementation.

## Pass 5: Architecture and Repo Fit

Compare the spec to known repository guidance and existing structure when available.

Check for:

- Referenced paths, packages, APIs, commands, or services that do not exist
- Conflict with `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, architecture docs, or contribution guidance
- New patterns where an existing pattern should be followed
- Missing affected files or too-vague file targets
- Missing dependency changes, schema changes, migrations, generated files, or config updates
- Hidden cross-service contracts or API compatibility requirements
- Lack of fallback behavior for external dependencies

Failure pattern: an agent invents architecture instead of extending the repo's conventions.

## Pass 6: Data, State, and Lifecycle

Check whether data movement and state transitions are defined.

Check for:

- Undefined source of truth
- Ambiguous state machine, status values, or transitions
- Missing idempotency, concurrency, race condition, or duplicate event behavior
- Missing persistence, caching, invalidation, indexing, or migration requirements
- Missing data validation, normalization, ownership, retention, deletion, or export behavior
- Missing backward compatibility for existing records or clients

Failure pattern: an agent implements state changes that pass simple tests but fail under real usage.

## Pass 7: Security, Privacy, and Abuse Resistance

Audit for unsafe defaults and missing controls.

Check for:

- Missing authentication and authorization rules
- Role or permission names not defined
- Sensitive data exposure in UI, logs, errors, telemetry, prompts, or exports
- Injection risks: SQL, command, prompt, template, path traversal, SSRF, XSS, deserialization
- Missing rate limits, quotas, abuse prevention, or audit trails
- Missing secrets handling and configuration guidance
- Missing tenant isolation or data boundary language

Failure pattern: an agent builds functional behavior that creates security or privacy regressions.

## Pass 8: Verification and Done Criteria

Check whether completion can be objectively proven.

Check for:

- No repo-specific test, lint, typecheck, build, migration, or manual verification commands
- Verification that restates requirements without saying how to check them
- Done criteria that depend on subjective judgment
- No mapping from tasks to acceptance criteria
- Tests omitted for error paths, permissions, data migrations, or integration boundaries
- No rollback or monitoring validation for risky changes

Failure pattern: an agent reports success without evidence that the intended behavior works.

## Pass 9: Agent Instruction Robustness

Check whether a coding agent has enough operational guidance.

Check for:

- Undefined exact files or search strategy
- Missing order of operations
- Missing constraints that prevent broad refactors
- Missing instructions for preserving public APIs, data contracts, or backwards compatibility
- Missing constraints around generated files, formatting, dependency installation, or test fixtures
- Terms like "use best practices" without repo-specific meaning
- Lack of explicit stop conditions when assumptions fail

Failure pattern: different agents produce incompatible implementations from the same spec.

## Pass 10: Improvement-Loop Readiness

Check whether findings can be fed back into a spec generator.

A finding is improvement-loop ready only if it has:

- A single clear flaw
- Evidence or explicit evidence gap
- A bounded author decision question
- A concrete spec patch or acceptance criterion patch
- A verification implication
- A downstream agent instruction

Failure pattern: the report contains critique, but the next spec-improvement agent cannot turn it into edits without reinterpreting intent.
