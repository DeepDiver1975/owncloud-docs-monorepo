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

  // (3) Mirror the latest version's own move-redirects into the `latest` tree.
  // Antora registers the redirect stubs declared via `page-aliases` while it
  // converts documents, so they do not exist yet at contentClassified and pass
  // (1) by unnoticed -- they are in the `alias` family, not `page`. Without this
  // pass, an old page path that survives in the latest version only as a
  // redirect (e.g. a page renamed in server 11.0) resolves under the real
  // version but 404s under /<component>/latest/. The legacy go.php short links
  // (ui/supplemental/js/go-redirect.js) are keyed on those older page paths and
  // fall back to /server/latest/ for any unpublished version, so they depend on
  // the redirects being mirrored here.
  this.once('documentsConverted', ({ contentCatalog }) => {
    eachAliasableComponent(contentCatalog, (component, latest) => {
      contentCatalog
        .findBy({ component: component.name, version: latest.version, family: 'alias' })
        .forEach((alias) => {
          // Chain the mirror straight to the redirect's ultimate target instead
          // of to the redirect itself: one hop from /latest/ to real content,
          // and `rel` must be a publishable page for the redirect producer.
          const target = alias.rel
          if (!target || !target.pub || !target.pub.url || !target.out) return
          const src = {
            component: component.name,
            version: LATEST,
            module: alias.src.module,
            family: 'alias',
            relative: alias.src.relative,
          }
          // (1) already claimed this path if the latest version publishes a real
          // page there; re-adding it would replace a live page with a redirect.
          if (contentCatalog.getById(src)) return
          contentCatalog.addFile({ src, rel: target })
        })
    })
  })
}
