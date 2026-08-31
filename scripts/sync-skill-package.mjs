#!/usr/bin/env node
// One-off, manually-run sync of the skill's release packages into private
// Vercel Blob storage. Not scheduled and not run in CI — see
// docs/planning/skill-install-access-spec.md's Phase 3 "Package storage"
// section and lib/skillPackage.js for why: the upstream ethulin/climate-
// comms-review repo is private, and this site's own repo is public, so
// committing the zips here would make them trivially fetchable (defeats
// FR-5.2). Run this whenever you want to deliberately adopt a new upstream
// release — already-emailed 90-day access links keep serving whatever was
// last synced here until you run this again.
//
// Requires:
//   - BLOB_READ_WRITE_TOKEN in the environment (same var the deployed app
//     uses — `vercel env pull .env` or export it manually).
//   - The `gh` CLI, authenticated with read access to the private
//     ethulin/climate-comms-review repo (gh auth status to check).
//
//   RELEASE_TAG=v1.0.0 node scripts/sync-skill-package.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { put } from "@vercel/blob";
import { SKILL_PACKAGES } from "../lib/skillPackage.js";

const REPO = "ethulin/climate-comms-review";
const RELEASE_TAG = process.env.RELEASE_TAG || "v1.0.0";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "BLOB_READ_WRITE_TOKEN is not set — pull it from Vercel (`vercel env pull .env`) or export it, then re-run."
  );
  process.exit(1);
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "skill-package-"));
  try {
    console.log(`Downloading release ${RELEASE_TAG} assets from ${REPO}...`);
    execFileSync("gh", ["release", "download", RELEASE_TAG, "-R", REPO, "-D", dir, "--clobber"], {
      stdio: "inherit",
    });

    for (const [variant, { pathname, filename }] of Object.entries(SKILL_PACKAGES)) {
      const bytes = readFileSync(path.join(dir, filename));
      console.log(`Uploading ${filename} -> ${pathname} (${bytes.length} bytes)...`);
      const blob = await put(pathname, bytes, {
        access: "private",
        addRandomSuffix: false, // fixed pathname — re-syncing never changes the URL
        allowOverwrite: true,
        contentType: "application/zip",
      });
      console.log(`  ${variant}: ${blob.url}`);
    }
    console.log(`Done — synced from ${REPO}@${RELEASE_TAG}.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
