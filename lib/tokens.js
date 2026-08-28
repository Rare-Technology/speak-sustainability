// HMAC-signed tokens, both kinds Token.kind models (SEC-1, SEC-2): single-use
// 30-minute "confirm" tokens (FR-2.1) and multi-use 90-day "access" tokens
// (FR-4.2). Same format for both — only the TTL and the payload's `k` differ.
//
// The emailed link carries an opaque string: base64url(JSON payload) + "." +
// base64url(HMAC-SHA256 signature). The signature proves the payload wasn't
// tampered with client-side; the DB row it references (Token.id === payload.tid)
// is the source of truth for single-use / revocation / expiry, because a
// signature alone can't tell you whether a link was already clicked or
// whether an access token has since been revoked.
//
// This intentionally isn't a JWT library dependency — the format is small
// enough to hand-roll and keeps the dependency surface minimal for a pilot.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = {
  confirm: 30 * 60 * 1000, // FR-2.2 — 30 minutes
  access: 90 * 24 * 60 * 60 * 1000, // FR-4.2 (Decided, Q2) — 90 days
};

function secret() {
  const s = process.env.CONFIRM_TOKEN_SECRET;
  if (!s) {
    throw new Error("CONFIRM_TOKEN_SECRET is not set");
  }
  return s;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64) {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

/**
 * Builds the signed token string for a Token row that was just created.
 * Does not touch the database — callers create the Token row separately
 * (see api/signup.js, api/confirm.js) so the row id can be embedded in the
 * payload.
 */
function buildSignedToken({ tokenId, contactId, kind, expiresAt }) {
  const payload = {
    tid: tokenId,
    cid: contactId,
    k: kind,
    exp: Math.floor(expiresAt.getTime() / 1000),
    n: randomBytes(8).toString("hex"), // nonce — belt-and-suspenders against payload collisions
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function buildConfirmToken({ tokenId, contactId, expiresAt }) {
  return buildSignedToken({ tokenId, contactId, kind: "confirm", expiresAt });
}

/** Access token (FR-4.2) — issued once a contact is approved (lib/approval.js). */
export function buildAccessToken({ tokenId, contactId, expiresAt }) {
  return buildSignedToken({ tokenId, contactId, kind: "access", expiresAt });
}

export function confirmTokenExpiry() {
  return new Date(Date.now() + TOKEN_TTL_MS.confirm);
}

export function accessTokenExpiry() {
  return new Date(Date.now() + TOKEN_TTL_MS.access);
}

/**
 * Verifies signature + shape only, for a specific expected token kind
 * ("confirm" or "access") — a valid access token must never be accepted
 * where a confirm token is expected, or vice versa. Does NOT check the
 * database (single-use, revocation, row-level expiry) — callers must still
 * look up `tid` and validate the Token row. Returns null on any
 * structural/signature/kind-mismatch failure.
 */
export function decodeAndVerifyToken(tokenString, expectedKind) {
  if (typeof tokenString !== "string" || !tokenString.includes(".")) return null;
  const [payloadB64, sig] = tokenString.split(".");
  if (!payloadB64 || !sig) return null;

  let expectedSig;
  try {
    expectedSig = sign(payloadB64);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(sig, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (payload.k !== expectedKind) return null;
  if (typeof payload.tid !== "string" || typeof payload.cid !== "string") return null;
  if (typeof payload.exp !== "number") return null;

  // Deliberately NOT checking payload.exp here. The DB row (Token.expiresAt)
  // is the real source of truth and is always queried right after this call
  // (see api/confirm.js) — rejecting on the payload's own claimed expiry
  // here would short-circuit before that lookup ever runs, which breaks the
  // idempotent-replay case this token format exists to support: a token
  // that WAS used successfully within its window, then revisited (e.g. a
  // reopened confirmation email) after the window has since elapsed,
  // should still resolve as "already confirmed" — not "expired" — because
  // the person genuinely did confirm. Only a never-used token past its DB
  // expiresAt should show as expired, and that's enforced downstream.

  return payload;
}
