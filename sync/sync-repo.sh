#!/usr/bin/env bash
#
# sync-repo.sh -- mirror one upstream docs repo's content into this monorepo.
#
# ############ RETIRED -- DO NOT RUN ############
#
# The upstream sync is retired. `.github/workflows/sync-upstream.yml` has been
# deleted and documentation is now authored directly in this repo. This script
# is kept only as a historical record of how the import worked.
#
# Running it would be DESTRUCTIVE: the mirror is `rm -rf` + `cp -a` per
# `sync_paths` entry, so it would silently discard every edit made to
# `content/<product>/<version>/modules/` in this repo since the cutover and
# replace it with the upstream branch state. Refuses to run for that reason;
# remove the guard below only if you genuinely intend a fresh re-import.
#
# ##############################################
#
# Usage:  sync/sync-repo.sh <repo-name>
#         (repo-name must match a `repos[].name` in sync/manifest.yml)
#
# For each branch->folder mapping of the named repo, this shallow-clones the
# upstream branch and MIRRORS each path listed in `sync_paths` into the dest
# folder: the existing <dest>/<path> is removed and replaced with the upstream
# copy. Everything else in <dest> (e.g. the monorepo-managed antora.yml) is left
# untouched. Upstream wins; stale files are dropped.
#
# Requires: git, yq (v4+, mikefarah). Run from the monorepo root, or any cwd --
# paths are resolved against the repo root containing this script's parent.
#
set -euo pipefail

# Retirement guard -- see the header. The mirror is destructive; refuse by
# default so a stray invocation cannot wipe content authored in this repo.
if [[ "${SYNC_UPSTREAM_I_KNOW_THIS_IS_RETIRED:-}" != "1" ]]; then
  cat >&2 <<'EOF'
REFUSING TO RUN: the upstream sync is retired.

Documentation is now authored in this repo. This script mirror-replaces
content/<product>/<version>/modules/ from the upstream owncloud/docs-* branches
(rm -rf + cp -a), which would discard local edits.

sync/manifest.yml is kept only as a record of where each folder was imported
from. If you really want a fresh re-import, re-run with:

  SYNC_UPSTREAM_I_KNOW_THIS_IS_RETIRED=1 sync/sync-repo.sh <repo-name>
EOF
  exit 1
fi

REPO_NAME="${1:-}"
if [[ -z "$REPO_NAME" ]]; then
  echo "usage: $0 <repo-name>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.yml"

if [[ ! -f "$MANIFEST" ]]; then
  echo "manifest not found: $MANIFEST" >&2
  exit 1
fi

# Locate the repo entry in the manifest.
url="$(yq -r ".repos[] | select(.name == \"$REPO_NAME\") | .url" "$MANIFEST")"
if [[ -z "$url" || "$url" == "null" ]]; then
  echo "repo '$REPO_NAME' not found in $MANIFEST" >&2
  exit 1
fi

# sync_paths is a global list shared by all repos.
mapfile -t SYNC_PATHS < <(yq -r '.sync_paths[]' "$MANIFEST")
if [[ ${#SYNC_PATHS[@]} -eq 0 ]]; then
  echo "no sync_paths defined in $MANIFEST" >&2
  exit 1
fi

# Temp workspace for upstream clones; always cleaned up.
WORK_DIR="$(mktemp -d)"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

mapping_count="$(yq -r ".repos[] | select(.name == \"$REPO_NAME\") | .mappings | length" "$MANIFEST")"
echo "==> syncing $REPO_NAME ($url): $mapping_count mapping(s)"

for ((i = 0; i < mapping_count; i++)); do
  branch="$(yq -r ".repos[] | select(.name == \"$REPO_NAME\") | .mappings[$i].branch" "$MANIFEST")"
  dest_rel="$(yq -r ".repos[] | select(.name == \"$REPO_NAME\") | .mappings[$i].dest" "$MANIFEST")"
  dest="$ROOT_DIR/$dest_rel"

  echo "--> branch '$branch' -> $dest_rel"

  if [[ ! -d "$dest" ]]; then
    echo "    ERROR: dest folder does not exist: $dest_rel" >&2
    echo "    (create it and its antora.yml before adding the mapping)" >&2
    exit 1
  fi

  clone_dir="$WORK_DIR/$REPO_NAME-$branch"
  git clone --quiet --depth 1 --branch "$branch" "$url" "$clone_dir"

  for path in "${SYNC_PATHS[@]}"; do
    src="$clone_dir/$path"
    if [[ ! -e "$src" ]]; then
      echo "    WARNING: upstream has no '$path' on branch '$branch' -- skipping" >&2
      continue
    fi
    echo "    mirror $path"
    rm -rf "${dest:?}/$path"
    cp -a "$src" "$dest/$path"
  done
done

# Re-apply monorepo-local corrections to the just-mirrored content. These edits
# live in synced modules/ (so the mirror above wipes them) but are wrong for the
# monorepo build; the patch script re-applies them idempotently. See
# sync/patches/README.md. Missing patch script = nothing to do (most repos).
PATCH_SCRIPT="$SCRIPT_DIR/patches/$REPO_NAME.sh"
if [[ -f "$PATCH_SCRIPT" ]]; then
  echo "--> applying post-sync patches ($REPO_NAME)"
  bash "$PATCH_SCRIPT" "$ROOT_DIR"
fi

echo "==> done: $REPO_NAME"
