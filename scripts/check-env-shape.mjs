#!/usr/bin/env node
// Standalone, pre-deploy version of lib/envGuard.js's check — run this by
// hand after editing .env, before trusting it. The same check also runs
// automatically on every cold start via lib/prisma.js, but catching a
// swapped DATABASE_URL/DIRECT_DATABASE_URL here is cheaper than waiting for
// a deploy to fail.
//
//   npm run env:check
import { assertDatabaseUrlsNotSwapped } from "../lib/envGuard.js";

try {
  assertDatabaseUrlsNotSwapped();
  console.log("DATABASE_URL / DIRECT_DATABASE_URL shape looks correct (not swapped).");
} catch (err) {
  console.error("Env shape check failed:", err.message);
  process.exitCode = 1;
}
