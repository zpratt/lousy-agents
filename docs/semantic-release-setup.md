# Publishing to npm with Semantic Release

This guide documents the setup required to automate npm package publishing for this project using [semantic-release](https://github.com/semantic-release/semantic-release).

## Table of Contents

- [Overview](#overview)
- [Package Naming](#package-naming)
- [Prerequisites](#prerequisites)
- [Setup Steps](#setup-steps)
  - [1. Update package.json](#1-update-packagejson)
  - [2. Create Release Workflow](#2-create-release-workflow)
  - [3. Configure npm Trusted Publishing](#3-configure-npm-trusted-publishing)
  - [4. Tag Existing Version (If Applicable)](#4-tag-existing-version-if-applicable)
- [Commit Message Convention](#commit-message-convention)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)

## Overview

Semantic-release automates the entire package release workflow:

1. Analyzes commit messages to determine the next version
2. Generates release notes automatically
3. Updates the package version
4. Publishes to npm
5. Creates a GitHub release with changelog

## Package Naming

### Using a Scoped Package with npm Organization

**Package name:** `@lousy-agents/cli`

Using a scoped package name under an npm organization provides several benefits:

| Benefit | Description |
|---------|-------------|
| **Namespace ownership** | The `@lousy-agents` scope is tied to an npm organization you control |
| **Future packages** | Easily publish additional packages under the same scope (e.g., `@lousy-agents/core`, `@lousy-agents/mcp`) |
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

- **Scoped packages** are private (require paid npm account for public)
- **Unscoped packages** are public

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
2. **npm CLI version 11.5.1 or later** - Required for trusted publishing. Check with `npm --version`
3. **Repository access** with write permissions
4. **Conventional commits** - Start using the commit message convention (see below)

## Setup Steps

### 1. Update package.json

Make the following changes to `package.json`:

```diff
{
-   "name": "lousy-agents",
+   "name": "@lousy-agents/cli",
    "version": "0.1.0",
-   "private": true,
    "type": "module",
+   "repository": {
+     "type": "git",
+     "url": "git+https://github.com/zpratt/lousy-agents.git"
+   },
+   "publishConfig": {
+     "access": "public"
+   },
+   "files": [
+     "dist"
+   ],
    ...
}
```

**Changes explained:**

| Change | Reason |
|--------|--------|
| `name` → `@lousy-agents/cli` | Scoped package name for namespace ownership |
| Remove `"private": true` | Required to allow npm publishing |
| Add `repository` | Required for semantic-release to link GitHub and npm |
| Add `publishConfig.access` | Makes the scoped package public |
| Add `files` | Specifies which files to include in the npm package |

### 2. Create Release Workflow

Create `.github/workflows/release.yml`:

```yaml
---
name: Release

'on':
  push:
    branches:
      - main

permissions:
  contents: read # for checkout

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    # Only run on main repository, not forks
    if: github.repository == 'zpratt/lousy-agents'
    permissions:
      contents: write # to create GitHub releases
      issues: write # to comment on released issues
      pull-requests: write # to comment on released PRs
      id-token: write # for npm trusted publishing (OIDC)

    steps:
      - name: Checkout
        # v4.2.2
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup mise
        # v3.5.1
        uses: jdx/mise-action@6d1e696aa24c1aa1bcc1adea0212707c71ab78a8
        with:
          github_token: ${{ github.token }}

      - name: Cache npm dependencies
        uses: actions/cache@8b402f58fbc84540c8b491a91e594a4576fec3d7  # v5.0.2
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
        run: npm run build

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx semantic-release@24
```

**Key configuration notes:**

| Setting | Purpose |
|---------|---------|
| `fetch-depth: 0` | Required - semantic-release needs full git history |
| `persist-credentials: false` | Security best practice when using GITHUB_TOKEN |
| `id-token: write` | Enables npm trusted publishing via OIDC |
| `npx semantic-release@24` | Pins to major version for stability |
| `if: github.repository == '...'` | Prevents running on forks |

### 3. Configure npm Trusted Publishing

Trusted publishing eliminates the need for long-lived npm tokens by using GitHub's OIDC (OpenID Connect) identity. With trusted publishing, npm provenance attestations are automatically generated for your packages, providing cryptographic proof of where and how your package was built.

**Note:** Trusted publishing requires npm CLI version 11.5.1 or later.

#### Step 3a: Initial Manual Publish (Required for New Packages)

For a brand new package, you must do an initial manual publish first:

```bash
npm run build
npm publish --access public
```

#### Step 3b: Add Trusted Publisher on npm

1. Go to your package settings page on [npmjs.com](https://www.npmjs.com)
2. Find the "**Trusted Publisher**" section
3. Click **Add Trusted Publisher** and select **GitHub Actions**
4. Configure with these values:

   | Field | Value |
   |-------|-------|
   | Organization or user | `zpratt` |
   | Repository | `lousy-agents` |
   | Workflow filename | `release.yml` |
   | Environment name | (leave blank) |

**Note:** Use your GitHub username (`zpratt`) for the "Organization or user" field, not the npm organization name. This refers to the GitHub repository owner.

**Important:** The workflow filename must be the file that triggers the release process (e.g., `release.yml`), not any downstream reusable workflows it may call.

#### Step 3c: (Recommended) Restrict Token Access

After verifying trusted publishing works, restrict traditional token-based publishing for enhanced security:

1. Navigate to your package's **Settings** → **Publishing access** on npmjs.com
2. Select **"Require two-factor authentication and disallow tokens"**
3. Save your changes

This ensures only trusted publishing from your CI/CD workflow can publish the package.

### 4. Tag Existing Version (If Applicable)

If you've previously released versions manually, ensure the current version is tagged in git:

```bash
# Check current version in package.json
cat package.json | grep '"version"'

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
4. **Package.json updated** with new version
5. **Package published** to npm via trusted publishing
6. **Provenance generated** automatically (cryptographic proof of build origin)
7. **GitHub release created** with auto-generated release notes
8. **Git tag created** (e.g., `v1.2.0`)

If no releasable commits are found, no release is created.

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `ERELEASEBRANCHES` | Ensure you have a `main` or `master` branch |
| `ENOPKG` | Package.json must not have `"private": true` |
| `EINVALIDNPMTOKEN` | Configure trusted publishing or check NPM_TOKEN |
| No release created | Ensure commits follow conventional format |
| "Unable to authenticate" | Verify workflow filename matches exactly (case-sensitive, including `.yml` extension) |
| Self-hosted runner fails | Trusted publishing only supports GitHub-hosted runners |

### Trusted Publishing Not Working?

1. **Verify npm CLI version**: Run `npm --version` - must be 11.5.1 or later
2. **Check workflow filename**: Must match exactly what's configured on npmjs.com (case-sensitive)
3. **Verify `id-token: write` permission**: Required in your workflow for OIDC
4. **Check runner type**: Self-hosted runners are not currently supported

### Private Dependencies

If you have private npm dependencies, trusted publishing only applies to `npm publish`. You'll still need a read-only token for installing private packages:

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
