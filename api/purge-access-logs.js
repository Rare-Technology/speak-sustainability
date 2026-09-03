// GET|POST /api/purge-access-logs — spec retention: "Access-page view logs:
// retain 90 days rolling, then aggregate-only." The aggregate that survives
// this purge is Token.usedAt/useCount (lib/accessLog.js#recordTokenUse),
// which is never deleted — only the raw per-event AccessLog rows here are.
//
// SCHEDULED via the `crons` array in vercel.json (Phase 4), on the same dual
// -credential contract as api/purge-unconfirmed.js: Vercel Cron sends a GET
// with `Authorization: Bearer $CRON_SECRET`, and a human can trigger a run on
// demand with POST + `x-purge-job-secret`. See lib/cronAuth.js.
//
// Runs an hour after purge-unconfirmed rather than alongside it — deleting a
// Contact cascades to its Tokens and their AccessLogs, so letting the contact
// purge settle first leaves this job less to do and keeps the two jobs off
// the same rows at the same time.
import { prisma } from "../lib/prisma.js";
import { guardJobRequest } from "../lib/cronAuth.js";

const RETENTION_DAYS = 90;

export default async function handler(req, res) {
  if (!guardJobRequest(req, res)) return;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.accessLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    console.log("[api/purge-access-logs]", JSON.stringify({ deleted: result.count }));
    res.status(200).json({ ok: true, deleted: result.count });
  } catch (err) {
    console.error("[api/purge-access-logs] error", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}
