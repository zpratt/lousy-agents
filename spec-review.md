# Spec Review: Agent Workflow Checkpoint System

**Spec file**: `.github/specs/feedback-loop-checkpoint-tools.spec.md`

## Note to self after reviewing

i want to break @.github/specs/feedback-loop-checkpoint-tools.spec.md into multiple features. the first one i want to separate out is a spec for "developer audit trail" using the npm instrumentation path. this is a more self-contained problem that doesn't require building an MCP tool or defining session boundaries. it also has a clearer value prop for users (a log of what commands i ran and when) that can be validated with a simple prototype before investing in the more complex session recovery feature. maintain the schema of the append only log and npm wrapper.

### Out of Scope

- MCP tool-based capture and session recovery (Story 1)

---

## 🔴 Critical Flaws

### 1. The Problem Statement conflates three different problems

The problem statement bundles "agent workflow transparency," "session recovery after context loss," and "developer audit trail" into one. These are distinct problems with distinct solutions. The spec never proves they belong together in a single feature.

"Agents that lose context mid-session have no way to recover their progress" is a context-window problem — a file-based log doesn't solve it unless the agent is prompted to read the log on startup. That mechanism doesn't exist in this spec and isn't described anywhere.

### 2. The npm instrumentation path (Story 2) implicitly admits Story 1 will fail

You're building two capture paths — the MCP tool path (primary) and the npm shell wrapper (fallback). Building a fallback means you expect agents to bypass the primary tool. But if agents frequently bypass the MCP tool, the primary value proposition collapses. The spec never states the expected adoption rate, never defines success criteria for either path, and never explains why an agent would consistently use `run_feedback` instead of just running `npm test`. This is a load-bearing assumption that goes unexamined.

### 3. Two personas appear in the table but have zero user stories

"Team Lead" and "Platform Engineer" are listed as personas with positive impact but have no stories, no acceptance criteria, and no tasks. Platform Engineer impact is described as "Can integrate checkpoint data into CI gates" — but CI gate integration is explicitly **out of scope**. This is actively misleading. Either write stories for them or remove them from the personas table.

### 4. Story 4's acceptance criterion is stranded — no implementing task

> "Where the lousy-agents MCP server `create_claude_code_web_setup` or `init` commands are used, the system shall offer to enable instrumentation as part of project setup."

Search every task. There is no task that implements this criterion. Task 6b (`EnableInstrumentationUseCase`) creates the use case but doesn't wire it into existing commands. Task 7b wires the MCP tools but doesn't touch init/setup flows. This acceptance criterion is a dead letter.

### 5. Session granularity is wrong for the stated problem

> "A new session begins when the MCP server starts and ends when the process exits."

Claude Code restarts MCP servers on configuration changes, on IDE restarts, and periodically. If session = process lifetime, a single coding task could span multiple sessions with no continuity, or two completely unrelated tasks could land in the same session. The spec never defines what a "task" boundary looks like and never ties sessions to tasks. The user story says "working through multi-step development tasks" but the implementation boundary is the MCP process, which has nothing to do with tasks.

---

## 🟠 Significant Issues

### 6. "Configurable" tolerance and limits — configurable by whom, and where?

The spec uses "configurable" three times for concrete values (deduplication tolerance: 1 second; output capture limit: 50,000 characters; timeout: 5 minutes) without specifying where this configuration lives. Is it `lousy-agents.config.json`? Hardcoded constants? Environment variables? "Configurable" in a spec without a configuration mechanism is hand-waving. Either define the config surface or call them constants.

### 7. Untracked entry adoption is semantically broken

> "The next MCP server session will adopt untracked entries as prior activity."

If I run `npm test` three days ago before any session existed, those untracked entries get adopted into the next session I start — even if that session is for a completely different task. The spec presents this as a feature, but it's a data integrity hazard. There's no time-bounding, no relevance check, no "was this npm run related to the current task?" validation. You're importing stale, context-free activity into new sessions.

### 8. The deduplication logic relies on a 1-second timestamp window to prevent double-counting

The spec says `run_feedback` should execute the raw command (e.g., `vitest run`) instead of `npm run test` to avoid triggering the npm wrapper. But this assumption breaks if `vitest run` itself internally calls `npm run something`, if the project has `pretest`/`posttest` npm hooks, or if a developer configures a different command. The deduplication is a fragile safety net for a design flaw in the separation strategy.

### 9. The active-session marker has a race condition when the same project is used in parallel

Two developers (or two agents) working on the same project simultaneously, both with active MCP servers, will overwrite each other's `active-session.json` marker. The spec handles the stale PID case but not the case where the previous session's PID is **still running**. The spec says: PID no longer running → clean up. But PID still running → ??? The spec is silent. The npm wrapper will write to whoever last wrote the marker file, corrupting data silently.

### 10. No session data retention or cleanup policy

`.lousy-agents/sessions/` accumulates indefinitely. A project used for 6 months generates hundreds of session directories. There's no TTL, no cleanup command, no mention of disk usage. The spec explicitly says `.lousy-agents/` is not gitignored by default, meaning it can end up in source control. The "Future Considerations" section discusses Dolt integration, implying data accumulates intentionally. But who cleans it up? There's no answer.

### 11. Task 7a has no unit tests

Task 7a creates three MCP tool handlers. Verification is: `npx biome check` + `npm run build`. No unit tests are required. The MCP handlers are the integration point between external agents and your system — they're where input validation happens. Testing them only via integration tests (Tasks 8a–8c) means failures will be caught late in a downstream task.

---

## 🟡 Weaker Issues

### 12. Story 2 acceptance criteria contain implementation details, not behavior

> "The wrapper shall invoke the wrapped npm lifecycle command via `/bin/sh` as a child process (not `exec`), wait for it to complete..."

This is an implementation decision that belongs in Design, not in acceptance criteria. Acceptance criteria should describe observable behavior (the script runs and completes, its exit code is preserved, the log entry is written). The `exec` vs. subprocess distinction is invisible to the user.

### 13. Story 5 is not a standalone story — it's a refinement of Stories 1 and 3

Story 5 ("Contextual Recovery After Failure or Retry") has no unique "so that I can..." clause that isn't already covered by Stories 1 and 3. Every acceptance criterion is an enhancement to an existing tool's response. This should be folded into Stories 1 and 3 as additional criteria, or explicitly justified as a phased increment with a shipping gate.

### 14. Windows support is a blocker buried in Task 6a requirements

> "Windows users must use WSL or a POSIX compatibility layer (e.g., Git Bash)."

This is a significant adoption barrier that appears in a task requirement footnote rather than as a prominent spec-level constraint. If a meaningful portion of the "Software Engineer Learning Vibe Coding" target audience is on Windows (and they are), this deserves explicit treatment in the problem statement's assumptions, the Out of Scope section, or in the personas section.

### 15. Documentation task has unenforced, subjective verification criteria

Task 9 verification: "Documentation is clear and accurate," "Documentation review complete." These cannot be automated and are not defined. Who does the review? What does "complete" mean? Compare this to every other task's `npm test` and `npx biome check` criteria. The documentation task skips the project's own standard of automatable verification.

### 16. Task 9 Done-when includes "Code follows patterns" — for a documentation-only task

> "Code follows patterns in `.github/copilot-instructions.md`"

This is copied from a task template and makes no sense. There is no code in Task 9.

---

## Summary

This spec is technically detailed but has three core product problems:

1. **The dual-path architecture is complexity without validated need.** You're building a fallback for a primary path you don't know will be adopted. Validate Story 1 (MCP tool adoption) before building Story 2 (npm instrumentation).

2. **Session boundaries don't match task boundaries.** Until you define what a "task" is and tie sessions to tasks rather than process lifetimes, the progress tracking won't reflect what users actually care about.

3. **Three acceptance criteria are either stranded (no implementing task), ambiguous (configurable without a config surface), or semantically broken (untracked adoption).** These need resolution before implementation starts or they become silent scope gaps.
