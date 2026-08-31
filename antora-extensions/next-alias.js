'use strict'

/**
 * Publish a `next` version segment as a tree of redirect stubs, so the legacy
 * `…/next/…` documentation URLs keep resolving.
 *
 * On the pre-monorepo site `next` was the build of each product's upstream
 * `master` branch (sync/manifest.yml still records those mappings). This repo
 * publishes real version numbers only -- there is deliberately no `next`, `dev` or
 * `master` folder (see README, "Only explicit version numbers as folder names") --
 * so every inbound `/<product>/next/<path>` link and every indexed `next` page
 * dead-ended after the cutover.
 *
 * The successor of `master` is the in-development line, which lives at its real
 * number marked `prerelease: true`. So per component the `next` segment mirrors:
 *
 *   1. the newest prerelease version, if the component has one
 *      (ocis -> 8.3, desktop -> 7.2, android -> 4.8), else its latest release;
 *   2. plus, where (1) is a prerelease, the latest RELEASE version as a fallback
 *      layer, so a page that the dev line dropped still lands on live content
 *      instead of a 404. mirrorPages() never overwrites a claimed path, so the
 *      prerelease always wins where both have the page.
 *
 * Every stub therefore points one hop at a real version, never at /latest/.
 *
 * This mirrors what antora-extensions/latest-alias.js does for `latest`; the
 * catalog mechanics are shared in lib/alias-tree.js. As there, the tree only
 * works on a static host because `redirect_facility: static` (site.yml) renders
 * each alias as a <meta http-equiv="refresh"> stub.
 */
const { mirrorPages, mirrorMoveRedirects } = require('./lib/alias-tree')

module.exports.register = function () {
  const NEXT = 'next'

  // Antora exposes the newest prerelease as component.latestPrerelease; the scan
  // of component.versions (sorted newest first) is a fallback so a change in that
  // property cannot silently turn every `next` stub into a `latest` duplicate.
  const newestPrerelease = (component) =>
    component.latestPrerelease || component.versions.find((version) => version.prerelease)

  this.once('documentsConverted', ({ contentCatalog }) => {
    contentCatalog.getComponents().forEach((component) => {
      // The ROOT component is the versionless site landing page, published at the
      // site root: legacy docs-main had no `next` segment either, so a /next/ tree
      // here would invent URLs rather than rescue them. Every other component --
      // including the versionless `webui`, whose legacy URLs were ALL /webui/next/**
      // because docs-webui only ever had master -- gets one.
      if (component.name === 'ROOT') return

      const latest = component.latest
      const target = newestPrerelease(component) || latest
      // Nothing to alias: no versions at all, or a real version already named
      // `next` (there is none today -- this guards a future folder from being
      // shadowed by its own redirect tree).
      if (!target || target.version === NEXT) return

      mirrorPages(contentCatalog, component, target.version, NEXT)
      mirrorMoveRedirects(contentCatalog, component, target.version, NEXT)

      // Fallback layer (2). Skipped when the target IS the latest release, which
      // is also the versionless case (webui: both are version '').
      if (latest && latest.version !== target.version) {
        mirrorPages(contentCatalog, component, latest.version, NEXT)
        mirrorMoveRedirects(contentCatalog, component, latest.version, NEXT)
      }
    })
  })
}
