// POST /api/signup — FR-1.1/1.2/1.3/1.4/1.7, FR-2.1
//
// Body (JSON): { email, role?, organization?, consent_access, consent_feedback?,
//                hp_field?, form_rendered_at }
//
// Always responds with the same generic shape on any "plausible" submission
// (new signup, resubmit-while-unconfirmed, resubmit-while-already-confirmed,
// honeypot-tripped, too-fast-fill) so the endpoint doesn't leak whether an
// email is already registered. Only rate-limit / hard validation errors get
// a distinguishable (4xx) response.
import { prisma } from "../lib/prisma.js";
import { hashIp, getClientIp, getUserAgent } from "../lib/hash.js";
import { isRateLimited, logSignupAttempt } from "../lib/rateLimit.js";
import { buildConfirmToken, confirmTokenExpiry } from "../lib/tokens.js";
import { sendConfirmationEmail } from "../lib/email.js";
import { CONSENT_TEXT_VERSION } from "../lib/consent.js";
import { isDisposableEmailDomain } from "../lib/disposableEmail.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_TIME_MS = 3000; // FR-1.3 — invisible bot filter, soft signal only
const MAX_FIELD_LEN = 200;

function genericSuccess(res) {
  res.status(200).json({ ok: true });
}

function trim(v) {
  return typeof v === "string" ? v.trim().slice(0, MAX_FIELD_LEN) : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const email = trim(body.email).toLowerCase();
  const role = trim(body.role) || null;
  const organization = trim(body.organization) || null;
  const consentAccess = body.consent_access === true || body.consent_access === "true" || body.consent_access === "on";
  const consentFeedback = body.consent_feedback === true || body.consent_feedback === "true" || body.consent_feedback === "on";
  const honeypot = typeof body.hp_field === "string" ? body.hp_field : "";
  const renderedAt = Number(body.form_rendered_at);

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const userAgent = getUserAgent(req);

  // --- Hard validation (FR-1.2: required consent; email is the only required field, FR-1.5/GDPR-3) ---
  if (!EMAIL_RE.test(email) || !consentAccess) {
    await logSignupAttempt({ email: email || null, ipHash, accepted: false, flagReason: "validation" });
    res.status(400).json({ ok: false, error: "invalid_submission" });
    return;
  }

  // --- Rate limit (FR-1.4: 5/hour per email, 100/hour per IP) — checked before honeypot/fill-time
  // so a flood of honeypot-tripped requests still gets throttled, not just silently absorbed. ---
  if (await isRateLimited({ email, ipHash })) {
    await logSignupAttempt({ email, ipHash, accepted: false, flagReason: "rate_limited" });
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  // --- Honeypot (FR-1.3) — hard drop. Real visitors never see/fill this field,
  // so a non-empty value is a strong bot signal; fake a normal success response. ---
  if (honeypot.trim() !== "") {
    await logSignupAttempt({ email, ipHash, accepted: false, flagged: true, flagReason: "honeypot" });
    genericSuccess(res);
    return;
  }

  // --- Fill-time (FR-1.3) — soft signal only. Password managers/autofill can
  // legitimately fill a form in well under MIN_FILL_TIME_MS for a real human,
  // so this flags-and-continues rather than blocking. ---
  const fillTimeMs = Number.isFinite(renderedAt) ? Date.now() - renderedAt : null;
  const tooFast = fillTimeMs !== null && fillTimeMs >= 0 && fillTimeMs < MIN_FILL_TIME_MS;

  const disposable = isDisposableEmailDomain(email); // SEC-6 — soft, non-blocking

  try {
    const existing = await prisma.contact.findUnique({ where: { email } });
    const alreadyConfirmed = !!existing?.consentConfirmedAt;

    const contact = await prisma.contact.upsert({
      where: { email },
      create: {
        email,
        role,
        organization,
        consentGivenAt: new Date(),
        consentTextVersion: CONSENT_TEXT_VERSION,
        feedbackConsentGivenAt: consentFeedback ? new Date() : null,
        reviewStatus: "pending",
        sourceIpHash: ipHash,
        userAgent,
      },
      update: alreadyConfirmed
        ? {
            // Already a confirmed contact resubmitting the form: treat feedback
            // consent as independently updatable (GDPR-8) but never touch
            // consentConfirmedAt/reviewStatus, and don't re-send a confirm email.
            role: role ?? undefined,
            organization: organization ?? undefined,
            ...(consentFeedback ? { feedbackConsentGivenAt: new Date() } : {}),
          }
        : {
            role: role ?? undefined,
            organization: organization ?? undefined,
            consentGivenAt: new Date(),
            consentTextVersion: CONSENT_TEXT_VERSION,
            ...(consentFeedback ? { feedbackConsentGivenAt: new Date() } : {}),
          },
    });

    await logSignupAttempt({
      email,
      ipHash,
      accepted: true,
      flagged: tooFast || disposable,
      flagReason: tooFast ? "fast_fill" : disposable ? "disposable_domain" : null,
    });

    if (!alreadyConfirmed) {
      // Superseding a previous unused confirm token keeps only the latest
      // emailed link valid — avoids multiple live links floating around
      // for the same contact.
      await prisma.token.updateMany({
        where: { contactId: contact.id, kind: "confirm", usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const expiresAt = confirmTokenExpiry();
      const tokenRow = await prisma.token.create({
        data: { contactId: contact.id, kind: "confirm", expiresAt },
      });
      const signedToken = buildConfirmToken({ tokenId: tokenRow.id, contactId: contact.id, expiresAt });

      await sendConfirmationEmail({ to: email, token: signedToken });
    }

    genericSuccess(res);
  } catch (err) {
    console.error("[api/signup] error", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}
