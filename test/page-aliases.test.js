'use strict'

// Guards for the `:page-aliases:` attributes that keep old URLs alive after a
// page moves. Antora resolves each entry as a resource ID (`module:path/page.adoc`)
// and publishes a redirect stub at the resulting URL. It does NOT validate the
// entry: stray whitespace in `ROOT: security/security.adoc` becomes part of the
// target path, so the stub lands at `/ocis/<version>/ security/security.html`
// -- a directory whose name starts with a space, reachable only as `%20security`
// -- while the URL the alias was meant to rescue still 404s. The build stays
// green, which is why this needs a test.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const CONTENT = path.join(ROOT, 'content')
const PUBLIC = path.join(ROOT, 'public')

function walk (dir, match, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, match, found)
    if (match(entry, p)) found.push(p)
  }
  return found
}

// Every `:page-aliases:` entry in the content tree, as {file, line, entry}.
// AsciiDoc attributes continue across lines with a trailing `\`, and many server
// pages use that form -- join the continuations or most aliases go unchecked.
function pageAliasEntries () {
  const entries = []
  for (const file of walk(CONTENT, (entry) => entry.isFile() && entry.name.endsWith('.adoc'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith(':page-aliases:')) continue
      let value = lines[i].slice(':page-aliases:'.length)
      for (let j = i; value.trimEnd().endsWith('\\') && j + 1 < lines.length; j++) {
        value = `${value.trimEnd().slice(0, -1)}${lines[j + 1]}`
      }
      for (const entry of value.split(',')) {
        if (entry.trim()) entries.push({ file: path.relative(ROOT, file), line: i + 1, entry: entry.trim() })
      }
    }
  }
  return entries
}

test('every page-aliases entry is a whitespace-free resource ID', () => {
  const aliases = pageAliasEntries()
  // Sanity check on the collector itself: a parsing regression that silently
  // matched nothing would make the assertion below pass without checking anything.
  assert.ok(aliases.length > 100, `only found ${aliases.length} page-aliases entries -- parser broken?`)
  const malformed = aliases
    .filter(({ entry }) => /\s/.test(entry))
    .map(({ file, line, entry }) => `${file}:${line} -> "${entry}"`)
  assert.deepEqual(
    malformed,
    [],
    'page-aliases entries must not contain whitespace -- Antora folds it into the published path'
  )
})

// The ocis security page moved from the ROOT module to the admin module, and its
// `ROOT:security/security.adoc` alias is what keeps the pre-8.0 URL alive. That
// alias is the one the stray space broke, so assert the rescued URL positively:
// "no spaces in the output" alone would also be satisfied by no stub at all.
test('the relocated ocis security page keeps its old URL alive', (t) => {
  if (!fs.existsSync(path.join(PUBLIC, 'ocis'))) {
    t.skip('public/ not built (run `npm run antora` to enable)')
    return
  }
  const aliased = pageAliasEntries().filter(
    ({ file, entry }) => /^content\/ocis\/[^/]+\/modules\/admin\/pages\/security\/security\.adoc$/.test(file) &&
      entry === 'ROOT:security/security.adoc'
  )
  assert.ok(aliased.length > 0, 'no ocis admin security page declares the ROOT:security/security.adoc alias')
  const broken = []
  for (const { file } of aliased) {
    const version = file.split('/')[2]
    const stub = path.join(PUBLIC, 'ocis', version, 'security', 'security.html')
    if (!fs.existsSync(stub)) {
      broken.push(`ocis/${version}/security/security.html is missing`)
      continue
    }
    const target = (fs.readFileSync(stub, 'utf8').match(/url=([^"]+)/) || [])[1]
    if (!target) broken.push(`ocis/${version}/security/security.html is not a redirect stub`)
    else if (!fs.existsSync(path.join(path.dirname(stub), target))) {
      broken.push(`ocis/${version}/security/security.html redirects to ${target}, which does not exist`)
    }
  }
  assert.deepEqual(broken, [], 'the page-aliases stub for the moved ocis security page is missing or dangling')
})

test('no page is published under a path containing a space', (t) => {
  if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
    t.skip('public/ not built (run `npm run antora` to enable)')
    return
  }
  const spaced = walk(PUBLIC, (entry) => entry.name.includes(' ')).map((p) => path.relative(PUBLIC, p))
  assert.deepEqual(
    spaced,
    [],
    'published paths must not contain spaces -- they are only reachable as %20 URLs (check :page-aliases: entries)'
  )
})
