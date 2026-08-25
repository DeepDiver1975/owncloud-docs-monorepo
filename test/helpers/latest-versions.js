'use strict'

// Each multi-version component's latest NON-prerelease version, derived from the
// content tree so a version rollover cannot leave a test asserting yesterday's
// numbers. Mirrors how Antora computes component.latest: the highest version that
// is not marked `prerelease`. Shared by latest-alias.test.js (the redirect target
// the extension points its `latest` and component-root stubs at) and by
// static-files.test.js (the versions llms.txt is allowed to link to).

const fs = require('node:fs')
const path = require('node:path')

const CONTENT = path.join(__dirname, '..', '..', 'content')

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

module.exports = { latestByComponent, compareVersions }
