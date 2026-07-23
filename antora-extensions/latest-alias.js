'use strict'

/**
 * For every multi-version component, publish two things Antora does not emit
 * itself on a static host:
 *
 *   1. A `latest` version segment mirroring the component's latest NON-prerelease
 *      version, so `/<component>/latest/**` redirects to the real version.
 *   2. A component-root redirect (`/<component>/`), so the bare component URL
 *      lands on the latest version's start page instead of the site 404. Antora
 *      resolves `component.url` for internal links but writes no file at the
 *      component root, so `/ocis/` would otherwise 404.
 *
 * Antora's built-in latest_version_segment cannot do (1) on a static host
 * (redirect:from is ignored under redirect_facility: static, and `replace`
 * hides the real version), so we add the alias files ourselves. Under
 * redirect_facility: static each alias renders as a <meta http-equiv="refresh">
 * stub, so both work on GitHub Pages.
 */
module.exports.register = function () {
  const LATEST = 'latest'
  this.once('contentClassified', ({ contentCatalog }) => {
    contentCatalog.getComponents().forEach((component) => {
      const latest = component.latest
      // Skip versionless components (no latest) and any whose latest is already
      // the `latest` segment (nothing to alias to).
      if (!latest || !latest.version || latest.version === LATEST) return

      // (2) Component-root redirect: /<component>/ -> latest version start page.
      // A version-less alias (version: '') publishes to /<component>/index.html,
      // exactly as Antora's own site-root alias publishes to /index.html. Find
      // the latest version's start page the same way Antora does internally
      // (registerComponentVersionStartPage): getById the ROOT index page of that
      // version. That page's `url` is what component.url already resolves to.
      // All components use the default start page (ROOT:index.adoc); a component
      // with a custom start_page simply gets no root redirect (today's behavior)
      // rather than a wrong one.
      const startPage = contentCatalog.getById({
        component: component.name,
        version: latest.version,
        module: 'ROOT',
        family: 'page',
        relative: 'index.adoc',
      })
      if (startPage && startPage.pub && startPage.pub.url && startPage.out) {
        contentCatalog.addFile({
          src: {
            component: component.name,
            version: '',
            module: 'ROOT',
            family: 'alias',
            relative: 'index.adoc',
          },
          rel: startPage,
        })
      }

      // (1) latest/** redirect tree mirroring every published page.
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
