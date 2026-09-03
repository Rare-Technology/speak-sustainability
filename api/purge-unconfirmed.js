// GET|POST /api/purge-unconfirmed — scheduled retention deletion.
//
// Two things get hard-deleted here:
//   1. FR-2.4 — signups that never confirmed, older than 7 days.
//   2. GDPR-4 — contacts explicitly marked for erasure
//      (Contact.markedForDeletionAt, set by scripts/mark-for-erasure.mjs),
//      regardless of age or confirmation state. The schema has always said
//      "hard-deleted on next purge run"; this is the run that does it.
//
// Deleting a Contact cascades to its Token rows, which cascade to AccessLog
// rows (see prisma/schema.prisma) — so an erasure takes the access links and
// the view history with it, which is the point.
//
// SCHEDULED via the `crons` array in vercel.json (Phase 4). Vercel Cron makes
// an HTTP GET carrying `Authorization: Bearer $CRON_SECRET`; a human can also
// trigger a run on demand with POST + `x-purge-job-secret`. Both credentials
// are checked in lib/cronAuth.js — see that file for the details.
//
// Idempotency: Vercel cron delivery is best-effort and can occasionally fire
// the same scheduled run twice. Both deletes below are cutoff-based
// deleteMany calls, so a duplicate run simply deletes nothing the second
// time. Vercel also never retries a failed invocation — a missed night is
// picked up by the next run, since the cutoff is always computed from "now"
// rather than from a last-run marker.
import { prisma } from "../lib/prisma.js";
import { guardJobRequest } from "../lib/cronAuth.js";

const RETENTION_DAYS = 7;

export default async function handler(req, res) {
  if (!guardJobRequest(req, res)) return;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const unconfirmed = await prisma.contact.deleteMany({
      where: {
        consentConfirmedAt: null,
        createdAt: { lt: cutoff },
      },
    });

    // Separate deleteMany rather than an OR in the query above: an erasure
    // request is unconditional (no age cutoff, confirmed or not), and keeping
    // the two counts distinct makes the cron log say which kind of deletion
    // happened on a given night.
    const erasures = await prisma.contact.deleteMany({
      where: { markedForDeletionAt: { not: null } },
    });

    const result = {
      ok: true,
      deletedUnconfirmed: unconfirmed.count,
      deletedErasureRequests: erasures.count,
    };
    console.log("[api/purge-unconfirmed]", JSON.stringify(result));
    res.status(200).json(result);
  } catch (err) {
    console.error("[api/purge-unconfirmed] error", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}
