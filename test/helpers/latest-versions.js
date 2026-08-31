'use strict'

// The version each generated alias segment points at, derived from the content
// tree so a version rollover cannot leave a test asserting yesterday's numbers.
//
// - latestByComponent(): each multi-version component's latest NON-prerelease
//   version, mirroring how Antora computes component.latest (the highest version
//   not marked `prerelease`). Shared by latest-alias.test.js (the redirect target
//   the extension points its `latest` and component-root stubs at) and by
//   static-files.test.js (the versions llms.txt is allowed to link to).
// - nextTargetByComponent(): what antora-extensions/next-alias.js points `next`
//   at -- the newest prerelease version, else the latest release. Used by
//   next-alias.test.js.

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
      // Versionless components (main, webui) keep their antora.yml one level up,
      // in content/<product>/, so this loop never sees a descriptor for them --
      // which is exactly what should happen: they have no version to compare.
      if (!fs.existsSync(descriptor)) continue
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

// Component name declared by an antora.yml, or undefined if it has none.
function componentName (descriptor) {
  return (fs.readFileSync(descriptor, 'utf8').match(/^name:\s*'?([^'\s]+)/m) || [])[1]
}

// The version antora-extensions/next-alias.js mirrors into `/<component>/next/`:
// the newest `prerelease: true` folder where the component has one, else the
// latest release. Versionless components carry their antora.yml in
// content/<product>/ and have a single version '' -- webui is in here (its legacy
// URLs were all /webui/next/**), the ROOT landing component is deliberately not.
function nextTargetByComponent () {
  const prereleases = {} // component name -> [version, …]
  const versionless = {} // component name -> ''
  for (const product of fs.readdirSync(CONTENT)) {
    const productDir = path.join(CONTENT, product)
    if (!fs.statSync(productDir).isDirectory()) continue
    const own = path.join(productDir, 'antora.yml')
    if (fs.existsSync(own)) {
      const name = componentName(own)
      if (name && name !== 'ROOT') versionless[name] = ''
    }
    for (const entry of fs.readdirSync(productDir)) {
      const descriptor = path.join(productDir, entry, 'antora.yml')
      if (!fs.existsSync(descriptor)) continue
      const yaml = fs.readFileSync(descriptor, 'utf8')
      if (!/^prerelease:\s*true\s*$/m.test(yaml)) continue
      const name = componentName(descriptor)
      const version = (yaml.match(/^version:\s*'?([^'\s]+)/m) || [])[1]
      if (!name || !version) continue
      ;(prereleases[name] = prereleases[name] || []).push(version)
    }
  }
  const target = {}
  for (const [name, version] of Object.entries(latestByComponent())) {
    const list = prereleases[name]
    target[name] = list ? list.sort(compareVersions)[list.length - 1] : version
  }
  return Object.assign(target, versionless)
}

module.exports = { latestByComponent, nextTargetByComponent }
