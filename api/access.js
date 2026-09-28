// GET /api/access?t=<signed access token> — FR-5.1, FR-6
//
// vercel.json rewrites /access/:token here (query param :token → t), so the
// browser's address bar keeps showing /access/<token> — this is a rewrite,
// not a redirect. That matters for install.html: its own client-side JS
// reads the token straight out of location.pathname to build the two
// download links, so no server-side templating of the page is needed here —
// on a valid token this handler just serves install.html's static content
// as-is.
//
// Access tokens are multi-use (FR-4.2) — see lib/accessToken.js for why this
// has no single-use/replay logic, unlike api/confirm.js's confirm-token check.
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyAccessToken } from "../lib/accessToken.js";
import { recordAccess } from "../lib/accessLog.js";
import { hashIp, getClientIp, getUserAgent } from "../lib/hash.js";

let installHtml;
function getInstallHtml() {
  // Cached across warm invocations (same rationale as lib/prisma.js's
  // singleton) — no need to re-read the file from disk on every request.
  if (!installHtml) {
    installHtml = readFileSync(path.join(process.cwd(), "install.html"), "utf8");
  }
  return installHtml;
}

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

  const raw = req.query?.t;
  const tokenString = Array.isArray(raw) ? raw[0] : raw;

  try {
    const tokenRow = await verifyAccessToken(tokenString);
    if (!tokenRow) {
      redirectToExpired(res);
      return;
    }

    // FR-5.6 — logging is best-effort: a DB hiccup here must never block a
    // legitimate page view (recordAccess awaits both writes independently —
    // see its comment in lib/accessLog.js for why this isn't Promise.all).
    await recordAccess({
      tokenId: tokenRow.id,
      eventType: "page_view",
      ipHash: hashIp(getClientIp(req)),
      userAgent: getUserAgent(req),
      logPrefix: "[api/access]",
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Robots-Tag", "noindex, nofollow"); // FR-5.4, belt-and-suspenders alongside the page's own meta tag
    res.status(200).send(getInstallHtml());
  } catch (err) {
    console.error("[api/access] error", err);
    redirectToExpired(res);
  }
}
