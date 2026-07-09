#!/usr/bin/env bash
#
# Shared helper for post-sync patch scripts (sync/patches/<repo>.sh).
# See sync/patches/README.md for the why and how.
#
# Requires: perl (for literal, drift-robust substitution). Present by default on the
# CI runner (ubuntu-latest) and typical dev machines.

# patch_sub <file> <find> <replace>
#   Replace every literal occurrence of <find> with <replace> in <file>, in place.
#   Idempotent and self-verifying:
#     - already patched (find absent, replace present) -> no-op, silent
#     - target drifted (neither present)               -> PATCH WARN, non-fatal
#   ROOT_DIR (if exported) is only used to shorten log paths.
patch_sub() {
  local file="$1" find="$2" repl="$3"
  local shortname="${file#"${ROOT_DIR:-}"/}"

  if [[ ! -f "$file" ]]; then
    echo "    PATCH WARN: file missing: $shortname" >&2
    return 0
  fi

  if ! grep -qF -- "$find" "$file"; then
    if grep -qF -- "$repl" "$file"; then
      return 0  # already patched
    fi
    echo "    PATCH WARN: target not found in $shortname (upstream may have changed): $find" >&2
    return 0
  fi

  FIND="$find" REPL="$repl" perl -pi -e 's/\Q$ENV{FIND}\E/$ENV{REPL}/g' "$file"
  echo "    patched $shortname"
}
