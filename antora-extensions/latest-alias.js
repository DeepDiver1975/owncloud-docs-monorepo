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
 *
 * The mirroring itself lives in lib/alias-tree.js, shared with next-alias.js.
 */
const { mirrorPages, mirrorMoveRedirects } = require('./lib/alias-tree')

module.exports.register = function () {
  const LATEST = 'latest'

  // Run `fn(component, latest)` for every component that needs a `latest` alias:
  // versionless components (no latest) and any whose latest is already the
  // `latest` segment are skipped -- there is nothing to alias to.
  const eachAliasableComponent = (contentCatalog, fn) => {
    contentCatalog.getComponents().forEach((component) => {
      const latest = component.latest
      if (!latest || !latest.version || latest.version === LATEST) return
      fn(component, latest)
    })
  }

  this.once('contentClassified', ({ contentCatalog }) => {
    eachAliasableComponent(contentCatalog, (component, latest) => {
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
      mirrorPages(contentCatalog, component, latest.version, LATEST)
    })
  })

  // (3) Mirror the latest version's own move-redirects into the `latest` tree, so
  // an old page path that survives in the latest version only as a `page-aliases`
  // redirect keeps resolving under /<component>/latest/ too. Those stubs do not
  // exist yet at contentClassified, hence the second hook -- see
  // mirrorMoveRedirects() in lib/alias-tree.js.
  this.once('documentsConverted', ({ contentCatalog }) => {
    eachAliasableComponent(contentCatalog, (component, latest) => {
      mirrorMoveRedirects(contentCatalog, component, latest.version, LATEST)
    })
  })
}
