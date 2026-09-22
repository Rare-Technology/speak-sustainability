// Postgres-backed rate limiting (FR-1.4: 5/hour per email, 100/hour per IP — see MAX_PER_IP).
//
// No Redis/Upstash — at pilot scale a count query against SignupAttempt
// (already written for abuse-heuristic logging, FR-3.4) is enough, and it
// avoids adding a new vendor for a low-volume limit. Revisit if signup
// volume grows enough that this becomes a hot query.
import { prisma } from "./prisma.js";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_EMAIL = 5;
// Per-IP is deliberately much looser than per-email: at an in-person event
// (Climate Week) many guests sign up from one shared venue Wi-Fi IP, and
// mobile carriers put many users behind one CGNAT address. At 5/hour the
// sixth guest in a room would be blocked. The per-email limit and the
// honeypot/fill-time checks still cover the abuse this was guarding.
const MAX_PER_IP = 100;

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

  return byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP;
}

export async function logSignupAttempt({ email, ipHash, accepted, flagged = false, flagReason = null }) {
  await prisma.signupAttempt.create({
    data: { emailAttempted: email, ipHash, accepted, flagged, flagReason },
  });
}
