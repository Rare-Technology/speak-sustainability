// POST /api/purge-access-logs — spec retention: "Access-page view logs:
// retain 90 days rolling, then aggregate-only." The aggregate that survives
// this purge is Token.usedAt/useCount (lib/accessLog.js#recordTokenUse),
// which is never deleted — only the raw per-event AccessLog rows here are.
//
// STUB / NOT WIRED TO A SCHEDULER YET — same status and same shared-secret
// pattern as api/purge-unconfirmed.js (see that file's header for the full
// Vercel Cron wiring steps). Left unwired deliberately; scheduling both purge
// jobs together is Phase 4 scope ("retention/purge jobs").
import { prisma } from "../lib/prisma.js";

const RETENTION_DAYS = 90;

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
    const result = await prisma.accessLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    res.status(200).json({ ok: true, deleted: result.count });
  } catch (err) {
    console.error("[api/purge-access-logs] error", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}
