# `init` Command

Scaffolds new projects with everything needed for effective AI-assisted development.

## Features

### Webapp Projects (`--kind webapp`)

- Next.js + React + TypeScript configuration
- Vitest testing setup with React Testing Library
- Biome linting and formatting
- GitHub Copilot instructions tailored for webapp development
- VSCode configuration with recommended extensions
- Dev Container setup for one-click environments
- EditorConfig and Node.js version management

### CLI Projects (`--kind CLI`)

- `.github/instructions` directory structure
- GitHub Copilot instructions for CLI development

## Usage

### Interactive Mode

Run the init command and select your project type from the menu:

```bash
npx @lousy-agents/cli init
```

You'll be prompted to choose from:

- CLI
- webapp
- REST API (coming soon)
- GraphQL API (coming soon)

### Non-Interactive Mode

Specify the project type directly:

```bash
npx @lousy-agents/cli init --kind webapp
npx @lousy-agents/cli init --kind CLI
```

Perfect for CI/CD pipelines and automation scripts.

### Help

```bash
npx @lousy-agents/cli --help
npx @lousy-agents/cli init --help
```

## Examples

### Create a New Webapp

```bash
# Interactive mode - select from menu
npx @lousy-agents/cli init

# Non-interactive mode
npx @lousy-agents/cli init --kind webapp
```

### Create a New CLI Project

```bash
npx @lousy-agents/cli init --kind CLI
```
