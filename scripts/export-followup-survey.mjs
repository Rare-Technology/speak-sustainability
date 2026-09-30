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
import { followUpSurvey, toCsv } from "../lib/surveyCsv.js";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.followUpSurveyResponse.findMany({
    orderBy: { createdAt: "asc" },
  });

  process.stdout.write(toCsv(followUpSurvey, rows));
  console.error(`${rows.length} response(s) exported.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
