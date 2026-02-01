# `new` Command

Creates new resources for your project, including custom GitHub Copilot agents and Agent Skills.

![Demo](../media/new-copilot-agent.gif)

## Options

| Subcommand / Flag | Argument | Description |
|-------------------|----------|-------------|
| `--copilot-agent` | `<name>` | Create a custom GitHub Copilot agent in `.github/agents/` |
| `skill` | `<name>` | Create a GitHub Copilot Agent Skill in `.github/skills/` |

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
npx @lousy-agents/cli new --copilot-agent <name>
```

The agent name will be normalized (lowercase with hyphens) and saved to `.github/agents/<normalized-name>.md`.

### Examples

#### Create a Security Agent

```bash
npx @lousy-agents/cli new --copilot-agent security
```

Creates `.github/agents/security.md` with a template for a security-focused agent.

#### Create a Testing Agent

```bash
npx @lousy-agents/cli new --copilot-agent testing
```

Creates `.github/agents/testing.md` with a template for a testing-focused agent.

#### Create an Agent with Multi-word Name

```bash
npx @lousy-agents/cli new --copilot-agent "code review"
```

Creates `.github/agents/code-review.md` (spaces are converted to hyphens).

## Help

```bash
npx @lousy-agents/cli new --help
```

## Agent File Structure

The generated agent file includes:

```markdown
---
name: agent-name
description: Brief description of what this agent does
---

<!-- 
This is a custom GitHub Copilot agent for repository-level use.
Learn more: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents
-->

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

---

### Agent Skills (`skill`)

Creates a new GitHub Copilot Agent Skill file in `.github/skills/<name>/SKILL.md` with:

- YAML frontmatter with skill name and description
- Template structure for defining when Copilot should use the skill
- Step-by-step instructions section
- Guidelines and examples sections
- Link to official GitHub documentation

Agent Skills teach Copilot how to perform specific tasks within your repository. Unlike agents (which define a persona), skills define reusable procedures that Copilot can invoke when relevant.

### Create an Agent Skill

```bash
npx @lousy-agents/cli new skill <name>
```

The skill name will be normalized (lowercase with hyphens) and saved to `.github/skills/<normalized-name>/SKILL.md`.

### Skill Examples

#### Create a GitHub Actions Debug Skill

```bash
npx @lousy-agents/cli new skill github-actions-debug
```

Creates `.github/skills/github-actions-debug/SKILL.md`.

#### Create a Skill with Multi-word Name

```bash
npx @lousy-agents/cli new skill "database migration"
```

Creates `.github/skills/database-migration/SKILL.md` (spaces are converted to hyphens).

### Skill File Structure

The generated skill file includes:

```markdown
---
name: skill-name
description: Brief description of what this skill does and when Copilot should use it
---

<!--
This is a GitHub Copilot Agent Skill for repository-level use.
Learn more: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
-->

# skill-name

{Brief description of what this skill teaches Copilot to do}

## When to Use This Skill

Copilot should use this skill when:

- {Trigger condition 1}
- {Trigger condition 2}

## Instructions

{Detailed step-by-step instructions for Copilot to follow}

## Guidelines

- {Guideline or best practice}

## Examples

### Example 1: {Title}

{Description of the example scenario and expected behavior}
```

### Customizing Your Skill

After creation, edit the skill file to:

1. **Update the description** in the YAML frontmatter
2. **Define trigger conditions** - when should Copilot use this skill
3. **Write detailed instructions** - step-by-step procedure for Copilot to follow
4. **Add guidelines** - constraints and best practices
5. **Provide examples** - concrete scenarios and expected behaviors

## Learn More

- [GitHub Copilot Custom Agents Documentation](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents)
- [GitHub Copilot Agent Skills Documentation](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
