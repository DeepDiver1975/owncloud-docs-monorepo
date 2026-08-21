'use strict'

// Guards the `uses:` refs in .github/workflows/ against the owncloud org's
// Actions policy (owncloud/admin: actions-allowlist.yml). That policy sets
// `allowed_actions: selected` together with `sha_pinning_required: true`, so an
// action referenced by a movable tag -- `actions/checkout@v7` -- is rejected
// even though `actions/*` is allowed as GitHub-owned. GitHub enforces this
// BEFORE any job is created: the whole run ends as `startup_failure` with no
// jobs and no logs, which also means the required `build` check never reports.
//
// Keeping the assertion here makes the breakage visible from `npm test` instead
// of only from a push that nobody can debug from the Actions UI.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const WORKFLOWS = path.join(__dirname, '..', '.github', 'workflows')

// `uses: owner/repo[/subdir]@ref` plus the trailing `# vX.Y.Z` comment, if any.
// Local (`./…`) and container (`docker://…`) refs are not action repositories
// and are out of scope for the pinning policy.
const USES = /^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)['"]?\s*(?:#\s*(.*))?$/

function actionRefs () {
  const refs = []
  for (const file of fs.readdirSync(WORKFLOWS)) {
    if (!/\.ya?ml$/.test(file)) continue
    const lines = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8').split('\n')
    lines.forEach((line, i) => {
      const m = line.match(USES)
      if (!m) return
      const [, ref, comment] = m
      if (ref.startsWith('./') || ref.startsWith('docker://')) return
      refs.push({ where: `${file}:${i + 1}`, ref, comment: comment || '' })
    })
  }
  return refs
}

const REFS = actionRefs()

test('the workflows reference at least one action', () => {
  // A silent zero-match parse would make every assertion below vacuously pass.
  assert.ok(REFS.length > 0, `no \`uses:\` refs found under ${WORKFLOWS}`)
})

test('every action is pinned to a full-length commit SHA', () => {
  const unpinned = REFS
    .filter(({ ref }) => !/@[0-9a-f]{40}$/.test(ref))
    .map(({ where, ref }) => `${where}: ${ref}`)
  assert.deepEqual(
    unpinned,
    [],
    'movable refs are rejected by the org policy (sha_pinning_required) and fail the run at startup'
  )
})

test('every pinned action records its human-readable version in a comment', () => {
  // The SHA alone is unreviewable, and Dependabot needs the `# vX.Y.Z` marker
  // to know which version a pin currently represents.
  const undocumented = REFS
    .filter(({ comment }) => !/^v\d+(\.\d+)*/.test(comment.trim()))
    .map(({ where, ref }) => `${where}: ${ref}`)
  assert.deepEqual(undocumented, [], 'pinned actions missing a `# vX.Y.Z` version comment')
})
