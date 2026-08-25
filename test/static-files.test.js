'use strict'

// Build-output guards for the root-level static files (robots.txt, llms.txt).
// Antora only publishes a UI file at the site ROOT when ui/supplemental/ui.yml lists it
// under `static_files`; every other file in ui/supplemental/ is classified as an
// asset and lands under `assets/` instead -- which is how robots.txt got lost
// when the docs site moved from the docs-ui bundle into this monorepo. These
// tests assert against the generated public/ tree and skip when the site has not
// been built yet (run `npm run antora`).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { latestByComponent } = require('./helpers/latest-versions')

const ROOT = path.join(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')

// llms.txt pins the version of every product page it links to, because the
// /latest/ URLs are noindex meta-refresh stubs with no documentation in them.
// Pinned versions can go stale, so the guards below hold them against the
// content tree and fail the build on the next release rollover.
const LATEST_BY_COMPONENT = latestByComponent()

// site.url from site.yml -- the two-space indent scopes the match to the `site:`
// block, so the content source's `- url: .` cannot match. Deriving it here keeps
// the Sitemap line in robots.txt from silently outliving a domain change.
const SITE_URL = (fs.readFileSync(path.join(ROOT, 'site.yml'), 'utf8').match(/^ {2}url: (\S+)/m) || [])[1]

function builtOrSkip (t, rel) {
  const p = path.join(PUBLIC, rel)
  if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
    t.skip('public/ not built (run `npm run antora` to enable)')
    return null
  }
  assert.ok(fs.existsSync(p), `${rel} was not published to the site root`)
  return fs.readFileSync(p, 'utf8')
}

// Every `- [text](url): description` entry of an llms.txt list, in file order.
// Malformed list items are reported rather than skipped, so a typo cannot hide a
// link from the checks below.
function llmsLinks (llms) {
  const items = llms.split('\n').filter((line) => line.startsWith('- '))
  const malformed = []
  const links = []
  for (const item of items) {
    const m = item.match(/^- \[([^\]]+)\]\((\S+)\): \S.*$/)
    if (m) links.push({ text: m[1], url: m[2] })
    else malformed.push(item)
  }
  assert.deepEqual(malformed, [], 'llms.txt list items must read `- [text](url): description`')
  return links
}

test('robots.txt is published at the site root and allows all crawlers', (t) => {
  const robots = builtOrSkip(t, 'robots.txt')
  if (robots == null) return
  assert.match(robots, /^User-agent: \*$/m, 'robots.txt has no `User-agent: *` group')
  // An empty Disallow is the explicit "crawl everything" rule (RFC 9309 4.2.1).
  assert.match(robots, /^Disallow:\s*$/m, 'robots.txt does not explicitly allow all paths')
})

test('robots.txt points crawlers at the published sitemap', (t) => {
  const robots = builtOrSkip(t, 'robots.txt')
  if (robots == null) return
  const sitemap = (robots.match(/^Sitemap: (\S+)$/m) || [])[1]
  assert.equal(sitemap, `${SITE_URL}/sitemap.xml`, 'Sitemap line does not match site.url from site.yml')
  // The advertised sitemap must be a file we actually publish, not a 404.
  assert.ok(fs.existsSync(path.join(PUBLIC, 'sitemap.xml')), 'advertised sitemap.xml is not in the build output')
})

test('llms.txt is published at the site root in the llmstxt.org format', (t) => {
  const llms = builtOrSkip(t, 'llms.txt')
  if (llms == null) return
  // The convention is strict about the head of the file: a single H1 naming the
  // site, then a blockquote summarising it. See https://llmstxt.org/
  const h1s = llms.split('\n').filter((line) => line.startsWith('# '))
  assert.equal(h1s.length, 1, 'llms.txt must have exactly one `# ` H1')
  assert.match(llms, /^# \S/, 'llms.txt must open with its H1')
  assert.match(llms, /^> \S/m, 'llms.txt has no `> ` blockquote summary')
  assert.ok(llmsLinks(llms).length > 0, 'llms.txt lists no links')
})

test('every llms.txt link points at a page this build publishes', (t) => {
  const llms = builtOrSkip(t, 'llms.txt')
  if (llms == null) return
  const offsite = []
  const missing = []
  for (const { url } of llmsLinks(llms)) {
    if (!url.startsWith(`${SITE_URL}/`)) {
      offsite.push(url)
      continue
    }
    const rel = url.slice(SITE_URL.length + 1)
    if (!fs.existsSync(path.join(PUBLIC, rel))) missing.push(rel)
  }
  assert.deepEqual(
    { offsite, missing },
    { offsite: [], missing: [] },
    `llms.txt links must be absolute ${SITE_URL} URLs resolving to a published page`
  )
})

test('llms.txt links skip the /latest/ redirect stubs', (t) => {
  const llms = builtOrSkip(t, 'llms.txt')
  if (llms == null) return
  // antora-extensions/latest-alias.js publishes /latest/ as meta-refresh stubs
  // carrying `robots: noindex` and no content, so they are worthless to the
  // crawlers llms.txt exists for. Link the real version instead.
  const stubs = llmsLinks(llms).map(({ url }) => url).filter((url) => url.includes('/latest/'))
  assert.deepEqual(stubs, [], 'llms.txt must link real versions, not the /latest/ redirect stubs')
})

test('every version pinned in llms.txt is the current release', (t) => {
  const llms = builtOrSkip(t, 'llms.txt')
  if (llms == null) return
  const stale = []
  for (const { url } of llmsLinks(llms)) {
    if (!url.startsWith(`${SITE_URL}/`)) continue
    const [component, version] = url.slice(SITE_URL.length + 1).split('/')
    // Versionless components (webui) and the root-level landing pages have no
    // version segment to check.
    const latest = LATEST_BY_COMPONENT[component]
    if (!latest || version === undefined) continue
    if (version !== latest) stale.push(`/${component}/${version}/ (current release is ${latest})`)
  }
  assert.deepEqual(
    stale,
    [],
    'llms.txt pins a version that is no longer current -- update ui/supplemental/llms.txt (see README, release rollover)'
  )
})

test('root static files are not published under the UI output dir', (t) => {
  if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
    t.skip('public/ not built (run `npm run antora` to enable)')
    return
  }
  // A missing/incomplete ui.yml sends the file to assets/ instead of the root,
  // where no crawler looks -- and the site would still build green.
  for (const name of ['robots.txt', 'llms.txt']) {
    assert.ok(
      !fs.existsSync(path.join(PUBLIC, 'assets', name)),
      `${name} was published as a UI asset (is it listed in ui/supplemental/ui.yml static_files?)`
    )
  }
  // ui.yml is consumed by the UI loader; it must never be published itself.
  assert.ok(!fs.existsSync(path.join(PUBLIC, 'assets', 'ui.yml')), 'ui.yml leaked into the build output')
})
