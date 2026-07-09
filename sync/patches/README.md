# Post-sync patches

`sync/sync-repo.sh` mirrors upstream `modules/` verbatim (`rm -rf` + `cp -a`), so any
local correction to a synced file is wiped on the next sync. Some corrections can't
live outside `modules/` (they're edits to synced content, and the upstream version is
correct *for the upstream build* but wrong for a monorepo-local divergence). Those are
re-applied here, automatically, right after each mirror.

## How it works

After mirroring a repo, `sync-repo.sh` looks for `sync/patches/<repo-name>.sh` (matching
`repos[].name` in `sync/manifest.yml`) and, if present, runs it with the monorepo root as
`$1`. The script re-applies the local edits. Because this runs inside the sync job, the
patched files show up in the per-repo sync PR diff for review before merge.

Patches are **idempotent** and **self-verifying**: each uses a literal string
substitution (`perl \Q..\E`, robust to surrounding upstream drift), does nothing if the
target is already patched, and prints a `PATCH WARN` if neither the original nor the
patched form is found (so a silently-drifted target surfaces in the job log instead of
vanishing).

## Current patches

- **`docs-webui.sh`** and **`docs-main.sh`** — fix broken webui cross-references.
  The monorepo runs `webui` as a **versionless** component (`content/webui/antora.yml`
  `version: ~`, a deliberate "single rolling component" design — see the repo README),
  whereas upstream `docs-webui` is **versioned** (`version: 'next'`). Upstream authors
  its cross-refs as `{latest-webui-version}@webui:…` / `@owncloud_web:…`; a version
  qualifier only resolves against a *versioned* component, so in the versionless monorepo
  these render as a broken image and dead xrefs. The patches strip the version qualifier
  so the refs target the versionless component directly. (One `docs-main` ref is a
  separate upstream typo — a `server` xref that mistakenly uses the `webui` version
  attribute — corrected to the `server` attribute.)

## Adding a patch

Create `sync/patches/<repo-name>.sh` (see the existing ones as a template): take the repo
root as `$1`, source `sync/patches/_lib.sh`, and call `patch_sub <file> <find> <replace>`
for each edit. Keep edits minimal and literal; prefer stripping/replacing a specific token
over rewriting whole lines, so unrelated upstream changes to the same line don't defeat the
match.
