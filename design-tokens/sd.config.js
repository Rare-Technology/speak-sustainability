/**
 * Style Dictionary config — FULL build (Rare Core + product-scope tokens).
 *
 * Source: W3C DTCG JSON ($value / $type / {alias} refs), split by tier
 *   (primitives → semantic → product). DTCG format is auto-detected by
 *   Style Dictionary v5.
 *
 * Output: build/rare-tokens.css — every token, under the --rare-* namespace,
 *   dot-path kebab-cased (color.action.primary → --rare-color-action-primary).
 *   This is the file index.html links; it is COMMITTED so GitHub Pages serves
 *   it as a static asset (no Node on the host).
 *
 * See sd.core.config.js for the Core-only extraction target. Core is what
 *   becomes the shared rare-tokens package at Phase 2; tokens under
 *   tokens/product/ are page-calibrated and must never be published (they
 *   carry viewport math that only resolves correctly on this page).
 *
 * Transforms are an explicit minimal list rather than the `css` transformGroup so
 * dimension/duration values pass through verbatim (no surprise px→rem rewrites);
 * only colors are normalized. outputReferences keeps the semantic→primitive chain
 * as var() references, so editing one primitive re-themes everything downstream.
 */
export default {
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transforms: ['attribute/cti', 'name/kebab', 'color/css'],
      prefix: 'rare',
      buildPath: 'build/',
      files: [
        {
          destination: 'rare-tokens.css',
          format: 'css/variables',
          options: {
            outputReferences: true
          }
        }
      ]
    }
  }
};
