#!/usr/bin/env bash
#
# Post-sync patch for docs-webui. See sync/patches/README.md.
#
# webui is a versionless component in the monorepo (content/webui/antora.yml version: ~),
# but upstream authors this image ref with a version qualifier
# ({latest-webui-version}@owncloud_web:...), which only resolves against a versioned
# component. Strip the qualifier so it targets the versionless component directly.
set -euo pipefail

ROOT_DIR="${1:?usage: docs-webui.sh <repo-root>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
. "$SCRIPT_DIR/_lib.sh"

patch_sub "$ROOT_DIR/content/webui/modules/ROOT/pages/index.adoc" \
  'image:{latest-webui-version}@owncloud_web:' \
  'image:owncloud_web:'
