# Publishing to npm with Semantic Release

This guide documents the setup required to automate npm package publishing for this npm workspace monorepo using [semantic-release](https://github.com/semantic-release/semantic-release).

## Table of Contents

- [Overview](#overview)
- [Package Naming](#package-naming)
- [Prerequisites](#prerequisites)
- [Setup Steps](#setup-steps)
  - [1. Configure workspace package manifests and release targets](#1-configure-workspace-package-manifests-and-release-targets)
  - [2. Create Release Workflow](#2-create-release-workflow)
  - [3. Configure npm publishing credentials](#3-configure-npm-publishing-credentials)
  - [4. Tag Existing Version (If Applicable)](#4-tag-existing-version-if-applicable)
- [Commit Message Convention](#commit-message-convention)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)

## Overview

Semantic-release automates the release workflow for the publishable workspace packages:

1. Analyzes commit messages to determine the next version
2. Generates release notes automatically
3. Updates the package version
4. Publishes the configured workspace packages to npm
5. Creates a GitHub release with changelog

## Package Naming

### Published Packages in This Monorepo

The repository root package is private. Publishable packages live under `packages/*`:

| Package | Workspace | Notes |
|---------|-----------|-------|
| `@lousy-agents/cli` | `packages/cli` | Main scaffolding CLI |
| `@lousy-agents/mcp` | `packages/mcp` | MCP server package |
| `@lousy-agents/agent-shell` | `packages/agent-shell` | npm script-shell telemetry |

The current automated semantic-release configuration publishes `@lousy-agents/cli` and `@lousy-agents/mcp` from `.releaserc.json`.

Using a scoped package name under an npm organization provides several benefits:

| Benefit | Description |
|---------|-------------|
| **Namespace ownership** | The `@lousy-agents` scope is tied to an npm organization you control |
| **Multiple packages** | Publish related packages such as `@lousy-agents/cli`, `@lousy-agents/mcp`, and `@lousy-agents/agent-shell` under one scope |
| **No naming conflicts** | Avoid potential conflicts with existing or future unscoped packages |
| **Team collaboration** | npm organizations allow adding team members with different access levels |
| **Clear branding** | Users immediately recognize packages from your project |

### Prerequisites for Organization Scope

Before publishing, you must create the `lousy-agents` organization on npm:

1. Go to [npmjs.com/org/create](https://www.npmjs.com/org/create)
2. Create the organization with name `lousy-agents`
3. Free organizations can publish unlimited public packages

### Alternative: Unscoped Package

The unscoped name `lousy-agents` is currently available on npm. This is simpler for users to install but:

- Anyone could publish similar-sounding packages
- If you publish more packages, there's no clear relationship between them
- Potential for "typosquatting" confusion

### Visibility

By default:

- **Scoped packages** are private by default; publishing them as **public** is free (a paid plan is only required for **private** scoped packages)
- **Unscoped packages** are public by default

To publish a scoped package as public for free, use:

```bash
npm publish --access public
```

Or configure in `package.json`:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

## Prerequisites

Before setting up semantic-release, ensure you have:

1. **npm account** at [npmjs.com](https://www.npmjs.com/signup)
2. **npm CLI version 11 or later** - Recommended for modern npm provenance and workspace publishing support. Check with `npm --version`
3. **Repository access** with write permissions
4. **Conventional commits** - Start using the commit message convention (see below)

## Setup Steps

### 1. Configure workspace package manifests and release targets

The monorepo keeps the root `package.json` private and marks each publishable workspace package individually:

```diff
// package.json (root)
{
  "private": true,
  "workspaces": [
    "packages/core",
    "packages/cli",
    "packages/mcp",
    "packages/action",
    "packages/agent-shell"
  ]
}
```

Each published workspace package needs its own `name`, `repository.directory`, `publishConfig`, `files`, and `bin` fields. For example:

```json
{
  "name": "@lousy-agents/mcp",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zpratt/lousy-agents.git",
    "directory": "packages/mcp"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "files": ["dist"],
  "bin": {
    "lousy-agents-mcp": "dist/mcp-server.js"
  }
}
```

The release targets live in `.releaserc.json`:

```json
{
  "branches": ["main"],
  "plugins": [
    ["@semantic-release/npm", { "pkgRoot": "packages/cli" }],
    ["@semantic-release/npm", { "pkgRoot": "packages/mcp" }],
    "@semantic-release/github"
  ]
}
```

### 2. Create Release Workflow

Create `.github/workflows/release.yml`:

```yaml
---
name: Release

'on':
  workflow_run:
    workflows: [CI]
    types:
      - completed
    branches:
      - main

permissions:
  contents: read # for checkout

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    timeout-minutes: 15
    # Only run on main repository, not forks, and only if CI succeeded
    if: >
      github.repository == 'zpratt/lousy-agents' &&
      github.event.workflow_run.conclusion == 'success'
    permissions:
      contents: write # to create GitHub releases
      issues: write # to comment on released issues
      pull-requests: write # to comment on released PRs
      id-token: write # for provenance and attestations
      attestations: write # for build provenance attestation

    steps:
      - name: Checkout
        # v6.0.2
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup mise
        # v3.6.1
        uses: jdx/mise-action@5228313ee0372e111a38da051671ca30fc5a96db
        with:
          github_token: ${{ github.token }}

      - name: Cache npm dependencies
        # v5.0.3
        uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306
        with:
          path: ~/.npm
          key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-npm-

      - name: Install dependencies
        run: npm ci

      - name: Verify package integrity
        run: npm audit signatures

      - name: Build
        run: mise run build

      - name: Attest build provenance
        uses: actions/attest-build-provenance@a2bbfa25375fe432b6a289bc6b6cd05ecd0c4c32  # v4.1.0
        with:
          subject-path: 'packages/*/dist/**/*'

      - name: Release
        env:
          GITHUB_TOKEN: ${{ github.token }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx semantic-release@25.0.2
```

**Key configuration notes:**

| Setting | Purpose |
|---------|---------|
| `workflow_run` trigger | Ensures release only runs after CI workflow succeeds |
| `workflow_run.conclusion == 'success'` | Additional check to confirm CI passed |
| `fetch-depth: 0` | Required - semantic-release needs full git history |
| `persist-credentials: false` | Security best practice when using GITHUB_TOKEN |
| `mise run build` | Builds the publishable workspace packages from the repo root |
| `attestations: write` and provenance step | Generates build provenance for published artifacts |
| `NPM_TOKEN` | Authenticates npm publishing for the release job |
| `npx semantic-release@25.0.2` | Pins the release tool to an exact version |
| `if: github.repository == '...'` | Prevents running on forks |

### 3. Configure npm publishing credentials

The current workflow publishes with an npm automation token stored as `NPM_TOKEN` in GitHub Actions secrets.

#### Step 3a: Initial Manual Publish (Required for New Packages)

For a brand new package, you must do an initial manual publish first:

```bash
npm run build
npm publish --workspace=packages/mcp --access public
```

Publish from the individual workspace you are releasing, for example:

```bash
npm publish --workspace=packages/cli --access public
```

#### Step 3b: Add `NPM_TOKEN` to GitHub Actions

1. Create an npm automation token with publish access to the `@lousy-agents` scope
2. Add it to the repository as the `NPM_TOKEN` Actions secret
3. Confirm the release workflow can read that secret on `main`

> If you later switch to npm trusted publishing, update `.github/workflows/release.yml` and this guide together so the documented flow stays accurate.

### 4. Tag Existing Version (If Applicable)

If you've previously released versions manually, ensure the current version is tagged in git:

```bash
# Check the published workspace package version
cat packages/cli/package.json | grep '"version"'

# If version is 0.1.0 and not tagged, create the tag
git tag v0.1.0
git push origin v0.1.0
```

Semantic-release uses git tags to determine what commits are new since the last release.

## Commit Message Convention

Semantic-release uses [Angular Commit Message Convention](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md) by default:

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types and Their Effect on Versioning

| Commit Type | Version Bump | Example |
|-------------|--------------|---------|
| `fix:` | Patch (0.0.X) | `fix: prevent crash when config is missing` |
| `feat:` | Minor (0.X.0) | `feat: add support for monorepo scaffolding` |
| `feat:` with `BREAKING CHANGE:` | Major (X.0.0) | See example below |
| `docs:`, `style:`, `refactor:`, `test:`, `chore:` | No release | `docs: update README` |

### Breaking Change Example

```
feat(init): change default output directory

BREAKING CHANGE: The default output directory changed from `./output` to `./dist`.
Users relying on the previous default must update their scripts.
```

**Note:** The `BREAKING CHANGE:` footer must be in the commit body/footer, not the subject line.

### Tools to Help

- **[commitizen](https://github.com/commitizen/cz-cli)** - Interactive CLI for writing commits
- **[commitlint](https://github.com/conventional-changelog/commitlint)** - Validate commit messages in CI

## How It Works

When you push to `main`:

1. **CI runs tests** via existing CI workflow
2. **Release workflow** analyzes commits since last release
3. **Version determined** based on commit types:
   - `fix:` → patch bump
   - `feat:` → minor bump
   - `BREAKING CHANGE:` → major bump
4. **Workspace package manifests updated** with new versions
5. **Configured workspace packages published** to npm
6. **Provenance generated** automatically for built artifacts
7. **GitHub release created** with auto-generated release notes
8. **Git tag created** (e.g., `v1.2.0`)

If no releasable commits are found, no release is created.

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `ERELEASEBRANCHES` | Ensure you have a `main` or `master` branch |
| `ENOPKG` | Ensure each published workspace has its own `package.json` and that the published workspace package is not marked `"private": true` |
| `EINVALIDNPMTOKEN` | Recreate the npm automation token or update the `NPM_TOKEN` secret |
| No release created | Ensure commits follow conventional format |
| "Unable to authenticate" | Verify the npm token is valid for the `@lousy-agents` scope and available to the workflow |
| `ENOWORKSPACE` | Verify the package path in `.releaserc.json` matches the workspace directory |

### Publishing Credentials Not Working?

1. **Check the `NPM_TOKEN` secret**: Make sure it exists and still has publish access
2. **Verify package access**: Confirm the token can publish under the `@lousy-agents` scope
3. **Check `.releaserc.json`**: Each `pkgRoot` must point at the correct workspace
4. **Check the build output**: `mise run build` must produce each workspace `dist/` directory before release

### Private Dependencies

If you have private npm dependencies, use a separate read-only token for dependency installation so your publish token is not reused for installs:

```yaml
- name: Install dependencies
  run: npm ci
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_READ_TOKEN }}
```

Use [granular access tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-granular-access-tokens-on-the-website) with read-only permissions for this purpose.

### Debug Mode

To see detailed logs, run semantic-release locally in dry-run mode:

```bash
npx semantic-release --dry-run --debug
```

### Verify Commit Analysis

Check what version would be released:

```bash
npx semantic-release --dry-run
```

## Additional Resources

- [semantic-release documentation](https://github.com/semantic-release/semantic-release)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers)
- [Angular Commit Convention](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
