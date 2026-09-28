// GET|POST /api/confirm — FR-2.2/FR-2.3, FR-3.1, FR-4.1/4.2
//
// One-step confirm-and-install: the link in the (only) signup email both
// confirms the address and lands the visitor on their install page.
//
// The emailed link (GET ?t=<signed token>) only shows a "Continue to install"
// page (confirm-continue.html); it changes nothing. Pressing the button POSTs
// the token back here, and THAT is the confirmation. Mail-security scanners
// open emailed links on their own — Microsoft Defender was seen fully opening
// the link 6 seconds after send and confirming contacts before any person
// had seen the email — but they don't submit forms, so splitting it this way
// keeps the double opt-in a record of a human click.
//
// On a valid POST it records the confirmation, auto-approves (Q1/FR-3.1: no
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
// Replays resolve to the install page, not an error: this email is the one
// people keep, so they'll reopen it days later, and double-submits happen.
// Once a contact is confirmed, a GET or POST with their confirm token skips
// the button and redirects to the access token that this
// confirmation issued (re-signed — see lib/accessToken.js#signAccessToken),
// for as long as that access token is live. If it has been revoked or has
// expired, the replay goes to access-expired.html: a link re-issued to the
// owner later (scripts/reissue-access.mjs) is deliberately NOT reachable
// through an old confirm link, so revoking a leaked link actually sticks.
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { decodeAndVerifyToken } from "../lib/tokens.js";
import { isLiveAccessToken, signAccessToken, issueAccessToken } from "../lib/accessToken.js";
import { hashIp, getClientIp, getUserAgent } from "../lib/hash.js";
import { shouldAutoApprove } from "../lib/approval.js";

// Allowance for clock skew between this function's `new Date()` (stamped
// into Token.usedAt) and Postgres's now() (Token.issuedAt default) when
// matching a confirmation to the access token it issued.
const ISSUE_MATCH_SKEW_MS = 60 * 1000;

function redirect(res, location, status = 302) {
  res.writeHead(status, { Location: location });
  res.end();
}

let continueTemplate;
function continuePage(tokenString) {
  // Cached across warm invocations, same as api/access.js's install.html.
  if (!continueTemplate) {
    continueTemplate = readFileSync(path.join(process.cwd(), "confirm-continue.html"), "utf8");
  }
  const oneStep = shouldAutoApprove();
  // The token has already passed signature verification, so it's
  // base64url + "." — no characters that need escaping in an attribute.
  return continueTemplate
    .replace("{{TOKEN}}", () => tokenString)
    .replace(
      "{{BODY}}",
      oneStep
        ? "Confirm it's you and we'll take you straight to your Speak Sustainability install instructions."
        : "Confirm it's you, and we'll email your install link once your pilot access is approved."
    )
    .replace("{{BUTTON}}", oneStep ? "Continue to install" : "Confirm my email");
}

/**
 * Sends an already-confirmed contact on to wherever they belong: their
 * install page if approved, confirmed.html if still awaiting review. Used by
 * both the first click and every replay, so they can't drift apart.
 */
async function routeConfirmedContact(res, contact, confirmedAt, status = 302) {
  if (contact.markedForDeletionAt) {
    redirect(res, "/access-expired.html", status);
    return;
  }
  if (contact.reviewStatus !== "approved") {
    redirect(res, "/confirmed.html", status);
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
      redirect(res, "/access-expired.html", status);
      return;
    }
    redirect(res, `/access/${signAccessToken(issued)}`, status);
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
  redirect(res, `/access/${token}`, status);
}

/**
 * Looks up a confirm token and classifies it:
 *   "invalid"   bad signature, unknown, revoked, expired, or used without confirming
 *   "confirmed" its contact is already confirmed (replay — route them on)
 *   "fresh"     valid and unused — needs the button press to confirm
 */
async function loadConfirmToken(tokenString) {
  const payload = tokenString ? decodeAndVerifyToken(tokenString, "confirm") : null;
  if (!payload) return { state: "invalid" };

  const tokenRow = await prisma.token.findUnique({
    where: { id: payload.tid },
    include: { contact: true },
  });
  if (!tokenRow || tokenRow.kind !== "confirm" || tokenRow.contactId !== payload.cid) {
    return { state: "invalid" };
  }
  if (tokenRow.usedAt && tokenRow.contact.consentConfirmedAt) {
    return { state: "confirmed", tokenRow };
  }
  if (tokenRow.usedAt || tokenRow.revokedAt || tokenRow.expiresAt.getTime() <= Date.now()) {
    return { state: "invalid" };
  }
  return { state: "fresh", tokenRow };
}

function firstString(v) {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s : "";
}

export default async function handler(req, res) {
  // Mail-security scanners probe emailed links with HEAD before delivery.
  // Answer with a plain 200 and nothing else rather than a 405 that could
  // read as a suspicious link.
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).end();
    return;
  }

  const isPost = req.method === "POST";
  // POST comes from confirm-continue.html's form (urlencoded, which Vercel
  // parses into req.body); GET is the emailed link.
  const tokenString = isPost ? firstString(req.body?.t) : firstString(req.query?.t);
  // After a POST, 303 so the browser follows with a GET.
  const status = isPost ? 303 : 302;

  try {
    const { state, tokenRow } = await loadConfirmToken(tokenString);

    if (state === "invalid") {
      redirect(res, "/confirm-expired.html", status);
      return;
    }

    if (state === "confirmed") {
      try {
        await routeConfirmedContact(res, tokenRow.contact, tokenRow.usedAt, status);
      } catch (err) {
        console.error("[api/confirm] routing replay failed", err);
        redirect(res, "/confirmed.html?retry=1", status);
      }
      return;
    }

    if (!isPost) {
      // Fresh token on the emailed link: show the button, change nothing.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.status(200).send(continuePage(tokenString));
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
      await routeConfirmedContact(res, contact, now, status);
    } catch (err) {
      console.error("[api/confirm] access issuance failed after confirm", err);
      redirect(res, "/confirmed.html?retry=1", status);
    }
  } catch (err) {
    console.error("[api/confirm] error", err);
    redirect(res, "/confirm-expired.html", status);
  }
}
