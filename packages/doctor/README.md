# @lousy-agents/agentic-doctor

Agentic configuration doctor: inventory multi-harness constructs, classify repository archetype, and evaluate known preconditions.

## Installable entry (recommended)

This package name is **not published to the public npm registry** today. Run doctor through the published CLI:

```bash
npx @lousy-agents/cli doctor
npx @lousy-agents/cli doctor --format json --ci
```

## Monorepo / library use

Inside this repository (or a workspace that depends on the local package), the library export and `agentic-doctor` bin are available after build:

```bash
npm run build --workspace=packages/doctor
node packages/doctor/dist/cli/index.js --format json --ci
```

```ts
import {
  scanRepository,
  classifyArchetype,
  evaluate,
  CRITERIA,
  formatSummary,
  toJson,
  hasBlockingFindings,
  readIntentArtifact,
} from "@lousy-agents/agentic-doctor";

const repoPath = process.cwd();
const records = await scanRepository(repoPath);
const classification = classifyArchetype(records);
const summary = formatSummary(records, classification);
const intentResult = await readIntentArtifact(repoPath);
const findings = evaluate(CRITERIA, {
  records,
  classification,
  intent: intentResult.found ? intentResult.artifact : null,
});
const report = toJson(summary, findings, records);
if (hasBlockingFindings(findings)) {
  process.exitCode = 1;
}
```

## Documentation

- Full command reference: [`docs/doctor.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/doctor.md)
- Project overview: [README](https://github.com/zpratt/lousy-agents#readme)
- Lint vs doctor discovery: [`docs/lint.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/lint.md)
