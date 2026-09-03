#!/usr/bin/env node
// Q8 / FR-1.7 — the "who can I email" list for the manual feedback & input
// request (spec's Email spec #3).
//
//   npm run contacts:feedback
//   npm run contacts:feedback -- --csv
//
// That email is deliberately manual and ad hoc — there is no automated send
// infrastructure for it and this script does not send anything. It exists
// only so the ad-hoc send goes to the right list: contacts who ticked the
// separate, optional feedback checkbox, which is an independent lawful basis
// from the access/transactional consent (GDPR-7/GDPR-8).
//
// Three filters, all of them required for this list to be lawful to use:
//   feedbackConsentGivenAt  — they opted in to THIS purpose specifically
//   consentConfirmedAt      — double opt-in completed; an unconfirmed address
//                             was never verified as theirs
//   markedForDeletionAt     — excluded; an erasure request is pending
//
// Sibling of scripts/list-approved-contacts.mjs, which answers the different
// question of who has install access.
//
// Uses its own short-lived PrismaClient (not lib/prisma.js's warm-serverless
// singleton) so the process disconnects and exits instead of staying open.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** RFC 4180-ish quoting — organization/role are free text from a public form. */
function csvCell(value) {
  const s = value ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const csv = process.argv.slice(2).includes("--csv");

  const contacts = await prisma.contact.findMany({
    where: {
      feedbackConsentGivenAt: { not: null },
      consentConfirmedAt: { not: null },
      markedForDeletionAt: null,
    },
    orderBy: { feedbackConsentGivenAt: "desc" },
    select: {
      email: true,
      organization: true,
      role: true,
      feedbackConsentGivenAt: true,
      installEmailSentAt: true,
    },
  });

  if (contacts.length === 0 && !csv) {
    console.log("No contacts have consented to feedback/input requests yet.");
    return;
  }

  if (csv) {
    // Header prints even with zero rows — an empty file is ambiguous between
    // "no one consented" and "the export broke."
    // Plain stdout, no console.table framing — this is meant to be piped to a
    // file and pasted into a mail merge: `npm run contacts:feedback -- --csv > feedback.csv`
    console.log("email,organization,role,feedback_consent_given_at,install_email_sent_at");
    for (const c of contacts) {
      console.log(
        [
          csvCell(c.email),
          csvCell(c.organization),
          csvCell(c.role),
          c.feedbackConsentGivenAt.toISOString(),
          c.installEmailSentAt?.toISOString() ?? "",
        ].join(",")
      );
    }
    return;
  }

  console.table(
    contacts.map((c) => ({
      email: c.email,
      organization: c.organization ?? "",
      role: c.role ?? "",
      feedbackConsentAt: c.feedbackConsentGivenAt.toISOString().slice(0, 10),
      installEmailSentAt: c.installEmailSentAt?.toISOString().slice(0, 10) ?? "(not sent)",
    }))
  );
  console.log(`\n${contacts.length} contact(s) consented to feedback/input requests.`);
  console.log(
    "Each of these can withdraw feedback consent independently of access consent (GDPR-8) — " +
      "re-run this list immediately before sending, never reuse an older export."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
