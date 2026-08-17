'use strict'

// Build-output guards for antora-extensions/latest-alias.js. The extension can
// only be exercised through a real Antora build (it needs the content catalog),
// so these tests assert against the generated public/ tree and skip when the
// site has not been built yet (run `npm run antora`).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PUBLIC = path.join(__dirname, '..', 'public')
const CONTENT = path.join(__dirname, '..', 'content')

// Each multi-version component's latest NON-prerelease version (the redirect
// target the extension points its `latest` and component-root stubs at),
// derived from the content tree so a version rollover cannot leave this test
// asserting yesterday's numbers. Mirrors how Antora computes component.latest:
// the highest version that is not marked `prerelease`.
function latestByComponent () {
  const versions = {} // component name -> [version, …]
  for (const product of fs.readdirSync(CONTENT)) {
    const productDir = path.join(CONTENT, product)
    if (!fs.statSync(productDir).isDirectory()) continue
    for (const entry of fs.readdirSync(productDir)) {
      const descriptor = path.join(productDir, entry, 'antora.yml')
      if (!fs.existsSync(descriptor)) continue // versionless component
      const yaml = fs.readFileSync(descriptor, 'utf8')
      if (/^prerelease:\s*true\s*$/m.test(yaml)) continue
      const name = (yaml.match(/^name:\s*'?([^'\s]+)/m) || [])[1]
      const version = (yaml.match(/^version:\s*'?([^'\s]+)/m) || [])[1]
      if (!name || !version) continue
      ;(versions[name] = versions[name] || []).push(version)
    }
  }
  const latest = {}
  for (const [name, list] of Object.entries(versions)) {
    latest[name] = list.sort(compareVersions)[list.length - 1]
  }
  return latest
}

// Numeric, segment-wise ascending compare ('10.16' > '10.9', not the string order).
function compareVersions (a, b) {
  const as = a.split('.').map(Number)
  const bs = b.split('.').map(Number)
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const diff = (as[i] || 0) - (bs[i] || 0)
    if (diff) return diff
  }
  return 0
}

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
