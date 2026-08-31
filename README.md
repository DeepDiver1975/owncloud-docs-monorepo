# ownCloud Documentation

<!-- OSPO-managed README | Generated: 2026-08-21 | v2 -->

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE) [![ownCloud OSPO](https://img.shields.io/badge/OSPO-ownCloud-blue)](https://kiteworks.com/opensource)

Consolidated, single-repository prototype of the ownCloud documentation. It
replaces the previous 9-repo setup (1 orchestrator + 7 content repos + a custom
UI repo) with **one monorepo** built by Antora.

Live (GitHub Pages): https://doc.owncloud.com

## What changed vs. the legacy setup

| Area | Legacy | Here |
|------|--------|------|
| Repos | 9 | 1 (this repo) |
| Versions | git branches + backporting | **folders** under `content/<product>/<version>/` |
| Branch model | `master` + N version branches per repo | `main` only |
| Search | Elasticsearch + custom index extension + CI secrets | **Pagefind** (static, build-time) |
| UI | custom Gulp/Browserify/jQuery `docs-ui` + `ui-bundle.zip` | **stock Antora default UI** + `ui/supplemental/` |
| Content sources | 7 remote GitHub repos × branches | local folders, authored here (upstream mirror retired) |
| Global attributes | fetched from GitHub at build | local `global-attributes.yml` |

Antora + AsciiDoc are kept (native multi-version/multi-component support).

## Layout

```
site.yml                 Antora playbook (local content only)
package.json             antora + asciidoctor + pagefind toolchain
antora-extensions/       comp-version, latest/next-alias, sitemap-cleanup, global-attributes loader
asciidoc-extensions/     tabs, remote-include
global-attributes.yml    site-wide AsciiDoc attributes (local)
ui/supplemental/         branding + Pagefind modal search on the stock UI
content/<product>/<ver>/ each version is a folder with its own antora.yml
sync/                    retired upstream-mirror tooling, kept as provenance
.github/workflows/ci.yml build → pagefind → deploy to GitHub Pages
```

## Versioning model

### One folder per version

Each product version is a folder `content/<product>/<version>/` carrying its own
`antora.yml`, whose `version:` key repeats the folder name
(`content/ocis/8.2/antora.yml` → `version: '8.2'`). `site.yml` aggregates them by
glob (`content/ocis/*`, `content/server/*`, …), so **the published version set is
exactly the folder set on disk** — adding or removing a version needs no playbook
edit.

Two components are versionless and have no version folder: `content/main` (the
`ROOT` landing component, `version: ~`) and `content/webui` (a single rolling
component).

### Only explicit version numbers as folder names

Folder names are pure version numbers — `8.2`, `10.16`, `12.7`. There is
deliberately **no `master`, `next`, `dev`, or `latest` folder**, and none should
be added:

- **A moving path segment is a broken promise.** `…/ocis/next/` points at a
  different release every few months, so links, bookmarks, and indexed search
  results silently retarget to content the reader was never sent to.
  `…/ocis/8.3/` means one release forever.
- **Release rollover moves no URLs.** The in-development line already lives at
  its real number, marked `prerelease: true` with a `display_version: '8.3 (dev)'`
  (see `content/ocis/8.3/antora.yml`). Shipping it means dropping those two keys —
  no path changes, no redirects. With a `next` folder, every page of the release
  would change its URL on ship day.
- **The version is legible everywhere it matters** — folder, path, PR diff, and
  URL. A reviewer reads `content/ocis/8.2/…` in a diff and knows the target
  version without consulting a branch→version mapping.
- **`latest` and `next` are generated, never source folders.**
  `antora-extensions/latest-alias.js` publishes `/<product>/latest/` as a tree of
  redirect stubs pointing at the newest non-prerelease version; `site.yml`
  deliberately does not set `latest_version_segment`.
  `antora-extensions/next-alias.js` does the same for `/<product>/next/`, the
  version segment the legacy site used for each product's `master` build — those
  URLs are still linked and indexed, so they redirect to the closest live page
  instead of 404ing. Its target is the component's prerelease version, falling
  back to the latest release (and, per page, to the latest release for anything
  the dev line dropped). Both trees are `noindex` and stay out of the sitemap.

See the dev-version note under [Versions imported](#versions-imported) for what
moves together on release rollover.

### Backporting

There are no branches, so there is nothing to cherry-pick. Backporting means
**making the same edit in every version folder that should carry it**:

```
content/ocis/8.3/modules/.../page.adoc   original edit
content/ocis/8.2/modules/.../page.adoc   same edit
content/ocis/8.1/modules/.../page.adoc   same edit
```

One PR then carries the change for every affected version: the reviewer sees the
whole backport at once, and no version is deferred to a follow-up that never
happens. The cost is N copies of the hunk instead of one commit replayed N times;
in exchange there is no conflict resolution, which matters because these docs
genuinely diverge per version (paths, attribute values, screenshots). Text that
is truly version-independent belongs in a shared partial or a
`global-attributes.yml` attribute rather than in N copies.

> ℹ️ **`modules/` is authored here.** The upstream mirror is retired — the
> legacy `owncloud/docs-*` repos no longer feed this repo, so every file under
> `content/<product>/<version>/` including `modules/` is edited directly in this
> repo and a PR against `main` is the only way content changes land. Nothing
> overwrites your edits; the backport rule above is the whole mechanism.
>
> `sync/` is kept as a historical record of which upstream repo and branch each
> folder was imported from. `sync/sync-repo.sh` mirror-*replaces* `modules/` and
> would discard local edits, so it refuses to run — see `sync/manifest.yml`.

### Dropping a version

Delete the folder:

```sh
rm -r content/server/10.15
```

That is the whole content change — `site.yml` needs no edit, because it globs.
Three bits of bookkeeping remain:

1. Update the hand-maintained `latest-*` / `previous-*` / `current-*` attributes
   in `global-attributes.yml` if the removed version appeared in them. The
   `latest` and `next` aliases themselves move automatically (`latest-alias.js`
   derives its target from the newest non-prerelease version, `next-alias.js` from
   the `prerelease` flag).
2. **Server only:** drop the segment from `PUBLISHED_VERSIONS` in
   `ui/supplemental/js/go-redirect.js`; `test/go-redirect.test.js` fails the build
   if that list drifts from the published `public/server/*` trees. Only real
   version numbers are maintained there — `latest` and `next` are permanent
   entries, because they are generated redirect trees rather than versions. Legacy
   `go.php?to=` links for the removed version then fall back to `latest`, which is
   the intended safety net.
3. Accept that the version's URLs now 404 — nothing redirects a retired version
   tree. Drop a version only when its inbound links are acceptable casualties, or
   add redirects deliberately.

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
> `display_version` from the released folder's `antora.yml`, bump the
> `latest-*`/`previous-*` attributes in `global-attributes.yml`, and bump the
> version segments of the affected links in `ui/supplemental/llms.txt` (those URLs
> are pinned deliberately, because `/latest/` is a `noindex` redirect stub).
> `test/static-files.test.js` fails the build while any of the three disagree.
>
> Dropping `prerelease` also moves `/<product>/next/` on to the newly opened dev
> line by itself — `next-alias.js` reads the flag, so there is nothing to bump.
>
> Then open the next dev line by copying the released folder to its new number and
> re-adding the two keys. **Server only:** that copy publishes a new
> `public/server/<version>/` tree, so add the segment to `PUBLISHED_VERSIONS` in
> `ui/supplemental/js/go-redirect.js` in the same commit — `test/go-redirect.test.js`
> fails while that list and the published trees disagree, in both directions (the
> mirror of step 2 under [Dropping a version](#dropping-a-version)).
>
> The branch references in the Notes column above are **historical**: they record
> which upstream `owncloud/docs-*` branch each folder was last imported from
> before the mirror was retired. They are no longer live mappings.

## Build locally

```sh
npm ci
npm run antora     # build to public/
npm run pagefind   # inject static search index into public/pagefind/
npm run serve      # http-server on :8080
```

Node 22 is recommended (matches CI).

## Community & Support

**[Star](https://github.com/owncloud/docs.owncloud.com)** this repo and **Watch** for release notifications!

- [ownCloud Website](https://owncloud.com)
- [Community Discussions](https://github.com/orgs/owncloud/discussions)
- [Matrix Chat](https://app.element.io/#/room/#owncloud:matrix.org)
- [Documentation](https://doc.owncloud.com)
- [Enterprise Support](https://owncloud.com/contact-us/)
- [OSPO Home](https://kiteworks.com/opensource)

## Contributing

We welcome contributions! Please read the [Contributing Guidelines](CONTRIBUTING.md)
and our [Code of Conduct](CODE_OF_CONDUCT.md) before getting started.

### Workflow

- **Rebase Early, Rebase Often!** We use a rebase workflow. Always rebase on the target branch before submitting a PR.
- **Dependabot**: Automated dependency updates are managed via Dependabot. Review and merge dependency PRs promptly.
- **Signed Commits**: All commits **must** be PGP/GPG signed. See [GitHub's signing guide](https://docs.github.com/en/authentication/managing-commit-signature-verification).
- **DCO Sign-off**: Every commit must carry a `Signed-off-by` line:
  ```
  git commit -s -S -m "your commit message"
  ```
- **GitHub Actions Policy**: Workflows may only use actions that are (a) owned by `owncloud`, (b) created by GitHub (`actions/*`), (c) verified in the GitHub Marketplace, or (d) verified by the ownCloud Maintainers. Pin every action to its full commit SHA.

## Security

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities at **<https://security.owncloud.com>** -- see [SECURITY.md](SECURITY.md).

Bug bounty: [YesWeHack ownCloud Program](https://yeswehack.com/programs/owncloud-bug-bounty-program)

## License

This project is licensed under the [AGPL-3.0](LICENSE).

## About the ownCloud OSPO

The [Kiteworks Open Source Program Office](https://kiteworks.com/opensource), operating under
the [ownCloud](https://owncloud.com) brand, launched on May 5, 2026, to steward the open source
ecosystem around ownCloud's products. The OSPO ensures transparent governance, license compliance,
community health, and sustainable collaboration between the open source community and
[Kiteworks](https://www.kiteworks.com), which acquired ownCloud in 2023.

- **OSPO Home**: <https://kiteworks.com/opensource>
- **GitHub**: <https://github.com/owncloud>
- **ownCloud**: <https://owncloud.com>

For questions about the OSPO or licensing, contact ospo@kiteworks.com.

### License Migration to Apache 2.0

The OSPO is driving a strategic relicensing of ownCloud repositories toward the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), following
the [Apache Software Foundation's third-party license policy](https://www.apache.org/legal/resolved.html).

Individual repositories will migrate as their audit is completed. The LICENSE file
in each repo reflects its **current** license status (not the target).

**Current license: AGPL-3.0** (Category X per Apache policy -- cannot be included in Apache-2.0 works).

Migration prerequisites for this repository:

- **CLA/DCO coverage**: All past contributors must have signed agreements permitting relicensing
- **Copyleft dependency audit**: All AGPL/GPL dependencies must be replaced or isolated
- **KDE heritage review**: Any code with KDE-era copyrights requires legal analysis
- **Complete relicensing**: AGPL-3.0 is a strong copyleft license; migration requires full relicensing of all files, not just a header change
