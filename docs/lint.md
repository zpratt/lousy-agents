# `lint` Command

Validates agent skill frontmatter in `.github/skills/*/SKILL.md` files. Discovers all skills in the repository, checks YAML frontmatter for required and recommended fields, and reports diagnostics with line numbers.

## Features

- **Automatic Discovery**: Finds all `SKILL.md` files under `.github/skills/` subdirectories
- **Frontmatter Validation**: Checks for required fields (`name`, `description`) and validates their format
- **Line-Level Diagnostics**: Reports errors and warnings with exact line numbers
- **Directory Name Matching**: Warns when skill name doesn't match its directory name
- **Exit Codes**: Returns non-zero exit code when errors are found, enabling CI integration

## Usage

### Basic Usage

Run from your project root:

```bash
npx @lousy-agents/cli lint
```

This will:

1. Discover all `SKILL.md` files in `.github/skills/` subdirectories
2. Parse and validate YAML frontmatter in each file
3. Report diagnostics (errors and warnings) with file paths and line numbers

### What It Validates

**Required fields** (errors if missing):

- `name` — Skill name (must be lowercase with hyphens, matching directory name)
- `description` — Brief description of what the skill does

**Format rules**:

- Name must be lowercase with hyphens (e.g., `github-actions-debug`)
- Name should match the skill's directory name
- YAML frontmatter must be present and valid

### Examples

#### Lint All Skills

```bash
npx @lousy-agents/cli lint
```

#### No Skills Found

If no skills exist in `.github/skills/`, the command outputs an informational message:

```
No skills found in .github/skills/
```

#### Successful Lint

```
Discovered 2 skill(s)
✔ .github/skills/code-review/SKILL.md: OK
✔ .github/skills/testing/SKILL.md: OK
All skills passed lint checks
```

#### Lint With Warnings

```
Discovered 1 skill(s)
⚠ .github/skills/testing/SKILL.md:2 [description]: Description is too short
Skill lint passed with 1 warning(s)
```

#### Lint With Errors

```
Discovered 1 skill(s)
✖ .github/skills/testing/SKILL.md:1: Missing YAML frontmatter
Skill lint failed: 1 error(s), 0 warning(s)
```

## Help

```bash
npx @lousy-agents/cli lint --help
```

## CI Integration

The `lint` command returns a non-zero exit code when errors are found, making it suitable for CI pipelines:

```yaml
- name: Lint agent skills
  run: npx @lousy-agents/cli lint
```
