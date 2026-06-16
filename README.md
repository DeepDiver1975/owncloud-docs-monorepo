# ownCloud Docs — Monorepo (experimental)

Consolidated, single-repository prototype of the ownCloud documentation. It
replaces the previous 9-repo setup (1 orchestrator + 7 content repos + a custom
UI repo) with **one monorepo** built by Antora.

Live (GitHub Pages): https://deepdiver1975.github.io/owncloud-docs-monorepo/

## What changed vs. the legacy setup

| Area | Legacy | Here |
|------|--------|------|
| Repos | 9 | 1 (this repo) |
| Versions | git branches + backporting | **folders** under `content/<product>/<version>/` |
| Branch model | `master` + N version branches per repo | `master` only |
| Search | Elasticsearch + custom index extension + CI secrets | **Pagefind** (static, build-time) |
| UI | custom Gulp/Browserify/jQuery `docs-ui` + `ui-bundle.zip` | **stock Antora default UI** + `ui/supplemental/` |
| Content sources | 7 remote GitHub repos × branches | local folders |
| Global attributes | fetched from GitHub at build | local `global-attributes.yml` |

Antora + AsciiDoc are kept (native multi-version/multi-component support).

## Layout

```
site.yml                 Antora playbook (local content only)
package.json             antora + asciidoctor + pagefind toolchain
antora-extensions/       comp-version, sitemap-cleanup, global-attributes loader
asciidoc-extensions/     tabs, remote-include
global-attributes.yml    site-wide AsciiDoc attributes (local)
ui/supplemental/         branding + Pagefind modal search on the stock UI
content/<product>/<ver>/ each version is a folder with its own antora.yml
.github/workflows/ci.yml build → pagefind → deploy to GitHub Pages
```

## Versions imported

| Product | Versions (folder) | Notes |
|---------|-------------------|-------|
| main | — | ROOT landing component (versionless) |
| server | 11.0 (dev), 10.16, 10.15 | |
| ocis | 8.0 (dev), 7.3 | master imported as 8.0; supersedes old 8.0 branch |
| webui | — | single rolling component (versionless) |
| desktop | 7.1 (dev), 6.0, 5.3 | |
| ios | 12.6 | latest-only per spec (released branch as-is) |
| android | 4.7 | latest-only per spec (released branch as-is) |

> ⚠️ **Dev version numbers are provisional.** The in-development folders
> (`server/11.0`, `ocis/8.0`, `desktop/7.1`) are marked `prerelease: true` and
> carry a `(dev)` `display_version`. They were the upcoming numbers chosen at
> import time — rename the folder + drop `prerelease` on actual release.

## Build locally

```sh
npm ci
npm run antora     # build to public/
npm run pagefind   # inject static search index into public/pagefind/
npm run serve      # http-server on :8080
```

Node 22 is recommended (matches CI).
