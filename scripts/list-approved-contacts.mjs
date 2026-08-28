#!/usr/bin/env node
// FR-3.2 (Should) — queryable list of confirmed/approved contacts. No UI at
// this scale; run manually against the same DATABASE_URL as the app.
//
//   node scripts/list-approved-contacts.mjs
//
// Uses its own short-lived PrismaClient (not lib/prisma.js's warm-serverless
// singleton) so the process disconnects and exits instead of staying open.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const contacts = await prisma.contact.findMany({
    where: { consentConfirmedAt: { not: null }, reviewStatus: "approved" },
    orderBy: { consentConfirmedAt: "desc" },
    select: {
      email: true,
      organization: true,
      role: true,
      consentConfirmedAt: true,
      installEmailSentAt: true,
    },
  });

  if (contacts.length === 0) {
    console.log("No confirmed/approved contacts yet.");
    return;
  }

  console.table(
    contacts.map((c) => ({
      email: c.email,
      organization: c.organization ?? "",
      role: c.role ?? "",
      confirmedAt: c.consentConfirmedAt?.toISOString() ?? "",
      installEmailSentAt: c.installEmailSentAt?.toISOString() ?? "(not sent)",
    }))
  );
  console.log(`\n${contacts.length} confirmed/approved contact(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
