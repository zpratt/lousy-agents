---
name: triaging-pr-reviews
description: Use when analyzing PR review comments — especially from automated reviewers like GitHub Copilot — to classify root concerns, verify claims against actual code, evaluate trade-offs, and decide what to implement, reject, or implement differently
argument-hint: "PR number to analyze (e.g., #317). Optionally specify a source filter: 'copilot', 'human', or 'all' (default: all)"
allowed-tools: read, terminal, search
---

# Triaging PR Reviews

## Overview

PR review comments — especially from automated reviewers — are hypotheses, not instructions. Each claim must be verified against the actual codebase before action.

**Core principle:** Verify the claim, classify the concern, evaluate the trade-off, then act. Never implement a suggestion you haven't traced through the code.

## When to Use

- PR has pending review comments (human or automated) that need analysis
- Automated reviewer (Copilot, CodeRabbit, etc.) generated suggestions
- Multiple review comments need prioritization before action
- Review feedback seems technically questionable or conflicts with existing patterns

## Workflow

```
DISCOVER → TRIAGE → VERIFY → CLASSIFY → EVALUATE → IMPLEMENT → RESOLVE
```

Each phase builds on the previous. Do not skip phases — automated reviewers frequently make claims that don't hold up under verification.

---

## Phase 1: Discovery

Fetch all PR context. Run these commands to gather metadata, inline comments, and review summaries:

```bash
# PR metadata (title, branch, state)
gh pr view {number} --json title,body,headRefName,baseRefName,state,url

# Inline review comments — the actual feedback
gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate \
  | jq '[.[] | {id, user: .user.login, path, line, body, created_at, in_reply_to_id}]
        | sort_by(.created_at) | reverse'

# Review summaries (approval state per reviewer)
gh api repos/{owner}/{repo}/pulls/{number}/reviews --paginate \
  | jq '[.[] | {id, user: .user.login, state, body, submitted_at}]
        | sort_by(.submitted_at) | reverse'
```

---

## Phase 2: Triage

**Separate by source:**
- **Human reviewers** — higher trust, likely reflects project intent
- **Automated reviewers** (Copilot, bots) — treat as hypotheses requiring verification

**Identify the latest batch:**
- Group by `created_at` timestamp (automated reviewers post batches simultaneously)
- Focus on the most recent unaddressed batch

**Filter out noise:**
- Process comments (PR scope, description suggestions) — flag for human, skip technical analysis
- Duplicate concerns across batches — deduplicate to the most recent instance

**Present to user:** Count of comments by source and category. Ask which to address if scope is unclear.

---

## Phase 3: Verification

For each technical comment, read the actual code before forming any opinion:

1. **Read the cited file and line** — does the code match what the reviewer describes?
2. **Read the associated test file** — is there existing test coverage for this path?
3. **Search for codebase patterns** — does the codebase already use the pattern the reviewer suggests, or deliberately avoid it?
4. **Trace the code path** — can the scenario the reviewer describes actually be triggered by current callers?

---

## Phase 4: Classification

Categorize the root concern driving each comment:

| Category | Signal | Example |
| --- | --- | --- |
| **Security** | Injection, traversal, untrusted input, control chars | "Error message embeds unsanitized input" |
| **Correctness** | False positives/negatives, edge cases, logic bugs | "`includes('..')` rejects valid names like `..foo`" |
| **Performance** | Hot paths, unnecessary allocations, blocking calls | "Awaiting telemetry blocks the critical path" |
| **Style** | Readability, naming, idiomaticity | "This code is a bit terse" |
| **Architecture** | Layer violations, coupling, wrong abstraction level | "Business logic in adapter layer" |

**Look for shared root concerns** — multiple comments often stem from one underlying issue.

---

## Phase 5: Evaluation

For each verified claim, assess these questions:

| Question | Why It Matters |
| --- | --- |
| Is the claim technically correct for THIS code? | Automated reviewers lack full context |
| Can this scenario actually be triggered? | Latent bugs vs active vulnerabilities |
| Would the suggested fix break existing tests? | Especially security and regression tests |
| Does the suggestion conflict with a deliberate design choice? | Hand-rolled code often exists for a reason |
| Is removing code better than fixing it? | Redundant checks that only produce false positives |
| Is there a simpler alternative the reviewer didn't consider? | Reviewer optimizes locally; you see globally |

### The Deliberate Design Trap

Automated reviewers cannot know WHY code was written a certain way. Before implementing "more idiomatic" or "simpler" suggestions:

```
Search for tests that validate the CURRENT behavior.
If a test exists that would break with the suggestion,
the current code is likely deliberate.
Investigate WHY before changing.
```

**Example:** A reviewer suggests replacing a hand-rolled glob matcher with regex for readability. The codebase has a ReDoS resistance test proving the hand-rolled approach was chosen to prevent catastrophic backtracking on untrusted input. The "improvement" would introduce a security vulnerability.

### Validity Verdicts

- **Implement as-suggested** — claim is correct, fix is appropriate
- **Implement differently** — claim is correct, but a better fix exists (e.g., remove redundant code instead of tightening it)
- **Reject with reasoning** — claim is incorrect, or fix would cause harm
- **Defer to user** — architectural decision or ambiguous trade-off

---

## Phase 6: Implementation

Follow the project's development workflow (TDD if required by the project) for every fix.

**Priority order:**
1. Security (active vulnerabilities, injection, traversal)
2. Correctness (bugs triggerable by current callers)
3. Latent correctness (bugs not yet triggerable but worth hardening)
4. Style (readability, naming — only if user requests)

**Per fix:**
1. Write a failing test demonstrating the edge case the reviewer identified
2. Verify it fails for the right reason (confirms the bug exists)
3. Implement the minimal fix
4. Verify all tests pass (new and existing)
5. After all fixes: run the project's full validation suite

---

## Phase 7: Resolution

**Reply in the review thread** (not as a top-level PR comment):

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies \
  -f body="Fixed in {sha}. {Brief description of what changed and why.}"
```

**Resolve the thread via GraphQL:**

```bash
# Get unresolved thread node IDs
gh api graphql -f query='{
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {number}) {
      reviewThreads(last: 50) {
        nodes {
          id
          isResolved
          comments(first: 1) { nodes { databaseId path } }
        }
      }
    }
  }
}'

# Resolve each addressed thread
gh api graphql -f query='mutation {
  resolveReviewThread(input: {threadId: "{thread_node_id}"}) {
    thread { isResolved }
  }
}'
```

**Leave unresolved:** process-only comments, items deferred to user, rejected items awaiting discussion.

---

## Edge Cases

### Automated Reviewer Hallucinations

Automated reviewers sometimes:
- Cite line numbers that don't match the actual code
- Describe behavior that can't occur given the actual control flow
- Suggest fixes that introduce the very vulnerability they claim to prevent
- Flag "issues" in code that was already fixed in a later commit in the same PR

**Always read the code.** If the reviewer's description doesn't match what you see, trust the code.

### Massive Review Batches (10+ comments)

- Deduplicate: multiple comments often describe the same root issue from different angles
- Prioritize: security > correctness > everything else
- Batch related fixes into a single commit when they share a root cause
- Present the grouped analysis to the user before implementing

### Conflicting Suggestions

When two comments suggest contradictory fixes:
- Identify which is more technically sound
- Check if one accounts for context the other missed
- Escalate to user if genuinely ambiguous

### Cross-Platform Concerns

Automated reviewers frequently flag Windows/POSIX compatibility. Before implementing:
- Check if the project actually targets Windows (CI matrix, `engines` field)
- If not, note the scope mismatch in the rejection reasoning

---

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Implementing without reading the code | Always verify the claim at the cited line |
| Treating bot suggestions as requirements | They are hypotheses — verify each one |
| Missing deliberate design choices | Search for tests that validate current behavior |
| Fixing redundant code instead of removing it | If downstream checks are strictly better, delete the redundant check |
| Replying as top-level PR comment | Always reply in the review thread |
| Resolving threads you rejected | Leave unresolved for user to close |
| Batch-implementing without testing each | Test each fix individually, then full validation |
