// POST /api/followup-survey — post-workshop follow-up survey (/followup).
//
// Body (JSON): { biggest_obstacle?, principles_likelihood?, tool_likelihood?,
//                support_request?, recommendation?, most_valuable?, hp_field? }
//
// Sibling of api/workshop-survey.js, with one deliberate difference: nothing
// here identifies the respondent — no name, no email, and no IP hash — because
// this survey is sent by email and promised as anonymous. That rules out the
// per-IP rate limit used elsewhere, so abuse control is the honeypot plus a
// global per-hour cap, which needs no per-visitor key. At this survey's scale
// (a few dozen invited attendees) a global cap can't plausibly lock out a real
// respondent, and it self-heals within the hour.
import { prisma } from "../lib/prisma.js";
import { sendSurveyResponseEmail } from "../lib/email.js";
import { followUpSurvey, toCsv, LIKELIHOOD_LABELS } from "../lib/surveyCsv.js";

const EVENT = "level-up-cwnyc-2026-followup";
const MAX_TEXT_LEN = 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 200;

function text(v) {
  return typeof v === "string" ? v.trim().slice(0, MAX_TEXT_LEN) || null : null;
}

function scale(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * Email the organizers, after the response is safely saved. Deliberately
 * never throws: a Resend outage or a typo'd recipient must not turn a saved
 * response into an error page for the respondent, who cannot retry usefully
 * anyway. A failure is logged and the row is still in the table and the CSV.
 */
async function notifyOrganizers(saved) {
  try {
    const rows = await prisma.followUpSurveyResponse.findMany({ orderBy: { createdAt: "asc" } });
    await sendSurveyResponseEmail({
      surveyName: "Level Up follow-up survey",
      subject: `Level Up follow-up survey — new response (#${rows.length})`,
      total: rows.length,
      csv: toCsv(followUpSurvey, rows),
      csvFilename: "level-up-followup-responses.csv",
      answers: [
        { question: "1. Biggest obstacle to talking more about climate", answer: saved.biggestObstacle },
        { question: "2a. Likelihood of putting the principles into practice", answer: labelFor(saved.principlesLikelihood) },
        { question: "2b. Likelihood of putting the AI tool into practice", answer: labelFor(saved.toolLikelihood) },
        { question: "3. How TCC could best support them in the next 6 months", answer: saved.supportRequest },
        { question: "4. Would they recommend the boot camp, and to whom", answer: saved.recommendation },
        { question: "5. Most valuable part of the workshop", answer: saved.mostValuable },
      ],
    });
  } catch (err) {
    console.error("followup-survey: response saved but organizer email failed", err);
  }
}

function labelFor(n) {
  return n ? `${n} — ${LIKELIHOOD_LABELS[n]}` : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const data = {
    event: EVENT,
    biggestObstacle: text(body.biggest_obstacle),
    principlesLikelihood: scale(body.principles_likelihood),
    toolLikelihood: scale(body.tool_likelihood),
    supportRequest: text(body.support_request),
    recommendation: text(body.recommendation),
    mostValuable: text(body.most_valuable),
  };

  // Honeypot — fake success so a bot learns nothing.
  if (typeof body.hp_field === "string" && body.hp_field.trim() !== "") {
    res.status(200).json({ ok: true });
    return;
  }

  const answered = Object.entries(data).some(([k, v]) => k !== "event" && v !== null);
  if (!answered) {
    res.status(400).json({ ok: false, error: "empty_submission" });
    return;
  }

  try {
    const recent = await prisma.followUpSurveyResponse.count({
      where: { createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
    });
    if (recent >= MAX_PER_HOUR) {
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }

    const saved = await prisma.followUpSurveyResponse.create({ data });
    await notifyOrganizers(saved);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("followup-survey: failed to save response", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
}
