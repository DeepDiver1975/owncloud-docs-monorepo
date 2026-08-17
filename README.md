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
| server | 11.0, 10.16, 10.15 | no 11.0 branch upstream yet; master is the 11.0 line and is `latest` |
| ocis | 8.3 (dev), 8.2, 8.1, 8.0, 7.3 | master→8.3 (prerelease); 8.2 branch is `latest` |
| webui | — | single rolling component (versionless) |
| desktop | 7.2 (dev), 7.1, 6.0, 5.3 | master→7.2 (prerelease); 7.1 branch is `latest` |
| ios | 12.7, 12.6 | 12.7 branch is `latest` (released 2026-05-19) |
| android | 4.8 (dev), 4.7 | 4.8 branch imported as prerelease; 4.7 branch is `latest` |

> ⚠️ **Dev version numbers are provisional.** The in-development folders
> (`ocis/8.3`, `desktop/7.2`, `android/4.8`, …) are marked `prerelease: true` and
> carry a `(dev)` `display_version`. They were the upcoming numbers chosen at
> import time — rename the folder + drop `prerelease` on actual release.
>
> On release rollover, three things move together: drop `prerelease` +
> `display_version` from the released folder's `antora.yml`, repoint
> `sync/manifest.yml` (`master` → the *next* dev folder, release branch → the
> released folder), and bump the `latest-*`/`previous-*` attributes in
> `global-attributes.yml`.

## Build locally

```sh
npm ci
npm run antora     # build to public/
npm run pagefind   # inject static search index into public/pagefind/
npm run serve      # http-server on :8080
```

Node 22 is recommended (matches CI).
