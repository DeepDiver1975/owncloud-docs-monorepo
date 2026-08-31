'use strict'

// Guards for antora-extensions/next-alias.js, which rescues the legacy `…/next/…`
// URLs. Two layers:
//
//   1. Build-output guards -- what the published tree must look like. Like
//      latest-alias.js the extension needs a real content catalog, so these assert
//      against public/ and skip when the site has not been built (`npm run antora`).
//   2. Catalog unit tests against a fake content catalog, for the precedence rules
//      the current content cannot exercise: today every release page also exists in
//      the prerelease line, so the release-version fallback layer never fires in a
//      real build, and a regression there would go unnoticed.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { latestByComponent, nextTargetByComponent } = require('./helpers/latest-versions')

const PUBLIC = path.join(__dirname, '..', 'public')

// ---------------------------------------------------------------------------
// 1. Build-output guards
// ---------------------------------------------------------------------------

// component -> the real version its `next` tree must redirect to ('' for the
// versionless webui, whose pages live directly under /webui/).
const NEXT_TARGET_BY_COMPONENT = nextTargetByComponent()

function notBuilt (t) {
  if (fs.existsSync(path.join(PUBLIC, 'ocis'))) return false
  t.skip('public/ not built (run `npm run antora` to enable)')
  return true
}

// The refresh target of a redirect stub, relative to the stub's own directory, or
// null when the stub is missing / is not a stub at all.
function refreshTarget (...segments) {
  const file = path.join(PUBLIC, ...segments)
  if (!fs.existsSync(file)) return null
  const m = fs.readFileSync(file, 'utf8').match(/url=([^"]+)/)
  return m ? m[1] : null
}

// Every .html file under `dir`, as paths relative to `dir`.
function htmlFiles (dir, base = dir, found = []) {
  if (!fs.existsSync(dir)) return found
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) htmlFiles(p, base, found)
    else if (entry.name.endsWith('.html')) found.push(path.relative(base, p))
  }
  return found
}

test('every component publishes a /next/ tree redirecting to its target version', (t) => {
  if (notBuilt(t)) return
  const missing = []
  const wrongTarget = []
  for (const [component, version] of Object.entries(NEXT_TARGET_BY_COMPONENT)) {
    const url = refreshTarget(component, 'next', 'index.html')
    if (url == null) {
      missing.push(`/${component}/next/index.html`)
      continue
    }
    // One hop straight to real content: the target version's own segment for a
    // multi-version component, the component root for a versionless one -- never
    // /latest/ (a redirect to a redirect) and never back into /next/.
    const expected = version ? `${version}/` : '../'
    if (url.indexOf(expected) < 0 || /\/latest\//.test(url) || /\/next\//.test(url)) {
      wrongTarget.push(`/${component}/next/ -> ${url} (want ${expected})`)
    }
  }
  assert.deepEqual(
    { missing, wrongTarget },
    { missing: [], wrongTarget: [] },
    '/next/ redirects missing or pointing at the wrong version'
  )
})

test('every /next/ redirect target page actually exists', (t) => {
  if (notBuilt(t)) return
  const broken = []
  for (const component of Object.keys(NEXT_TARGET_BY_COMPONENT)) {
    const url = refreshTarget(component, 'next', 'index.html')
    if (url == null) continue // reported by the test above
    // Resolve the relative target against /<component>/next/ on disk.
    if (!fs.existsSync(path.join(PUBLIC, component, 'next', url))) {
      broken.push(`/${component}/next/ -> ${url}`)
    }
  }
  assert.deepEqual(broken, [], '/next/ redirect targets do not exist under public/')
})

test('the versionless webui redirects /webui/next/ into /webui/ proper', (t) => {
  if (notBuilt(t)) return
  const url = refreshTarget('webui', 'next', 'index.html')
  assert.ok(url, '/webui/next/index.html is not a meta-refresh redirect stub')
  const target = path.relative(path.join(PUBLIC, 'webui'), path.join(PUBLIC, 'webui', 'next', url))
  assert.equal(target, 'index.html', `/webui/next/ must redirect to /webui/index.html, got ${target}`)
})

// The union fallback: /next/ mirrors the prerelease line, then fills the gaps from
// the latest release, so a page the dev line dropped does not dead-end.
test('every page of the latest release has a /next/ counterpart', (t) => {
  if (notBuilt(t)) return
  const missing = []
  for (const [component, latest] of Object.entries(latestByComponent())) {
    for (const page of htmlFiles(path.join(PUBLIC, component, latest))) {
      if (!fs.existsSync(path.join(PUBLIC, component, 'next', page))) {
        missing.push(`/${component}/next/${page.split(path.sep).join('/')}`)
      }
    }
  }
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} release pages have no /next/ stub`)
})

test('a page missing from the prerelease line redirects to the latest release', (t) => {
  if (notBuilt(t)) return
  const latest = latestByComponent()
  const dropped = []
  for (const [component, target] of Object.entries(NEXT_TARGET_BY_COMPONENT)) {
    // Only components whose `next` target is a prerelease can have such a gap.
    if (!target || target === latest[component]) continue
    for (const page of htmlFiles(path.join(PUBLIC, component, latest[component]))) {
      if (fs.existsSync(path.join(PUBLIC, component, target, page))) continue
      dropped.push({ component, latest: latest[component], page })
    }
  }
  if (!dropped.length) {
    t.skip('no page is published in a release but absent from its prerelease line')
    return
  }
  const wrong = dropped
    .map(({ component, latest: version, page }) => {
      const url = refreshTarget(component, 'next', page)
      return { where: `/${component}/next/${page.split(path.sep).join('/')}`, url, version }
    })
    .filter(({ url, version }) => !url || url.indexOf(`${version}/`) < 0)
    .map(({ where, url }) => `${where} -> ${url || '(no refresh)'}`)
  assert.deepEqual(wrong, [], 'release-only pages must redirect to the latest release under /next/')
})

// SEO: the `next` tree is redirect stubs, not content. sitemap-cleanup.js runs in
// `latest-per-component` mode and should keep only the latest release version.
test('no sitemap advertises a /next/ URL', (t) => {
  if (notBuilt(t)) return
  const offenders = []
  for (const file of fs.readdirSync(PUBLIC)) {
    if (!/^sitemap.*\.xml$/.test(file)) continue
    const urls = fs.readFileSync(path.join(PUBLIC, file), 'utf8').match(/<loc>([^<]*)<\/loc>/g) || []
    for (const url of urls) if (/\/next\//.test(url)) offenders.push(`${file}: ${url}`)
  }
  assert.deepEqual(offenders, [], 'redirect stubs must stay out of the sitemap')
})

// ---------------------------------------------------------------------------
// 2. Catalog unit tests
// ---------------------------------------------------------------------------

const { register } = require('../antora-extensions/next-alias')

// A publishable page, shaped like the fields lib/alias-tree.js reads.
const page = (component, version, relative, family = 'page') => ({
  src: { component, version, module: 'ROOT', family, relative },
  // Versionless components publish without a version segment, as Antora does.
  pub: { url: '/' + [component, version, relative.replace(/\.adoc$/, '.html')].filter(Boolean).join('/') },
  out: { path: 'irrelevant' },
})

// A `page-aliases` move-redirect that Antora registers during conversion: an alias
// at `relative` whose `rel` is the page it was renamed to.
const moveRedirect = (component, version, relative, target) =>
  Object.assign(page(component, version, relative, 'alias'), { rel: target })

// The slice of Antora's ContentCatalog that lib/alias-tree.js uses.
function fakeCatalog (components, files) {
  const added = []
  const key = (src) => [src.component, src.version, src.module, src.family, src.relative].join('|')
  const all = () => files.concat(added)
  return {
    added,
    getComponents: () => components,
    findBy: ({ component, version, family }) =>
      all().filter((f) => f.src.component === component && f.src.version === version && f.src.family === family),
    getById: (src) => all().find((f) => key(f.src) === key(src)),
    addFile: (file) => {
      // Antora throws on a duplicate alias, which is what the getById guards in
      // lib/alias-tree.js exist to prevent -- reproduce that here.
      if (all().some((f) => key(f.src) === key(file.src))) throw new Error(`Duplicate alias: ${key(file.src)}`)
      added.push(file)
      return file
    },
  }
}

// Run the extension over a fake catalog and return the `next` aliases it added, as
// { <relative>: <target pub url> }.
function nextAliases (components, files) {
  const contentCatalog = fakeCatalog(components, files)
  const handlers = {}
  register.call({ once: (event, fn) => (handlers[event] = fn) })
  handlers.documentsConverted({ contentCatalog })
  return Object.fromEntries(
    contentCatalog.added.map((f) => {
      assert.equal(f.src.version, 'next', `alias added outside the next segment: ${f.src.relative}`)
      assert.equal(f.src.family, 'alias')
      return [f.src.relative, f.rel.pub.url]
    })
  )
}

// ocis-shaped: a prerelease dev line (8.3) on top of the latest release (8.2).
function ocisComponent () {
  const dev = { version: '8.3', prerelease: true }
  const release = { version: '8.2' }
  return { name: 'ocis', versions: [dev, release], latest: release, latestPrerelease: dev }
}

test('the prerelease line wins where both versions publish the page', () => {
  const component = ocisComponent()
  const aliases = nextAliases([component], [
    page('ocis', '8.3', 'shared.adoc'),
    page('ocis', '8.2', 'shared.adoc'),
  ])
  assert.deepEqual(aliases, { 'shared.adoc': '/ocis/8.3/shared.html' })
})

test('a page dropped from the prerelease line falls back to the latest release', () => {
  const component = ocisComponent()
  const aliases = nextAliases([component], [
    page('ocis', '8.3', 'shared.adoc'),
    page('ocis', '8.3', 'dev-only.adoc'),
    page('ocis', '8.2', 'shared.adoc'),
    page('ocis', '8.2', 'dropped.adoc'),
  ])
  assert.deepEqual(aliases, {
    'shared.adoc': '/ocis/8.3/shared.html',
    'dev-only.adoc': '/ocis/8.3/dev-only.html',
    'dropped.adoc': '/ocis/8.2/dropped.html', // the fallback layer
  })
})

test('a page renamed in the prerelease line redirects to its new location', () => {
  // `old.adoc` is still a real page in 8.2 but only a move-redirect in 8.3. The
  // prerelease redirect must win over the older real page, so /next/old.html lands
  // where the dev line says the content now lives.
  const component = ocisComponent()
  const renamed = page('ocis', '8.3', 'new.adoc')
  const aliases = nextAliases([component], [
    renamed,
    moveRedirect('ocis', '8.3', 'old.adoc', renamed),
    page('ocis', '8.2', 'old.adoc'),
  ])
  assert.deepEqual(aliases, {
    'new.adoc': '/ocis/8.3/new.html',
    'old.adoc': '/ocis/8.3/new.html',
  })
})

test('a component with no prerelease line mirrors its latest release', () => {
  const release = { version: '11.0' }
  const component = { name: 'server', versions: [release], latest: release }
  const aliases = nextAliases([component], [page('server', '11.0', 'index.adoc')])
  assert.deepEqual(aliases, { 'index.adoc': '/server/11.0/index.html' })
})

test('a versionless component mirrors its single version', () => {
  // webui: version '' -- the fallback layer must not run a second time over the
  // same version, or Antora would throw "Duplicate alias".
  const only = { version: '' }
  const component = { name: 'webui', versions: [only], latest: only }
  const aliases = nextAliases([component], [page('webui', '', 'index.adoc')])
  assert.deepEqual(aliases, { 'index.adoc': '/webui/index.html' })
})

test('the ROOT landing component gets no next tree', () => {
  const only = { version: '' }
  const component = { name: 'ROOT', versions: [only], latest: only }
  assert.deepEqual(nextAliases([component], [page('ROOT', '', 'index.adoc')]), {})
})

test('a prerelease Antora does not report is still found via versions', () => {
  // component.latestPrerelease is only set when the NEWEST version is a
  // prerelease; the versions scan in next-alias.js is the backstop.
  const dev = { version: '8.3', prerelease: true }
  const release = { version: '8.2' }
  const component = { name: 'ocis', versions: [dev, release], latest: release }
  const aliases = nextAliases([component], [page('ocis', '8.3', 'index.adoc')])
  assert.deepEqual(aliases, { 'index.adoc': '/ocis/8.3/index.html' })
})
