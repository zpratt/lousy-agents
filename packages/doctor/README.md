# @lousy-agents/agentic-doctor

Agentic configuration doctor: inventory multi-harness constructs, classify repository archetype, and evaluate known preconditions.

Most users should run doctor through the CLI:

```bash
npx @lousy-agents/cli doctor
npx @lousy-agents/cli doctor --format json --ci
```

This package also ships the `agentic-doctor` binary and a programmatic API for embedding the same pipeline.

```bash
npx -y -p @lousy-agents/agentic-doctor agentic-doctor --format json --ci
```

## Documentation

- Full command reference: [`docs/doctor.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/doctor.md)
- Project overview: [README](https://github.com/zpratt/lousy-agents#readme)
- Lint vs doctor discovery: [`docs/lint.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/lint.md)

## Programmatic use

```ts
import {
  scanRepository,
  classifyArchetype,
  evaluate,
  CRITERIA,
  toJson,
} from "@lousy-agents/agentic-doctor";

const records = await scanRepository(process.cwd());
const classification = classifyArchetype(records);
const findings = evaluate(CRITERIA, {
  records,
  classification,
  intent: null,
});
```

See [`docs/doctor.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/doctor.md) for flags, JSON shape, criteria, exit codes, and CI examples.
