// POST /api/workshop-survey — Level Up workshop feedback survey (/level-up).
//
// Body (JSON): { biggest_obstacle?, likelihood?, support_request?, name?, hp_field? }
//
// Every question is optional — a partial answer is still useful feedback, and
// the resources page is reachable either way. The only hard rejection is an
// entirely empty submission.
import { prisma } from "../lib/prisma.js";
import { hashIp, getClientIp } from "../lib/hash.js";

const EVENT = "level-up-cwnyc-2026";
const MAX_TEXT_LEN = 1000;
const MAX_NAME_LEN = 120;
const WINDOW_MS = 60 * 60 * 1000;
// Everyone in the room shares the venue Wi-Fi IP (see lib/rateLimit.js), so
// this only guards against a runaway script, not normal use.
const MAX_PER_IP = 300;

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) || null : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const biggestObstacle = text(body.biggest_obstacle, MAX_TEXT_LEN);
  const supportRequest = text(body.support_request, MAX_TEXT_LEN);
  const name = text(body.name, MAX_NAME_LEN);
  const n = Number(body.likelihood);
  const likelihood = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;

  // Honeypot — fake success so a bot learns nothing.
  if (typeof body.hp_field === "string" && body.hp_field.trim() !== "") {
    res.status(200).json({ ok: true });
    return;
  }

  if (!biggestObstacle && !supportRequest && !name && likelihood === null) {
    res.status(400).json({ ok: false, error: "empty_submission" });
    return;
  }

  try {
    const ipHash = hashIp(getClientIp(req));
    if (ipHash) {
      const recent = await prisma.workshopSurveyResponse.count({
        where: { ipHash, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
      });
      if (recent >= MAX_PER_IP) {
        res.status(429).json({ ok: false, error: "rate_limited" });
        return;
      }
    }

    await prisma.workshopSurveyResponse.create({
      data: { event: EVENT, biggestObstacle, likelihood, supportRequest, name, ipHash },
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("workshop-survey: failed to save response", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
}
