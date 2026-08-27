// POST /api/purge-unconfirmed — FR-2.4: unconfirmed signups auto-purge after 7 days.
//
// STUB / NOT WIRED TO A SCHEDULER YET. This function is safe to call and
// does the real deletion, but nothing invokes it on a schedule in this
// session. To finish wiring it up:
//
//   1. Set a PURGE_JOB_SECRET env var (any long random string).
//   2. Add a Vercel Cron entry to vercel.json, e.g.:
//        { "crons": [{ "path": "/api/purge-unconfirmed", "schedule": "0 6 * * *" }] }
//      (Vercel Cron requires a paid plan for schedules more frequent than
//      once/day on some tiers — confirm against the current Vercel pricing
//      page for this project's plan before relying on it.)
//   3. Vercel signs cron-triggered requests with an Authorization header
//      (see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs) —
//      this stub instead checks a shared-secret header as a simpler
//      alternative; swap to Vercel's signature verification if preferred.
//
// Left unwired deliberately per Phase 1 scope (schema/query only; scheduling
// is Phase 4 — "retention/purge jobs").
import { prisma } from "../lib/prisma.js";

const RETENTION_DAYS = 7;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const expected = process.env.PURGE_JOB_SECRET;
  const provided = req.headers["x-purge-job-secret"];
  if (!expected || provided !== expected) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.contact.deleteMany({
      where: {
        consentConfirmedAt: null,
        createdAt: { lt: cutoff },
      },
    });
    res.status(200).json({ ok: true, deleted: result.count });
  } catch (err) {
    console.error("[api/purge-unconfirmed] error", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}
