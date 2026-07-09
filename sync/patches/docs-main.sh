#!/usr/bin/env bash
#
# Post-sync patch for docs-main. See sync/patches/README.md.
#
# Two broken webui-related cross-references:
#  1) nav.adoc: xref to the versionless webui component carries a version qualifier
#     ({latest-webui-version}@webui:...) -> strip it so it resolves.
#  2) server_releases.adoc: a `server` xref mistakenly uses the *webui* version
#     attribute (upstream typo) -> use the matching `server` attribute instead.
set -euo pipefail

ROOT_DIR="${1:?usage: docs-main.sh <repo-root>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_lib.sh
. "$SCRIPT_DIR/_lib.sh"

patch_sub "$ROOT_DIR/content/main/modules/ROOT/partials/nav.adoc" \
  'xref:{latest-webui-version}@webui:ROOT:index.adoc' \
  'xref:webui:ROOT:index.adoc'

patch_sub "$ROOT_DIR/content/main/modules/ROOT/pages/server_releases.adoc" \
  'xref:{previous-webui-version}@server:classic_ui:index.adoc' \
  'xref:{previous-server-version}@server:classic_ui:index.adoc'
