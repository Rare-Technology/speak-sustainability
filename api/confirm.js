// GET /api/confirm?t=<signed token> — FR-2.2/FR-2.3, FR-3.1
//
// Verifies the emailed confirm link and redirects to a static landing page —
// never renders a raw error/stack trace (FR-2.2). Auto-approves on
// confirmation (Q1/FR-3.1: no manual review for Alpha/Climate Week).
//
// Idempotent-on-replay: many mail clients (Outlook Safe Links, Apple Mail
// Privacy Protection, link-preview bots) GET-fetch links automatically
// before a human ever clicks, which would burn a naively single-use token
// before the real click. If the token's owning contact is already
// confirmed, re-visiting the same (now "used") link still lands on the
// success page instead of "expired" — only a token that never successfully
// confirmed anyone shows the expired/re-request page.
import { prisma } from "../lib/prisma.js";
import { decodeAndVerifyToken } from "../lib/tokens.js";
import { hashIp, getClientIp, getUserAgent } from "../lib/hash.js";

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

  const payload = tokenString ? decodeAndVerifyToken(tokenString) : null;
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
          reviewStatus: "approved", // FR-3.1 — auto-approve, Alpha/Climate Week only
          confirmIpHash: ipHash,
          confirmUserAgent: userAgent,
        },
      }),
    ]);

    redirect(res, "/confirmed.html");
  } catch (err) {
    console.error("[api/confirm] error", err);
    redirect(res, "/confirm-expired.html");
  }
}
