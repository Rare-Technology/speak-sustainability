// Shared authorization for the two scheduled purge endpoints
// (api/purge-unconfirmed.js, api/purge-access-logs.js).
//
// Two callers, two credentials, deliberately:
//
//   1. Vercel Cron — makes an HTTP **GET** to the production deployment URL
//      and, when a CRON_SECRET env var exists on the project, automatically
//      sends its value as `Authorization: Bearer <CRON_SECRET>`. CRON_SECRET
//      is a normal env var you create yourself; Vercel does not populate it.
//      (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
//      Cron requests also carry `vercel-cron/1.0` as the user agent and an
//      `x-vercel-cron-schedule` header, but neither is authentication — any
//      client can spoof a header, so only the Bearer secret is checked.
//
//   2. A human running the job on demand — `curl -X POST -H "x-purge-job-secret: …"`,
//      e.g. to service an erasure request without waiting for the nightly run.
//      This is the original Phase 1 stub contract and PURGE_JOB_SECRET is
//      already set in Vercel, so it's kept rather than retired.
//
// Fails closed: if NEITHER secret is configured, nothing is authorized. An
// unset secret must never mean "allow" on an endpoint that deletes rows.
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare. Compares SHA-256 digests rather than the raw
 * strings so the two buffers are always the same length — timingSafeEqual
 * throws on a length mismatch, and an early length check would leak the
 * secret's length through timing.
 */
function secretsMatch(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * True when the request carries either accepted credential.
 *
 * Header note: a Vercel Node function lowercases incoming header names, and
 * the Authorization value keeps its "Bearer " prefix verbatim.
 */
export function isAuthorizedJobRequest(req) {
  const cronSecret = process.env.CRON_SECRET;
  const purgeSecret = process.env.PURGE_JOB_SECRET;

  const authHeader = req.headers?.authorization;
  if (cronSecret && secretsMatch(authHeader, `Bearer ${cronSecret}`)) return true;

  const provided = req.headers?.["x-purge-job-secret"];
  if (purgeSecret && secretsMatch(provided, purgeSecret)) return true;

  return false;
}

/**
 * Guard for a scheduled job handler. Writes the 405/401 response and returns
 * false when the request should not proceed; returns true when the handler
 * should run. GET is what Vercel Cron sends; POST is the manual/ops path.
 */
export function guardJobRequest(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).end();
    return false;
  }

  if (!isAuthorizedJobRequest(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }

  return true;
}
