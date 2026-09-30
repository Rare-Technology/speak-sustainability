#!/usr/bin/env node
// Follow-up survey responses → CSV, for pasting/importing into Google Sheets.
//
//   npm run followup:export > level-up-followup.csv
//
// Then in Google Sheets: File → Import → Upload → "Replace current sheet".
// Re-run for a fresh export any time; it always prints every response.
//
// Sibling of scripts/export-workshop-survey.mjs (the at-the-workshop survey),
// which is a separate table with a separate export. Nothing in these rows
// identifies a respondent — the follow-up survey is anonymous by design.
//
// Uses its own short-lived PrismaClient (not lib/prisma.js's warm-serverless
// singleton) so the process disconnects and exits instead of staying open.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LIKELIHOOD_LABELS = {
  1: "Very unlikely",
  2: "Unlikely",
  3: "Not sure",
  4: "Likely",
  5: "Very likely",
};

/** RFC 4180 quoting — every answer is free text from a public form. */
function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const rows = await prisma.followUpSurveyResponse.findMany({
    orderBy: { createdAt: "asc" },
  });

  // Header prints even with zero rows — an empty file is ambiguous between
  // "no responses yet" and "the export broke."
  console.log(
    [
      "submitted_at_utc",
      "event",
      "biggest_obstacle",
      "principles_likelihood_1_to_5",
      "principles_likelihood_label",
      "tool_likelihood_1_to_5",
      "tool_likelihood_label",
      "tcc_support_request",
      "would_recommend",
      "most_valuable_part",
    ].join(",")
  );
  for (const r of rows) {
    console.log(
      [
        r.createdAt.toISOString().replace("T", " ").slice(0, 19),
        r.event,
        r.biggestObstacle,
        r.principlesLikelihood,
        r.principlesLikelihood ? LIKELIHOOD_LABELS[r.principlesLikelihood] : "",
        r.toolLikelihood,
        r.toolLikelihood ? LIKELIHOOD_LABELS[r.toolLikelihood] : "",
        r.supportRequest,
        r.recommendation,
        r.mostValuable,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  console.error(`${rows.length} response(s) exported.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
