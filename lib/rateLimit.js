// Postgres-backed rate limiting (FR-1.4: 5/hour per IP and per email).
//
// No Redis/Upstash — at pilot scale a count query against SignupAttempt
// (already written for abuse-heuristic logging, FR-3.4) is enough, and it
// avoids adding a new vendor for a low-volume limit. Revisit if signup
// volume grows enough that this becomes a hot query.
import { prisma } from "./prisma.js";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;

/** Returns true if either the email or the IP has hit the limit in the last hour. */
export async function isRateLimited({ email, ipHash }) {
  const since = new Date(Date.now() - WINDOW_MS);

  const [byEmail, byIp] = await Promise.all([
    email
      ? prisma.signupAttempt.count({
          where: { emailAttempted: email, createdAt: { gte: since } },
        })
      : Promise.resolve(0),
    ipHash
      ? prisma.signupAttempt.count({
          where: { ipHash, createdAt: { gte: since } },
        })
      : Promise.resolve(0),
  ]);

  return byEmail >= MAX_PER_WINDOW || byIp >= MAX_PER_WINDOW;
}

export async function logSignupAttempt({ email, ipHash, accepted, flagged = false, flagReason = null }) {
  await prisma.signupAttempt.create({
    data: { emailAttempted: email, ipHash, accepted, flagged, flagReason },
  });
}
