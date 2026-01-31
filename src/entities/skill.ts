/**
 * Core domain entity for GitHub Copilot Agent Skills.
 * Handles name normalization and SKILL.md content generation.
 */

/**
 * Normalizes a skill name to lowercase with hyphens.
 * Handles spaces, mixed case, multiple spaces, and leading/trailing spaces.
 */
export function normalizeSkillName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Generates the SKILL.md content for a Copilot Agent Skill.
 * Includes YAML frontmatter, documentation link, and example structure.
 */
export function generateSkillContent(skillName: string): string {
    const normalizedName = normalizeSkillName(skillName);

    return `---
name: ${normalizedName}
description: Brief description of what this skill does and when Copilot should use it
---

<!-- 
This is a GitHub Copilot Agent Skill for repository-level use.
Learn more: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
-->

# ${normalizedName}

{Brief description of what this skill teaches Copilot to do}

## When to Use This Skill

Copilot should use this skill when:

- {Trigger condition 1}
- {Trigger condition 2}
- {Trigger condition 3}

## Instructions

{Detailed step-by-step instructions for Copilot to follow}

1. {Step 1}
2. {Step 2}
3. {Step 3}

## Guidelines

- {Guideline or best practice}
- {Guideline or best practice}
- {Guideline or best practice}

## Examples

{Examples of inputs and expected outputs or behaviors}

### Example 1: {Title}

{Description of the example scenario and expected behavior}
`;
}
