'use strict'

/**
 * Shared catalog mechanics for publishing an alias version segment -- a segment
 * that is not a real version folder but a tree of redirect stubs mirroring one
 * (`latest`, `next`). Used by antora-extensions/latest-alias.js and
 * antora-extensions/next-alias.js: only the segment name and the source version
 * differ between them, while the two Antora quirks that make the mirroring work
 * are subtle enough to be worth stating once.
 *
 * Under `redirect_facility: static` (see site.yml) every file added to the `alias`
 * family renders as a <meta http-equiv="refresh"> stub, which is what makes such a
 * segment work on a static host like GitHub Pages.
 */

/**
 * Mirror every published page of `sourceVersion` into `segment` as a redirect.
 *
 * @param {Object} contentCatalog Antora's content catalog
 * @param {Object} component      the component to mirror within
 * @param {String} sourceVersion  the real version to point at ('' for versionless)
 * @param {String} segment        the alias version segment to publish under
 */
function mirrorPages (contentCatalog, component, sourceVersion, segment) {
  contentCatalog
    .findBy({ component: component.name, version: sourceVersion, family: 'page' })
    .forEach((page) => {
      // Only real published pages are valid redirect targets. AsciiDoc partials
      // (_*.adoc include fragments) are in the page family but have no pub/out;
      // aliasing them makes @antora/redirect-producer throw "Cannot read
      // properties of undefined (reading 'url')". Guard on both.
      if (!page.pub || !page.pub.url || !page.out) return
      addAlias(contentCatalog, component, segment, page.src.module, page.src.relative, page)
    })
}

/**
 * Mirror the move-redirects of `sourceVersion` -- the stubs Antora registers for
 * `page-aliases` attributes -- into `segment`.
 *
 * Antora registers those stubs while it converts documents, so at
 * contentClassified they do not exist yet and mirrorPages() cannot see them: they
 * are in the `alias` family, not `page`. Without this pass, an old page path that
 * survives in the source version only as a redirect (e.g. a page renamed in server
 * 11.0) resolves under the real version but 404s under the alias segment. The
 * legacy go.php short links (ui/supplemental/js/go-redirect.js) are keyed on those
 * older page paths and resolve inside these trees, so they depend on the redirects
 * being mirrored here.
 *
 * Call this from a `documentsConverted` listener, never earlier.
 *
 * @param {Object} contentCatalog Antora's content catalog
 * @param {Object} component      the component to mirror within
 * @param {String} sourceVersion  the real version whose redirects to mirror
 * @param {String} segment        the alias version segment to publish under
 */
function mirrorMoveRedirects (contentCatalog, component, sourceVersion, segment) {
  contentCatalog
    .findBy({ component: component.name, version: sourceVersion, family: 'alias' })
    .forEach((alias) => {
      // Chain the mirror straight to the redirect's ultimate target instead of to
      // the redirect itself: one hop from the alias segment to real content, and
      // `rel` must be a publishable page for the redirect producer.
      const target = alias.rel
      if (!target || !target.pub || !target.pub.url || !target.out) return
      addAlias(contentCatalog, component, segment, alias.src.module, alias.src.relative, target)
    })
}

/**
 * Add one redirect stub at <component>/<segment>/<module>/<relative>.
 *
 * A path already claimed in `segment` is left untouched, so the first caller wins:
 * re-adding it would replace a live page with a redirect, or a closer redirect
 * target with a more distant one. next-alias.js depends on this to layer a release
 * version underneath a prerelease one without overwriting it.
 */
function addAlias (contentCatalog, component, segment, module, relative, target) {
  const src = { component: component.name, version: segment, module, family: 'alias', relative }
  if (contentCatalog.getById(src)) return
  contentCatalog.addFile({ src, rel: target })
}

module.exports = { mirrorPages, mirrorMoveRedirects }
