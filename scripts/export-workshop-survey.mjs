#!/usr/bin/env node
// Level Up workshop survey responses → CSV, for pasting/importing into Google Sheets.
//
//   npm run survey:export > level-up-survey.csv
//
// Then in Google Sheets: File → Import → Upload → "Replace current sheet".
// Re-run for a fresh export any time; it always prints every response.
//
// Uses its own short-lived PrismaClient (not lib/prisma.js's warm-serverless
// singleton) so the process disconnects and exits instead of staying open.
import { PrismaClient } from "@prisma/client";
import { workshopSurvey, toCsv } from "../lib/surveyCsv.js";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.workshopSurveyResponse.findMany({
    orderBy: { createdAt: "asc" },
  });

  process.stdout.write(toCsv(workshopSurvey, rows));
  console.error(`${rows.length} response(s) exported.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
