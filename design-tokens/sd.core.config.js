/**
 * Style Dictionary config — CORE-ONLY build (the publishable surface).
 *
 * Source: primitives + semantics ONLY. Deliberately excludes tokens/product/,
 *   which holds page-calibrated component tokens (chat-preview.*, case-card.*)
 *   whose clamp() values embed this page's viewport math (52.8vw / 1.76vw /
 *   26vw). Those resolve against the viewport rather than their parent, so they
 *   compute wrong inside any narrower container and must not reach another
 *   consumer.
 *
 * Output: build/rare-core.css — this is the artifact that becomes the shared
 *   `rare-tokens` package at Phase 2 extraction. The landing page does NOT link
 *   it (it links the full rare-tokens.css); it exists so the Core/product
 *   boundary is machine-enforced and reviewable in a diff rather than a
 *   convention someone has to remember.
 *
 * If a product token is later shown to be genuinely context-free, promote it by
 * moving its file from tokens/product/ into tokens/semantic/ (or primitives/)
 * — it then appears in this build automatically. That move IS the promotion.
 */
export default {
  source: [
    'tokens/primitives/**/*.json',
    'tokens/semantic/**/*.json'
  ],
  platforms: {
    css: {
      transforms: ['attribute/cti', 'name/kebab', 'color/css'],
      prefix: 'rare',
      buildPath: 'build/',
      files: [
        {
          destination: 'rare-core.css',
          format: 'css/variables',
          options: {
            outputReferences: true
          }
        }
      ]
    }
  }
};
