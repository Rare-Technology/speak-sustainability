// GET /api/confirm?t=<signed token> — FR-2.2/FR-2.3, FR-3.1, FR-4.1/4.2
//
// Verifies the emailed confirm link and redirects to a static landing page —
// never renders a raw error/stack trace (FR-2.2). Auto-approves on
// confirmation (Q1/FR-3.1: no manual review for Alpha/Climate Week, gated
// through lib/approval.js so that can change later without touching this
// file) and, when approved, issues a 90-day access token and sends the
// install-access email (FR-4.1/4.2) right after.
//
// Idempotent-on-replay: many mail clients (Outlook Safe Links, Apple Mail
// Privacy Protection, link-preview bots) GET-fetch links automatically
// before a human ever clicks, which would burn a naively single-use token
// before the real click. If the token's owning contact is already
// confirmed, re-visiting the same (now "used") link still lands on the
// success page instead of "expired" — only a token that never successfully
// confirmed anyone shows the expired/re-request page. This also keeps
// access-token issuance and the install-access email to a single send: that
// block only ever runs the one time the confirm token is actually consumed.
import { prisma } from "../lib/prisma.js";
import { decodeAndVerifyToken, buildAccessToken, accessTokenExpiry } from "../lib/tokens.js";
import { hashIp, getClientIp, getUserAgent } from "../lib/hash.js";
import { shouldAutoApprove } from "../lib/approval.js";
import { sendInstallAccessEmail } from "../lib/email.js";

function redirect(res, path) {
  res.writeHead(302, { Location: path });
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  const raw = req.query?.t;
  const tokenString = Array.isArray(raw) ? raw[0] : raw;

  const payload = tokenString ? decodeAndVerifyToken(tokenString, "confirm") : null;
  if (!payload) {
    redirect(res, "/confirm-expired.html");
    return;
  }

  try {
    const tokenRow = await prisma.token.findUnique({
      where: { id: payload.tid },
      include: { contact: true },
    });

    const structurallyValid =
      tokenRow &&
      tokenRow.kind === "confirm" &&
      tokenRow.contactId === payload.cid &&
      !tokenRow.revokedAt &&
      !tokenRow.usedAt &&
      tokenRow.expiresAt.getTime() > Date.now();

    if (!structurallyValid) {
      // Replay of a token that DID successfully confirm its contact — treat as
      // success, not expired (see file header re: mail-client link prefetching).
      if (tokenRow?.usedAt && tokenRow.contact?.consentConfirmedAt) {
        redirect(res, "/confirmed.html");
        return;
      }
      redirect(res, "/confirm-expired.html");
      return;
    }

    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const userAgent = getUserAgent(req);
    const now = new Date();
    const approved = shouldAutoApprove(); // FR-3.3

    await prisma.$transaction([
      prisma.token.update({
        where: { id: tokenRow.id },
        data: { usedAt: now, useCount: { increment: 1 } },
      }),
      prisma.contact.update({
        where: { id: tokenRow.contactId },
        data: {
          // Idempotent: don't clobber an earlier confirmedAt if this somehow runs twice.
          consentConfirmedAt: tokenRow.contact.consentConfirmedAt ?? now,
          reviewStatus: approved ? "approved" : "pending", // FR-3.1
          confirmIpHash: ipHash,
          confirmUserAgent: userAgent,
        },
      }),
    ]);

    if (approved) {
      // Deliberately outside the transaction above — issuing a token and
      // sending an email are not things that need DB-transactional atomicity
      // with the confirm write, and an email API call shouldn't hold a
      // transaction's locks open. A failure here doesn't undo the
      // confirmation: the contact stays confirmed/approved either way, and
      // installEmailSentAt simply stays null for manual follow-up (FR-3.2).
      try {
        const expiresAt = accessTokenExpiry();
        const accessTokenRow = await prisma.token.create({
          data: { contactId: tokenRow.contactId, kind: "access", expiresAt },
        });
        const signedAccessToken = buildAccessToken({
          tokenId: accessTokenRow.id,
          contactId: tokenRow.contactId,
          expiresAt,
        });
        await sendInstallAccessEmail({ to: tokenRow.contact.email, token: signedAccessToken });
        await prisma.contact.update({
          where: { id: tokenRow.contactId },
          data: { installEmailSentAt: new Date() },
        });
      } catch (err) {
        console.error("[api/confirm] install-access email failed", err);
      }
    }

    redirect(res, "/confirmed.html");
  } catch (err) {
    console.error("[api/confirm] error", err);
    redirect(res, "/confirm-expired.html");
  }
}
