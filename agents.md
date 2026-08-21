# AI Agent Guidelines for ownCloud Docs

This file provides context for AI coding agents (Claude Code, GitHub Copilot, Cursor, etc.) working in this repository.

## Repository Overview
- **Product family:** Documentation
- **Primary language(s):** JavaScript, AsciiDoc
- **Build system:** npm (Antora + Pagefind)
- **Test framework:** `node --test` (`npm test`), plus the Antora build itself (`npm run antora`)
- **CI system:** GitHub Actions (build & deploy to GitHub Pages)

## Architecture & Key Paths

This is the consolidated documentation **monorepo**. It supersedes the previous
9-repo setup (1 orchestrator + 7 content repos + a custom UI repo).

- `site.yml` -- Antora playbook; all content sources are local
- `content/<product>/<version>/` -- documentation content; products are `main`, `server`, `webui`, `ocis`, `desktop`, `android`, `ios`
- `antora-extensions/` -- custom Antora extensions (`comp-version`, `latest-alias`, `sitemap-cleanup`, `load-global-site-attributes`)
- `asciidoc-extensions/` -- custom AsciiDoc extensions (`tabs`, `remote-include-processor`)
- `ui/supplemental/` -- supplemental files layered onto the stock Antora default UI
- `global-attributes.yml` -- site-wide AsciiDoc attributes
- `sync/` -- the retired upstream import tooling (`manifest.yml`, `patches/`); kept for provenance
- `test/` -- Node test suite
- `package.json` -- npm scripts

## Development Conventions
- **Branching:** `main`
- **Commit messages:** Conventional Commits; DCO sign-off required (`git commit -s`)
- **PR process:** Open a PR against `main`. All CI checks must pass. PR titles are linted for Conventional Commits format.

## Build & Test Commands
```bash
# Build
npm run antora          # Antora site build only
npm run build           # Antora build + Pagefind search index

# Test
npm test                # node --test test/*.test.js

# Preview
npm run antora-local && npm run serve   # http://localhost:8080
```

Node 22 is used in CI.

## Important Constraints
- All contributions must be compatible with the **AGPL-3.0** license
- Do not introduce new **copyleft-licensed dependencies** (GPL, AGPL, LGPL, MPL) without explicit discussion in an issue first. This is especially important for repos migrating to Apache 2.0.
- Do not introduce new dependencies without discussion in an issue first
- **Versions are folders, not branches.** A new documentation version is a new directory under `content/<product>/<version>/` -- never a git branch, and never a backport.
- **The upstream mirror is retired.** Content is authored in this repository. Do not re-introduce a sync from the archived `docs-*` repos.

## OSPO Policy Constraints

### GitHub Actions
- **Only** use actions owned by `owncloud`, created by GitHub (`actions/*`), verified on the GitHub Marketplace, or verified by the ownCloud Maintainers.
- Pin all actions to their full commit SHA (not tags): `uses: actions/checkout@<SHA> # vX.Y.Z`
- Never introduce actions from unverified third parties.

### Dependency Management
- Dependabot is configured for automated dependency updates.
- Review and merge Dependabot PRs as part of regular maintenance.
- Do not introduce new dependencies without discussion in an issue first.

### Git Workflow
- **Rebase policy**: Always rebase; never create merge commits. Use `git pull --rebase` and `git rebase` before pushing.
- **Signed commits**: All commits **must** be PGP/GPG signed (`git commit -S -s`).
- **DCO sign-off**: Every commit needs a `Signed-off-by` line (`git commit -s`).
- **Conventional Commits & Squash Merge**: Use the [Conventional Commits](https://www.conventionalcommits.org/) format. This repository squash-merges, so the PR title becomes the commit message on `main` -- apply Conventional Commits format to PR titles as well. A GitHub Actions workflow enforces this.

## Context for AI Agents
- Match existing code style
- Do not refactor unrelated code in the same PR
- Write tests for new functionality
- Keep PRs focused and atomic
