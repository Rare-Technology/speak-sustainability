#!/usr/bin/env node
// Send one sample organizer notification, to check the wiring and the layout
// without waiting for a real respondent.
//
//   npm run survey:test-email -- someone@example.org
//
// With no argument it uses SURVEY_NOTIFY_EMAILS, i.e. exactly who a real
// response would reach — the safest pre-launch check. The sample answers are
// obviously fake and nothing is written to the database.
import { sendSurveyResponseEmail } from "../lib/email.js";
import { followUpSurvey, toCsv } from "../lib/surveyCsv.js";

const recipients = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (recipients.length > 0) {
  process.env.SURVEY_NOTIFY_EMAILS = recipients.join(",");
}
if (!process.env.SURVEY_NOTIFY_EMAILS) {
  console.error(
    "No recipient: pass an address (npm run survey:test-email -- you@example.org) " +
      "or set SURVEY_NOTIFY_EMAILS in .env."
  );
  process.exit(1);
}

const sample = {
  createdAt: new Date(),
  event: "level-up-cwnyc-2026-followup",
  biggestObstacle: "SAMPLE — Legal reviews every climate claim, so nothing ships quickly.",
  principlesLikelihood: 4,
  toolLikelihood: 3,
  supportRequest: "SAMPLE — A peer group that meets monthly.",
  recommendation: "SAMPLE — Yes, our comms team and two agency partners.",
  mostValuable: "SAMPLE — Rewriting our own press release against the principles.",
};

const result = await sendSurveyResponseEmail({
  surveyName: "Level Up follow-up survey (TEST)",
  subject: "TEST — Level Up follow-up survey — new response (#1)",
  total: 1,
  csv: toCsv(followUpSurvey, [sample]),
  csvFilename: "level-up-followup-responses.csv",
  answers: [
    { question: "1. Biggest obstacle to talking more about climate", answer: sample.biggestObstacle },
    { question: "2a. Likelihood of putting the principles into practice", answer: "4 — Likely" },
    { question: "2b. Likelihood of putting the AI tool into practice", answer: "3 — Not sure" },
    { question: "3. How TCC could best support them in the next 6 months", answer: sample.supportRequest },
    { question: "4. Would they recommend the boot camp, and to whom", answer: sample.recommendation },
    { question: "5. Most valuable part of the workshop", answer: sample.mostValuable },
  ],
});

console.log(
  result.skipped
    ? "Skipped — no recipients configured."
    : `Sent to ${process.env.SURVEY_NOTIFY_EMAILS} (${result.sent} recipient(s), ` +
      `CSV attachment ${result.attached ? "included" : "omitted"}).`
);
