// GET /api/confirm?t=<signed token> — FR-2.2/FR-2.3, FR-3.1, FR-4.1/4.2
//
// One-step confirm-and-install: the link in the (only) signup email both
// confirms the address and lands the visitor on their install page. On a
// valid click it records the confirmation, auto-approves (Q1/FR-3.1: no
// manual review for Alpha/Climate Week, gated through lib/approval.js so that
// can change later without touching this file), issues a 90-day access token,
// and redirects straight to /access/<token>. There is no separate
// install-access email in this path any more — watching people sign up showed
// the second email was where the flow got abandoned.
//
// With manual review switched on (AUTO_APPROVE_CONTACTS=false) the click
// can't grant access yet, so it lands on confirmed.html ("we'll email you
// once approved") and the install-access email is sent on approval instead
// (scripts/reissue-access.mjs).
//
// Replays resolve to the install page, not an error. Many mail clients
// (Outlook Safe Links, Apple Mail Privacy Protection, link-preview bots)
// GET-fetch links before a human ever clicks, which consumes a naively
// single-use token before the real click — and because this email is now the
// one people keep, they'll also reopen it days later. So a confirm token
// whose contact is already confirmed redirects to the access token that this
// confirmation issued (re-signed — see lib/accessToken.js#signAccessToken),
// for as long as that access token is live. If it has been revoked or has
// expired, the replay goes to access-expired.html: a link re-issued to the
// owner later (scripts/reissue-access.mjs) is deliberately NOT reachable
// through an old confirm link, so revoking a leaked link actually sticks.
import { prisma } from "../lib/prisma.js";
import { decodeAndVerifyToken } from "../lib/tokens.js";
import { isLiveAccessToken, signAccessToken, issueAccessToken } from "../lib/accessToken.js";
import { hashIp, getClientIp, getUserAgent } from "../lib/hash.js";
import { shouldAutoApprove } from "../lib/approval.js";

// Allowance for clock skew between this function's `new Date()` (stamped
// into Token.usedAt) and Postgres's now() (Token.issuedAt default) when
// matching a confirmation to the access token it issued.
const ISSUE_MATCH_SKEW_MS = 60 * 1000;

function redirect(res, path) {
  res.writeHead(302, { Location: path });
  res.end();
}

/**
 * Sends an already-confirmed contact on to wherever they belong: their
 * install page if approved, confirmed.html if still awaiting review. Used by
 * both the first click and every replay, so they can't drift apart.
 */
async function routeConfirmedContact(res, contact, confirmedAt) {
  if (contact.markedForDeletionAt) {
    redirect(res, "/access-expired.html");
    return;
  }
  if (contact.reviewStatus !== "approved") {
    redirect(res, "/confirmed.html");
    return;
  }

  // The access token this confirmation issued = the earliest one created at
  // or after the confirm click. Later ones are re-issues (see file header).
  const issued = await prisma.token.findFirst({
    where: {
      contactId: contact.id,
      kind: "access",
      issuedAt: { gte: new Date(confirmedAt.getTime() - ISSUE_MATCH_SKEW_MS) },
    },
    orderBy: { issuedAt: "asc" },
  });

  if (issued) {
    if (!isLiveAccessToken(issued)) {
      redirect(res, "/access-expired.html");
      return;
    }
    redirect(res, `/access/${signAccessToken(issued)}`);
    return;
  }

  // None issued yet: first click, a replay racing the first click, or a
  // first click whose issuance failed (in which case clicking again retries).
  // Access is delivered by this redirect rather than by email, but
  // installEmailSentAt still records it — it's the "has this contact been
  // given their install link" marker that scripts/list-approved-contacts.mjs
  // and the manual follow-up in FR-3.2 key off.
  const { token } = await issueAccessToken(contact.id);
  await prisma.contact.update({
    where: { id: contact.id },
    data: { installEmailSentAt: contact.installEmailSentAt ?? new Date() },
  });
  redirect(res, `/access/${token}`);
}

export default async function handler(req, res) {
  // Mail-security scanners (Microsoft Defender Safe Links among them) probe
  // emailed links with HEAD before delivery. Answer with a plain 200 and do
  // nothing else — a HEAD must never confirm, consume a token, or issue
  // access — rather than a 405 that could read as a suspicious link.
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
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

    if (!tokenRow || tokenRow.kind !== "confirm" || tokenRow.contactId !== payload.cid) {
      redirect(res, "/confirm-expired.html");
      return;
    }

    // Replay of a token that DID successfully confirm its contact — route
    // them on, not to "expired" (see file header).
    if (tokenRow.usedAt && tokenRow.contact.consentConfirmedAt) {
      try {
        await routeConfirmedContact(res, tokenRow.contact, tokenRow.usedAt);
      } catch (err) {
        console.error("[api/confirm] routing replay failed", err);
        redirect(res, "/confirmed.html?retry=1");
      }
      return;
    }

    if (tokenRow.usedAt || tokenRow.revokedAt || tokenRow.expiresAt.getTime() <= Date.now()) {
      redirect(res, "/confirm-expired.html");
      return;
    }

    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const userAgent = getUserAgent(req);
    const now = new Date();
    const approved = shouldAutoApprove(); // FR-3.3

    const [, contact] = await prisma.$transaction([
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

    // Issuing the access token is deliberately outside the transaction above:
    // a failure there must not undo the confirmation. The contact stays
    // confirmed/approved either way, and because no access token exists yet,
    // the next click on the same link (a replay) issues one and continues.
    try {
      await routeConfirmedContact(res, contact, now);
    } catch (err) {
      console.error("[api/confirm] access issuance failed after confirm", err);
      redirect(res, "/confirmed.html?retry=1");
    }
  } catch (err) {
    console.error("[api/confirm] error", err);
    redirect(res, "/confirm-expired.html");
  }
}
