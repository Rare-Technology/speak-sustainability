// Shared FR-5.1 verification for the two /access routes (api/access.js,
// api/access-download.js). Access tokens are multi-use (FR-4.2) — unlike
// api/confirm.js's confirm-token check, there is no usedAt single-use/replay
// logic here, only kind/revocation/expiry.
import { prisma } from "./prisma.js";
import { decodeAndVerifyToken } from "./tokens.js";

/** Returns the live Token row for a valid, unexpired, unrevoked access
 * token, or null on any structural/signature/DB-state failure. */
export async function verifyAccessToken(tokenString) {
  const payload = tokenString ? decodeAndVerifyToken(tokenString, "access") : null;
  if (!payload) return null;

  const tokenRow = await prisma.token.findUnique({ where: { id: payload.tid } });

  const valid =
    tokenRow &&
    tokenRow.kind === "access" &&
    tokenRow.contactId === payload.cid &&
    !tokenRow.revokedAt &&
    tokenRow.expiresAt.getTime() > Date.now();

  return valid ? tokenRow : null;
}
