// Salted hashing for abuse-signal fields (source_ip_hash) — per the spec's
// Data Model, we persist a salted hash of the IP, never the raw address.
import { createHmac } from "node:crypto";

function salt() {
  const s = process.env.IP_HASH_SALT;
  if (!s) {
    throw new Error("IP_HASH_SALT is not set");
  }
  return s;
}

/** Salted, truncated HMAC-SHA256 hex digest — one-way, not reversible to the raw IP. */
export function hashIp(ip) {
  if (!ip) return null;
  return createHmac("sha256", salt()).update(ip).digest("hex").slice(0, 32);
}

/** Best-effort client IP from Vercel's forwarding headers. */
export function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0].split(",")[0].trim();
  }
  return req.socket?.remoteAddress || null;
}

/** Coarse UA string, capped so we never store an unbounded header value. */
export function getUserAgent(req) {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 300) : null;
}
