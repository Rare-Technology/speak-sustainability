// POST /api/remind — "finish on a computer" reminder from install.html's
// phone panel. None of the web/desktop clients (ChatGPT, Claude, Gemini
// Spark, Gemini Enterprise) let you add a skill from a phone, so a visitor who
// opens their access link on mobile can ask for the same link to be emailed
// back to them — now, or scheduled for when they'll be at a computer.
//
// Body (JSON): { t: <signed access token>, sendAt?: <ISO 8601 string> }
// Omitting sendAt (or a sendAt within the next few minutes) sends immediately.
//
// Gated by the same access-token check as the page itself
// (lib/accessToken.js), so this can only ever email the token's own contact —
// never an address supplied by the client.
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/accessToken.js";
import { sendInstallReminderEmail } from "../lib/email.js";

const SEND_NOW_THRESHOLD_MS = 5 * 60 * 1000; // anything sooner just sends now
const RESEND_MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000; // Resend's scheduled-send limit
const EXPIRY_MARGIN_MS = 24 * 60 * 60 * 1000; // reminder must land well before the link dies
const MAX_REMINDERS_PER_DAY = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Reminder requests are counted in SignupAttempt under a synthetic
// "reminder:<tokenId>" key (ipHash left null) rather than a new table or
// AccessEventType value, to ship without a migration. The key can't collide
// with a real email (no "@"), and a null ipHash keeps these rows out of the
// signup endpoint's per-IP limit. Swap for an AccessLog event type once a
// migration is on the table.
function reminderKey(tokenId) {
  return `reminder:${tokenId}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const tokenString = typeof body.t === "string" ? body.t : "";

  let sendAt = null;
  if (body.sendAt != null && body.sendAt !== "") {
    const parsed = new Date(body.sendAt);
    if (typeof body.sendAt !== "string" || Number.isNaN(parsed.getTime())) {
      res.status(400).json({ ok: false, error: "invalid_time" });
      return;
    }
    sendAt = parsed;
  }

  try {
    const tokenRow = await verifyAccessToken(tokenString);
    if (!tokenRow) {
      res.status(401).json({ ok: false, error: "expired" });
      return;
    }

    const now = Date.now();
    if (sendAt && sendAt.getTime() < now - SEND_NOW_THRESHOLD_MS) {
      res.status(400).json({ ok: false, error: "time_in_past" });
      return;
    }
    const latest = Math.min(now + RESEND_MAX_AHEAD_MS, tokenRow.expiresAt.getTime() - EXPIRY_MARGIN_MS);
    if (sendAt && sendAt.getTime() > latest) {
      res.status(400).json({ ok: false, error: "too_far_ahead", latest: new Date(latest).toISOString() });
      return;
    }
    const scheduled = sendAt && sendAt.getTime() > now + SEND_NOW_THRESHOLD_MS;

    const key = reminderKey(tokenRow.id);
    const recent = await prisma.signupAttempt.count({
      where: { emailAttempted: key, accepted: true, createdAt: { gte: new Date(now - WINDOW_MS) } },
    });
    if (recent >= MAX_REMINDERS_PER_DAY) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const contact = await prisma.contact.findUnique({ where: { id: tokenRow.contactId } });
    if (!contact || contact.markedForDeletionAt) {
      res.status(401).json({ ok: false, error: "expired" });
      return;
    }

    await sendInstallReminderEmail({
      to: contact.email,
      token: tokenString,
      scheduledAt: scheduled ? sendAt.toISOString() : undefined,
    });

    // Logged only after Resend accepted it, so a failed send doesn't burn
    // one of the visitor's daily reminders. Best-effort: the email is already
    // queued, so a logging failure must not report the request as failed.
    try {
      await prisma.signupAttempt.create({
        data: { emailAttempted: key, ipHash: null, accepted: true, flagReason: "reminder" },
      });
    } catch (logErr) {
      console.error("[api/remind] reminder log write failed", logErr);
    }

    res.status(200).json({ ok: true, scheduledFor: scheduled ? sendAt.toISOString() : null });
  } catch (err) {
    console.error("[api/remind] error", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}
