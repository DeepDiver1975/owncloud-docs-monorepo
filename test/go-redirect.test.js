'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { resolveGoPhp, MAPPING, fallbackFor, PUBLISHED_VERSIONS } = require('../ui/supplemental/js/go-redirect.js')

const PREFIX = '/owncloud-docs-monorepo/server/latest/'

test('non-go.php paths are left untouched', () => {
  assert.equal(resolveGoPhp('/owncloud-docs-monorepo/server/latest/index.html', ''), null)
  assert.equal(resolveGoPhp('/owncloud-docs-monorepo/server/latest/', ''), null)
  // "cargo.php" must not be mistaken for the go.php endpoint.
  assert.equal(resolveGoPhp('/owncloud-docs-monorepo/server/latest/cargo.php', '?to=admin-sharing'), null)
})

test('a known key redirects to its mapped page under the version root', () => {
  assert.equal(
    resolveGoPhp(PREFIX + 'go.php', '?to=admin-sharing'),
    PREFIX + 'admin_manual/configuration/files/file_sharing_configuration.html'
  )
})

test('a developer key redirects into the developer manual', () => {
  assert.equal(
    resolveGoPhp(PREFIX + 'go.php', '?to=developer-theming'),
    PREFIX + 'developer_manual/core/theming.html'
  )
})

test('a user key redirects into the classic_ui module', () => {
  assert.equal(
    resolveGoPhp(PREFIX + 'go.php', '?to=user-webdav'),
    PREFIX + 'classic_ui/files/access_webdav.html'
  )
})

test('a published version segment is preserved for per-version fidelity', () => {
  const p = '/owncloud-docs-monorepo/server/10.15/'
  assert.equal(
    resolveGoPhp(p + 'go.php', '?to=admin-sharing'),
    p + 'admin_manual/configuration/files/file_sharing_configuration.html'
  )
})

test('an unpublished version segment (concrete current stable) is remapped to latest', () => {
  // Core emits the concrete version (e.g. 10.16), which has no published tree;
  // it must be sent to /server/latest/ where the current stable is published.
  assert.equal(
    resolveGoPhp('/owncloud-docs-monorepo/server/10.16/go.php', '?to=admin-sharing'),
    '/owncloud-docs-monorepo/server/latest/admin_manual/configuration/files/file_sharing_configuration.html'
  )
  // An old, long-unpublished release likewise falls back to latest.
  assert.equal(
    resolveGoPhp('/owncloud-docs-monorepo/server/10.9/go.php', '?to=user-webdav'),
    '/owncloud-docs-monorepo/server/latest/classic_ui/files/access_webdav.html'
  )
})

test('a URL-encoded key (e.g. the well-known-URL key) resolves', () => {
  assert.equal(
    resolveGoPhp(PREFIX + 'go.php', '?to=admin-setup-well-known-URL'),
    PREFIX + 'admin_manual/troubleshooting/general_troubleshooting.html'
  )
})

test('unknown keys fall back by prefix, mirroring the original go.php', () => {
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to=admin-does-not-exist'), PREFIX + 'admin_manual/index.html')
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to=developer-nope'), PREFIX + 'developer_manual/index.html')
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to=user-nope'), PREFIX + 'classic_ui/index.html')
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to=totally-unknown'), PREFIX + 'classic_ui/index.html')
})

test('a missing/empty key falls back to the user manual landing', () => {
  assert.equal(resolveGoPhp(PREFIX + 'go.php', ''), PREFIX + 'classic_ui/index.html')
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to='), PREFIX + 'classic_ui/index.html')
})

test('extra query parameters around to= are ignored', () => {
  assert.equal(
    resolveGoPhp(PREFIX + 'go.php', '?foo=1&to=admin-sharing&bar=2'),
    PREFIX + 'admin_manual/configuration/files/file_sharing_configuration.html'
  )
})

test('a malformed percent-escape degrades to the fallback, never throws', () => {
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to=%'), PREFIX + 'classic_ui/index.html')
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to=admin-%zz'), PREFIX + 'admin_manual/index.html')
})

test('a value containing = is preserved (not truncated at the first =)', () => {
  // No real key contains '=', so this just proves the parser keeps the whole
  // value: "admin-x=y" is unknown -> admin fallback (not silently -> "admin-x").
  assert.equal(resolveGoPhp(PREFIX + 'go.php', '?to=admin-x=y'), PREFIX + 'admin_manual/index.html')
})

test('fallbackFor classifies by key prefix', () => {
  assert.equal(fallbackFor('admin-x'), 'admin_manual/index.html')
  assert.equal(fallbackFor('developer-x'), 'developer_manual/index.html')
  assert.equal(fallbackFor('user-x'), 'classic_ui/index.html')
  assert.equal(fallbackFor('anything-else'), 'classic_ui/index.html')
})

// Guard against version drift: PUBLISHED_VERSIONS must list exactly the server
// version segments the build actually emits under public/server/*.
test('PUBLISHED_VERSIONS matches the built server version segments', (t) => {
  const serverDir = path.join(__dirname, '..', 'public', 'server')
  if (!fs.existsSync(serverDir)) {
    t.skip('public/server not built (run `npm run antora` to enable)')
    return
  }
  const built = fs.readdirSync(serverDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
  assert.deepEqual(
    [...PUBLISHED_VERSIONS].sort(),
    built,
    'PUBLISHED_VERSIONS in go-redirect.js is out of sync with public/server/* — update the list'
  )
})

// Guard against page moves: every mapped target must exist in the built site.
// Skips automatically when the site has not been built yet.
test('every mapped target exists in the built server/latest site', (t) => {
  const base = path.join(__dirname, '..', 'public', 'server', 'latest')
  if (!fs.existsSync(base)) {
    t.skip('public/server/latest not built (run `npm run antora` to enable)')
    return
  }
  const missing = []
  for (const [key, target] of Object.entries(MAPPING)) {
    if (!fs.existsSync(path.join(base, target))) missing.push(`${key} -> ${target}`)
  }
  // Fallback landings must exist too.
  for (const landing of ['admin_manual/index.html', 'developer_manual/index.html', 'classic_ui/index.html']) {
    if (!fs.existsSync(path.join(base, landing))) missing.push(`(fallback) ${landing}`)
  }
  assert.deepEqual(missing, [], 'mapped go.php targets missing from the build:\n' + missing.join('\n'))
})
