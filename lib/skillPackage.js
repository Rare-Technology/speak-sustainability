// Shared between api/access-download.js and scripts/sync-skill-package.mjs —
// single source of truth for where the two package variants live in Vercel
// Blob (FR-5.2/5.3: package downloads gated the same as the page, never a
// static file at a public URL). Fixed, non-random pathnames (see the sync
// script's `addRandomSuffix: false, allowOverwrite: true`) so re-syncing a
// new upstream release never changes the pathname or requires an env var
// update — only BLOB_READ_WRITE_TOKEN is needed to resolve them via
// @vercel/blob's `get()`.
//
// Filenames match the upstream skill's renamed release assets (as of
// v1.1.0, 2026-09-11 — see docs/planning/skill-install-access-spec.md's Q9
// watch item and scripts/sync-skill-package.mjs's REPO constant). `pathname`
// is deliberately left unchanged from the pre-rename values — moving it
// would change the Blob URL and could break anything already pointing at
// it; only the upstream filename this script looks for needed to change.
export const SKILL_PACKAGES = {
  standard: {
    pathname: "skill-packages/climate-comms-review.zip",
    filename: "speak-sustainability.zip",
  },
  claude: {
    pathname: "skill-packages/climate-comms-review-claude.zip",
    filename: "speak-sustainability-claude.zip",
  },
};
