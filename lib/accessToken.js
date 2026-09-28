// Shared FR-5.1 verification for the two /access routes (api/access.js,
// api/access-download.js). Access tokens are multi-use (FR-4.2) — unlike
// api/confirm.js's confirm-token check, there is no usedAt single-use/replay
// logic here, only kind/revocation/expiry.
//
// Also the one place access tokens get issued or re-signed from inside the
// app (api/confirm.js, api/signup.js). scripts/reissue-access.mjs keeps its
// own inline issuance because it runs on its own PrismaClient.
import { prisma } from "./prisma.js";
import { decodeAndVerifyToken, buildAccessToken, accessTokenExpiry } from "./tokens.js";

/** Returns the live Token row for a valid, unexpired, unrevoked access
 * token, or null on any structural/signature/DB-state failure. */
export async function verifyAccessToken(tokenString) {
  const payload = tokenString ? decodeAndVerifyToken(tokenString, "access") : null;
  if (!payload) return null;

  const tokenRow = await prisma.token.findUnique({ where: { id: payload.tid } });

  const valid = tokenRow && tokenRow.contactId === payload.cid && isLiveAccessToken(tokenRow);

  return valid ? tokenRow : null;
}

export function isLiveAccessToken(tokenRow) {
  return (
    tokenRow.kind === "access" &&
    !tokenRow.revokedAt &&
    tokenRow.expiresAt.getTime() > Date.now()
  );
}

/**
 * Signed link string for an existing access Token row. The signed string is
 * never stored — only the row is — so this is how an already-issued access
 * link gets handed out again (confirm-link replays, "I lost the email"
 * resubmits). A fresh nonce means the string differs from the one first
 * emailed, but verification only checks the signature and the row it names,
 * so both strings resolve to the same token: same expiry, same revocation,
 * same usage counters.
 */
export function signAccessToken(tokenRow) {
  return buildAccessToken({
    tokenId: tokenRow.id,
    contactId: tokenRow.contactId,
    expiresAt: tokenRow.expiresAt,
  });
}

/** Creates a new 90-day access Token row and returns { row, token }. */
export async function issueAccessToken(contactId) {
  const expiresAt = accessTokenExpiry();
  const row = await prisma.token.create({
    data: { contactId, kind: "access", expiresAt },
  });
  return { row, token: signAccessToken(row) };
}
