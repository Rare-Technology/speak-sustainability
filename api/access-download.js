// GET /api/access-download?t=<signed access token>&variant=standard|claude
// FR-5.2/5.3 — package downloads gated through the same token check as the
// page (lib/accessToken.js), never a static file at a public URL. The zip
// itself lives in private Vercel Blob storage (see lib/skillPackage.js and
// scripts/sync-skill-package.mjs), fetched here only after the token check
// passes and streamed straight through — this handler never exposes a Blob
// or upstream GitHub URL to the client.
import { Readable } from "node:stream";
import { get } from "@vercel/blob";
import { verifyAccessToken } from "../lib/accessToken.js";
import { recordAccess } from "../lib/accessLog.js";
import { hashIp, getClientIp, getUserAgent } from "../lib/hash.js";
import { SKILL_PACKAGES } from "../lib/skillPackage.js";

function redirectToExpired(res) {
  res.writeHead(302, { Location: "/access-expired.html" });
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  const rawToken = req.query?.t;
  const tokenString = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const rawVariant = req.query?.variant;
  const variant = Array.isArray(rawVariant) ? rawVariant[0] : rawVariant;

  if (variant !== "standard" && variant !== "claude") {
    res.status(400).send("Unknown package variant.");
    return;
  }

  let tokenRow;
  try {
    tokenRow = await verifyAccessToken(tokenString);
  } catch (err) {
    console.error("[api/access-download] token verification error", err);
    redirectToExpired(res);
    return;
  }
  if (!tokenRow) {
    redirectToExpired(res);
    return;
  }

  // Deliberately its own try/catch, separate from token verification above:
  // a Blob-side failure (not yet synced, misconfigured token, transient
  // outage) means "we have a problem," not "this link is invalid" — a
  // legitimate visitor should never see the expired-link page because of an
  // ops issue on our end.
  const { pathname, filename } = SKILL_PACKAGES[variant];
  let file;
  try {
    file = await get(pathname, { access: "private" });
  } catch (err) {
    console.error("[api/access-download] blob fetch error", err);
    res.status(503).send("Package temporarily unavailable — try again shortly or contact bschauer@rare.org.");
    return;
  }
  if (!file || file.statusCode !== 200) {
    console.error("[api/access-download] blob not found", pathname);
    res.status(503).send("Package temporarily unavailable — try again shortly or contact bschauer@rare.org.");
    return;
  }

  // FR-5.6 — logged only once the file is actually in hand, never before the
  // Blob fetch. Token.useCount is the permanent aggregate that outlives
  // AccessLog's 90-day purge, so a 503'd download counted here would inflate
  // the one usage signal this feature exists to produce, and do it
  // irreversibly. Verified: while Blob was unprovisioned, every 503 was
  // logging a completed download. Logging here still covers a stream that
  // fails mid-flight, which is the correct trade — the package was found and
  // the response committed at this point.
  await recordAccess({
    tokenId: tokenRow.id,
    eventType: "download",
    packageVariant: variant,
    ipHash: hashIp(getClientIp(req)),
    userAgent: getUserAgent(req),
    logPrefix: "[api/access-download]",
  });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  Readable.fromWeb(file.stream).pipe(res);
}
