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

### Recommendation: Use a Scoped Package

**Recommended name:** `@zpratt/lousy-agents`

Using a scoped package name is recommended for several reasons:

| Benefit | Description |
|---------|-------------|
| **Namespace ownership** | Scopes are tied to npm usernames or organizations, guaranteeing you own the namespace |
| **Future packages** | Easily publish additional packages under the same scope (e.g., `@zpratt/another-tool`) |
| **No naming conflicts** | Avoid potential conflicts with existing or future unscoped packages |
| **Organization support** | If you create an npm organization later, you can migrate packages easily |
| **Clear attribution** | Users immediately know who maintains the package |

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
2. **Repository access** with write permissions
3. **Conventional commits** - Start using the commit message convention (see below)

## Setup Steps

### 1. Update package.json

Make the following changes to `package.json`:

```diff
{
-   "name": "lousy-agents",
+   "name": "@zpratt/lousy-agents",
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
| `name` → `@zpratt/lousy-agents` | Scoped package name for namespace ownership |
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

Trusted publishing eliminates the need for long-lived npm tokens by using GitHub's OIDC identity.

#### Step 3a: Link Your npm Account to GitHub (if not done)

1. Go to [npmjs.com](https://www.npmjs.com) and sign in
2. Navigate to **Access Tokens** in your account settings
3. Click **Link your GitHub account** if prompted

#### Step 3b: Add Trusted Publisher on npm

1. Go to your package page on npm (after first manual publish) or your [npm access tokens settings](https://www.npmjs.com/settings/~/tokens)
2. Click **Add Trusted Publisher**
3. Configure with these values:

   | Field | Value |
   |-------|-------|
   | Repository owner | `zpratt` |
   | Repository name | `lousy-agents` |
   | Workflow file | `release.yml` |
   | Environment | (leave blank) |

**Note:** For a brand new package, you'll need to do an initial manual publish first:

```bash
npm run build
npm publish --access public
```

After the first publish, configure trusted publishing and subsequent releases will be fully automated.

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
6. **GitHub release created** with auto-generated release notes
7. **Git tag created** (e.g., `v1.2.0`)

If no releasable commits are found, no release is created.

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `ERELEASEBRANCHES` | Ensure you have a `main` or `master` branch |
| `ENOPKG` | Package.json must not have `"private": true` |
| `EINVALIDNPMTOKEN` | Configure trusted publishing or check NPM_TOKEN |
| No release created | Ensure commits follow conventional format |

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
