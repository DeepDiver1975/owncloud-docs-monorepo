'use strict'

/**
 * Publish a `latest` version segment for every multi-version component that
 * mirrors the component's latest NON-prerelease version as static redirect
 * stubs. Antora's built-in latest_version_segment cannot do this on a static
 * host (redirect:from is ignored under redirect_facility: static, and `replace`
 * hides the real version), so we add the alias files ourselves. Under
 * redirect_facility: static each alias renders as a <meta http-equiv="refresh">
 * stub, so it works on GitHub Pages.
 */
module.exports.register = function () {
  const LATEST = 'latest'
  this.once('contentClassified', ({ contentCatalog }) => {
    contentCatalog.getComponents().forEach((component) => {
      const latest = component.latest
      // Skip versionless components (no latest) and any whose latest is already
      // the `latest` segment (nothing to alias to).
      if (!latest || !latest.version || latest.version === LATEST) return
      contentCatalog
        .findBy({ component: component.name, version: latest.version, family: 'page' })
        .forEach((page) => {
          // Only real published pages are valid redirect targets. AsciiDoc
          // partials (_*.adoc include fragments) are in the page family but have
          // no pub/out; aliasing them makes @antora/redirect-producer throw
          // "Cannot read properties of undefined (reading 'url')". Guard on both.
          if (!page.pub || !page.pub.url || !page.out) return
          contentCatalog.addFile({
            src: {
              component: component.name,
              version: LATEST,
              module: page.src.module,
              family: 'alias',
              relative: page.src.relative,
            },
            rel: page,
          })
        })
    })
  })
}
