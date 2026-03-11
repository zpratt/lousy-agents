# @lousy-agents/cli

CLI scaffolding for Lousy Agents.

Use this package to bootstrap new projects with testing, linting, AI assistant instructions, and GitHub Copilot setup.

## Quick Start

```bash
npx @lousy-agents/cli init
```

Common follow-up commands:

```bash
# Generate Copilot setup workflow in an existing repository
npx @lousy-agents/cli copilot-setup

# Create new resources such as custom agents
npx @lousy-agents/cli new

# Validate skills, agents, and instruction files
npx @lousy-agents/cli lint
```

## Documentation

- Project overview: [README](https://github.com/zpratt/lousy-agents#readme)
- `init` command: [`docs/init.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/init.md)
- `new` command: [`docs/new.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/new.md)
- `lint` command: [`docs/lint.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/lint.md)
- `copilot-setup` command: [`docs/copilot-setup.md`](https://github.com/zpratt/lousy-agents/blob/main/docs/copilot-setup.md)

## Reference Examples

- React webapp scaffold: [`packages/cli/ui/copilot-with-react`](https://github.com/zpratt/lousy-agents/tree/main/packages/cli/ui/copilot-with-react)
- Fastify API scaffold: [`packages/cli/api/copilot-with-fastify`](https://github.com/zpratt/lousy-agents/tree/main/packages/cli/api/copilot-with-fastify)
- Citty CLI scaffold: [`packages/cli/cli/copilot-with-citty`](https://github.com/zpratt/lousy-agents/tree/main/packages/cli/cli/copilot-with-citty)
