'use strict'

// Handlebars helper used by the supplemental default.hbs layout to detect
// non-canonical (older / prerelease) page copies for Pagefind dedup.
module.exports = (haystack, needle) =>
  typeof haystack === 'string' && typeof needle === 'string' && haystack.endsWith(needle)
