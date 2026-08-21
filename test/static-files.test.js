'use strict'

// Build-output guards for the root-level static files (robots.txt). Antora only
// publishes a UI file at the site ROOT when ui/supplemental/ui.yml lists it
// under `static_files`; every other file in ui/supplemental/ is classified as an
// asset and lands under `assets/` instead -- which is how robots.txt got lost
// when the docs site moved from the docs-ui bundle into this monorepo. These
// tests assert against the generated public/ tree and skip when the site has not
// been built yet (run `npm run antora`).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')

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

test('root static files are not published under the UI output dir', (t) => {
  if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
    t.skip('public/ not built (run `npm run antora` to enable)')
    return
  }
  // A missing/incomplete ui.yml sends the file to assets/ instead of the root,
  // where no crawler looks -- and the site would still build green.
  assert.ok(
    !fs.existsSync(path.join(PUBLIC, 'assets', 'robots.txt')),
    'robots.txt was published as a UI asset (is it listed in ui/supplemental/ui.yml static_files?)'
  )
  // ui.yml is consumed by the UI loader; it must never be published itself.
  assert.ok(!fs.existsSync(path.join(PUBLIC, 'assets', 'ui.yml')), 'ui.yml leaked into the build output')
})
