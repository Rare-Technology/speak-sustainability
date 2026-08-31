// Shared between api/access-download.js and scripts/sync-skill-package.mjs —
// single source of truth for where the two package variants live in Vercel
// Blob (FR-5.2/5.3: package downloads gated the same as the page, never a
// static file at a public URL). Fixed, non-random pathnames (see the sync
// script's `addRandomSuffix: false, allowOverwrite: true`) so re-syncing a
// new upstream release never changes the pathname or requires an env var
// update — only BLOB_READ_WRITE_TOKEN is needed to resolve them via
// @vercel/blob's `get()`.
//
// Filenames are still the upstream skill's real names (climate-comms-review*)
// — see docs/planning/skill-install-access-spec.md's rename watch item and
// install.html's own header for why the *display* name is "Speak
// Sustainability" while these literal artifact names aren't (yet).
export const SKILL_PACKAGES = {
  standard: {
    pathname: "skill-packages/climate-comms-review.zip",
    filename: "climate-comms-review.zip",
  },
  claude: {
    pathname: "skill-packages/climate-comms-review-claude.zip",
    filename: "climate-comms-review-claude.zip",
  },
};
