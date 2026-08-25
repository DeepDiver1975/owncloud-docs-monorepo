'use strict'

// Build-output guards for antora-extensions/latest-alias.js. The extension can
// only be exercised through a real Antora build (it needs the content catalog),
// so these tests assert against the generated public/ tree and skip when the
// site has not been built yet (run `npm run antora`).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { latestByComponent } = require('./helpers/latest-versions')

const PUBLIC = path.join(__dirname, '..', 'public')

// The redirect target the extension points its `latest` and component-root stubs
// at: each multi-version component's latest non-prerelease version.
const LATEST_BY_COMPONENT = latestByComponent()

function builtOrSkip (t, rel) {
  const p = path.join(PUBLIC, rel)
  if (!fs.existsSync(p)) {
    t.skip(`${rel} not built (run \`npm run antora\` to enable)`)
    return null
  }
  return fs.readFileSync(p, 'utf8')
}

test('every multi-version component root redirects to its latest version', (t) => {
  if (!fs.existsSync(path.join(PUBLIC, 'ocis'))) {
    t.skip('public/ not built (run `npm run antora` to enable)')
    return
  }
  const missing = []
  const wrongTarget = []
  for (const [component, version] of Object.entries(LATEST_BY_COMPONENT)) {
    const html = fs.existsSync(path.join(PUBLIC, component, 'index.html'))
      ? fs.readFileSync(path.join(PUBLIC, component, 'index.html'), 'utf8')
      : null
    if (html == null) {
      missing.push(`/${component}/index.html`)
      continue
    }
    // It must be a meta-refresh redirect stub pointing at the latest version,
    // one hop straight to real content (…/<version>/…), not to /latest/.
    const m = html.match(/url=([^"]+)/)
    if (!m || m[1].indexOf(`${version}/`) < 0 || /\/latest\//.test(m[1])) {
      wrongTarget.push(`/${component}/ -> ${m ? m[1] : '(no refresh)'} (want ${version})`)
    }
  }
  assert.deepEqual(
    { missing, wrongTarget },
    { missing: [], wrongTarget: [] },
    'component-root redirects missing or pointing at the wrong version'
  )
})

test('the component-root redirect target page actually exists', (t) => {
  const html = builtOrSkip(t, path.join('ocis', 'index.html'))
  if (html == null) return
  const m = html.match(/url=([^"]+)/)
  assert.ok(m, '/ocis/index.html is not a meta-refresh redirect stub')
  // Resolve the relative target against /ocis/ and confirm it is a real file.
  const target = path.join(PUBLIC, 'ocis', m[1])
  assert.ok(fs.existsSync(target), `redirect target ${m[1]} does not exist under public/ocis/`)
})
