// Cheap, fail-fast guard against DATABASE_URL / DIRECT_DATABASE_URL being
// swapped — the pooled (port 6543, pgbouncer) and direct (port 5432)
// Supabase connection strings look similar enough that a manual .env edit
// swapped them on 2026-08-28: it passed every local check at the time
// (the app still connected to *a* real Postgres, just the wrong one for
// its role) and only surfaced as a failure in Vercel's actual serverless
// runtime. Called once per cold start from lib/prisma.js so it can never be
// skipped by forgetting to run a separate script — see
// scripts/check-env-shape.mjs for the standalone, pre-deploy version of the
// same check.
function assertUrlShape(name, url, { expectedPort, requirePgbouncer = false }) {
  if (!url) {
    throw new Error(`${name} is not set`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (parsed.port !== expectedPort) {
    throw new Error(
      `${name} is on port ${parsed.port || "(default)"}, expected ${expectedPort} — ` +
        "check DATABASE_URL and DIRECT_DATABASE_URL haven't been swapped."
    );
  }
  if (requirePgbouncer && !parsed.searchParams.has("pgbouncer")) {
    throw new Error(
      `${name} is missing ?pgbouncer=true — check it's the pooled connection string, not the direct one.`
    );
  }
}

export function assertDatabaseUrlsNotSwapped() {
  assertUrlShape("DATABASE_URL", process.env.DATABASE_URL, {
    expectedPort: "6543",
    requirePgbouncer: true,
  });
  assertUrlShape("DIRECT_DATABASE_URL", process.env.DIRECT_DATABASE_URL, {
    expectedPort: "5432",
  });
  if (process.env.DATABASE_URL === process.env.DIRECT_DATABASE_URL) {
    throw new Error("DATABASE_URL and DIRECT_DATABASE_URL are identical — one of them is misconfigured.");
  }
}
