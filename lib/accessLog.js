// FR-5.6 — logs every valid /access/:token page view and package download.
// Called from api/access.js and api/access-download.js only after a token
// has already verified successfully; failures here must never block a
// legitimate view/download, so callers wrap this in try/catch.
import { prisma } from "./prisma.js";

/** Bumps the access token's own running usage counters (never purged — the
 * "aggregate" that survives AccessLog's 90-day retention window). */
export async function recordTokenUse(tokenId) {
  await prisma.token.update({
    where: { id: tokenId },
    data: { usedAt: new Date(), useCount: { increment: 1 } },
  });
}

export async function logAccessEvent({ tokenId, eventType, packageVariant = null, ipHash, userAgent }) {
  await prisma.accessLog.create({
    data: { tokenId, eventType, packageVariant, ipHash, userAgent },
  });
}

/**
 * Runs recordTokenUse + logAccessEvent together, awaiting BOTH regardless of
 * whether one rejects. Deliberately Promise.allSettled, not Promise.all:
 * Promise.all short-circuits on the first rejection without waiting for the
 * other promise to finish, which — verified against a live dev run where an
 * AccessLog write failed (undeployed migration) — silently dropped the
 * Token.useCount bump too, since the caller moved on and sent its response
 * before the second write had actually landed. In real serverless execution
 * a frozen/recycled function can then never resume that orphaned write at
 * all. allSettled guarantees both get their chance before this returns.
 * Each failure is logged independently so one failing table doesn't mask
 * problems with the other.
 */
export async function recordAccess({ tokenId, eventType, packageVariant = null, ipHash, userAgent, logPrefix }) {
  const results = await Promise.allSettled([
    recordTokenUse(tokenId),
    logAccessEvent({ tokenId, eventType, packageVariant, ipHash, userAgent }),
  ]);
  const labels = ["recordTokenUse", "logAccessEvent"];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`${logPrefix} ${labels[i]} failed`, result.reason);
    }
  });
}
