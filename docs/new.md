# `new` Command

Creates new resources for your project, including custom GitHub Copilot agents.

![Demo](../media/new-copilot-agent.gif)

## Features

### Custom Copilot Agents (`--copilot-agent`)

Creates a new GitHub Copilot custom agent file in `.github/agents/` with:

- YAML frontmatter with agent name and description
- Template structure for defining agent responsibilities
- Guidelines section for best practices
- Example interactions section
- Link to official GitHub documentation

Custom agents allow you to create specialized AI assistants tailored to specific domains or responsibilities in your repository.

## Usage

### Create a Custom Copilot Agent

```bash
npx lousy-agents new --copilot-agent <name>
```

The agent name will be normalized (lowercase with hyphens) and saved to `.github/agents/<normalized-name>.md`.

### Examples

#### Create a Security Agent

```bash
npx lousy-agents new --copilot-agent security
```

Creates `.github/agents/security.md` with a template for a security-focused agent.

#### Create a Testing Agent

```bash
npx lousy-agents new --copilot-agent testing
```

Creates `.github/agents/testing.md` with a template for a testing-focused agent.

#### Create an Agent with Multi-word Name

```bash
npx lousy-agents new --copilot-agent "code review"
```

Creates `.github/agents/code-review.md` (spaces are converted to hyphens).

## Help

```bash
npx lousy-agents new --help
```

## Agent File Structure

The generated agent file includes:

```markdown
---
name: agent-name
description: Brief description of what this agent does
---

# agent-name Agent

You are a agent-name agent specialized in {domain/responsibility}.

## Your Role

{Brief description of the agent's expertise and focus area}

## Responsibilities

- {Primary responsibility}
- {Secondary responsibility}
- {Additional responsibility}

## Guidelines

- {Guideline or best practice}
- {Guideline or best practice}
- {Guideline or best practice}

## Example Interactions

{Example of how the agent should respond to typical requests}
```

## Customizing Your Agent

After creation, edit the agent file to:

1. **Update the description** in the YAML frontmatter
2. **Define the agent's role** - what domain or responsibility it focuses on
3. **List responsibilities** - what specific tasks the agent should handle
4. **Add guidelines** - best practices and constraints the agent should follow
5. **Provide examples** - typical interactions and expected responses

## Learn More

- [GitHub Copilot Custom Agents Documentation](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents)
