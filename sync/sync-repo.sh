#!/usr/bin/env bash
#
# sync-repo.sh -- mirror one upstream docs repo's content into this monorepo.
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

echo "==> done: $REPO_NAME"
