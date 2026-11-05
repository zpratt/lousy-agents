# EARS Contract

> The `feature-to-plan` skill loads this file before drafting acceptance criteria in Phase 1. Every criterion, Open Question, and verification item in the plan follows it.
>
> The block below is a verbatim copy of the canonical contract in the `to-ears` skill. This copy exists so `feature-to-plan` still works when installed without `to-ears`. When `to-ears` is installed, delegate drafting and review to it in Embedded mode. This block stays binding either way.
>
> In the `lousy-agents/skills` repository, `tests/test_ears_contract_sync.py` fails CI if this copy drifts from the canonical one.

<!-- ears-contract:begin -->
**EARS Contract v1.** This block is copied verbatim from the `to-ears` skill's `references/ears-contract.md`, so the skill that carries it still works when installed alone. Do not edit this copy by itself.

When `to-ears` is installed, use it to draft and review criteria and to derive tests from them. Either way, this block is the minimum every consumer enforces.

**Patterns.** Each criterion uses one of five patterns, or one of the combinations listed below the table.

| Pattern | Template | Use when |
| --- | --- | --- |
| Ubiquitous | The `<system>` shall `<response>`. | The response is required at all times within the system's scope. Do not use it just because the source named no trigger. |
| Event-driven | When `<optional precondition>` `<trigger>`, the `<system>` shall `<response>`. | A wanted event at the system boundary activates the response. |
| Unwanted behavior | If `<optional precondition>` `<unwanted condition>`, then the `<system>` shall `<response>`. | A fault, invalid or unexpected input, misuse, or dependency failure needs a response. A boundary value of wanted behavior is not unwanted behavior. |
| State-driven | While `<state>`, the `<system>` shall `<response>`. `During` may replace `While`. | The response is required for as long as a defined runtime state holds. |
| Optional feature | Where `<feature>` is included, the `<system>` shall `<response>`. | The response applies only to product variants or deployments that include the feature. A runtime mode or flag state is a state, so use `While` for it. |

Combinations keep the clause order Where → While → When/If:

- `While <state>, when <trigger>, the <system> shall …`
- `While <state>, if <unwanted condition>, then the <system> shall …`
- `Where <feature> is included, when <trigger>, the <system> shall …`

Split a combination into linked criteria when it stops being easy to parse.

Choose the pattern from the behavior. Identify the response first, then what activates it. Never choose a pattern because a word such as "if" or "when" appears in the source text.

**Criterion line.** Write each criterion as `- AC-<story>.<n>: <EARS sentence> [<provenance>]`.

- IDs are unique within the artifact.
- Once anything cites an ID, never renumber it.
- When the source has its own identifiers, keep them and record the mapping.

Each criterion ends with exactly one provenance tag:

- `[src: <issue #, doc path, or "user">]`: the source states it, or the user confirmed it.
- `[inferred: OQ-<n>]`: the agent's interpretation, grounded in evidence it can cite, such as the source's wording or an existing repo convention. It is not settled until OQ-<n> is answered.

`[src]` covers the whole sentence as written. If you chose a part the source does not state, such as the responding component or the scope, tag the criterion `[inferred]` or mark that part `[TBD …]`. An open OQ that questions a part you left looking settled is a contradiction. When two criteria conflict, mark the conflicting part of each inline with `[TBD: conflicts with AC-… — OQ-<n>]`.

Two markers can appear in addition to that tag. Neither one replaces it.

- `[TBD: <decision needed> — OQ-<n>]`: written inline, in place of a value or clause that no evidence supports.
- `[non-EARS: <reason>]`: placed just before the provenance tag. It is a rare exception for content that no pattern fits, such as a data format. Never use it for a vague criterion.

Examples:

- `- AC-2.1: If a reset link is presented more than 60 minutes after it was issued, then the reset service shall reject it with HTTP 410. [src: #47]`
- `- AC-2.2: When a reset completes, the reset service shall send a confirmation email to the account holder. [inferred: OQ-2]`
- `- AC-2.3: While the mail provider is unavailable, the reset service shall retry delivery for [TBD: retry window — OQ-3]. [src: #47]`

**Binding rules.**

1. **Never invent.** Add no value, threshold, trigger, precondition, exclusion, or behavior that the source or the user did not establish.
   - To make a criterion testable, mark the gap with `[TBD …]` and escalate it. Never fill in a plausible number.
   - Current code behavior is evidence of what exists, not of what is intended.
2. **One obligation per criterion.** Name the responding system or component the same way every time. Do not write "it", and do not switch subjects between lines.
3. **The response is observable.** State units, inclusive or exclusive boundaries, time windows, and the recipient or surface whenever they change the expected result. A vague term (see the list below) needs a measurable definition or a `[TBD …]`.
4. **A positive rule does not imply its negation.** "When an authorized device connects, … allow" says nothing about unauthorized devices.
   - Write the complement only when a source or the user establishes it. Otherwise open an OQ.
   - A `shall not` criterion needs a decidable pass/fail check.
5. **State behavior, not design,** unless the design is an approved constraint. An internal flag or log line is not the user-visible outcome unless it is the agreed proxy for it.
6. **Keep applicability in the criterion.** A condition that changes when a criterion applies belongs in the criterion, not in surrounding notes or prose.
7. **Sweep for omissions before drafting is finished.** Check each of these:
   - invalid, unauthorized, or malformed input
   - missing, stale, or corrupt data
   - dependency failure
   - startup, degraded, recovery, and shutdown states
   - boundaries
   - repeated or concurrent events
   - logging, alerting, and fallback

   Give each relevant prompt a disposition:
   - covered (`AC-…`)
   - confirmed by the user (a criterion tagged `[src: user]`)
   - out of scope (with a reason, listed with the artifact's exclusions)
   - unresolved (`OQ-…`)

   The sweep prompts investigation. It does not license writing criteria.
8. **EARS shape is not quality.** A well-formed sentence can still be vague, wrong, compound, or untestable. Review meaning, not form.

**Open questions.** Write each as `- [ ] OQ-<n> (<severity>; question | assumption): <text> — affects: AC-…, Task …; decision needed from: <role>`. When a question is answered, mark it `[x]` and record the decision inline.

Severity levels:

- **Blocker:** the work is not safely implementable. An agent could build the wrong thing, or cannot verify completion.
- **High:** likely implementation failure: serious ambiguity, a contradiction between sections, a missing dependency, or an untestable criterion.
- **Medium:** a gap that may cause rework or inconsistent implementation.
- **Low:** clarity or hygiene, unlikely to block implementation.

Two rules set minimum severities:

- A `[TBD …]` that leaves a criterion with no decidable expected result makes its OQ at least **High**.
- An `[inferred …]` assumption's OQ is at least **Medium**.

**Verification.** Each criterion has an oracle: a setup, a stimulus, and an observable expected result.

Cover these cases for each pattern:

- **Event-driven:** the response occurs when the trigger fires with preconditions held. A criterion does not say the response must be absent without its trigger (rule 4). Assert that as conformance only where another criterion states it; otherwise label it `(exploratory)`.
- **Unwanted behavior:** induce the condition and check the mitigation.
- **State-driven:** the response holds during the state. Also cover entering and leaving the state.
- **Optional feature:** the response in a configuration that includes the feature.
- **Combinations:** the response is withheld when an applicability condition is false, only where a criterion states that. Otherwise the check is `(exploratory)`.

Tag each verification item with the criterion IDs it exercises. Otherwise label it `(exploratory)`, `(structural)`, or `(gate)`; use `(gate)` for repo-wide lint and test commands.

A passing suite or a coverage number does not show that a criterion is met.

**Vague terms.** appropriate, as needed, better, easy, efficient, fast, handle, improve, intuitive, normally, optimize, quickly, robust, safe, seamless, secure, simple, sufficient, support, unacceptable, user-friendly
<!-- ears-contract:end -->
