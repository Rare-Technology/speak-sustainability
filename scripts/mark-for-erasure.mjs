#!/usr/bin/env node
// GDPR-4 / GDPR-9 — service an erasure ("right to be forgotten") request.
//
//   npm run contacts:erase -- --email someone@example.org
//   npm run contacts:erase -- --email someone@example.org --now
//   npm run contacts:erase -- --email someone@example.org --undo
//   (add --dry-run to see what would happen without writing)
//
// The privacy notice promises a response within 30 days and the schema has
// always said markedForDeletionAt is "set on unsubscribe/erasure request;
// hard-deleted on next purge run" — until now nothing set the field and
// nothing read it. This script sets it; api/purge-unconfirmed.js (nightly)
// does the hard delete.
//
// Two modes on purpose:
//   default  mark for deletion; the nightly purge removes the row. Also
//            revokes the contact's live access tokens immediately, so access
//            stops the moment the request is honored rather than up to 24
//            hours later when the purge runs.
//   --now    mark AND hard-delete in the same run, for when someone wants
//            confirmation today rather than tomorrow.
//
// Deleting a Contact cascades to its Tokens and their AccessLogs
// (prisma/schema.prisma), so an erasure takes the access links and the view
// history with it. That is intended: none of it is separable from the person.
//
// Uses its own short-lived PrismaClient (not lib/prisma.js's warm-serverless
// singleton) so the process disconnects and exits instead of staying open.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { email: null, now: false, undo: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--now") args.now = true;
    else if (arg === "--undo") args.undo = true;
    else if (arg === "--email") args.email = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const USAGE = `
Usage:
  npm run contacts:erase -- --email <address>          mark for deletion; nightly purge removes it
  npm run contacts:erase -- --email <address> --now    mark and hard-delete immediately
  npm run contacts:erase -- --email <address> --undo   clear a pending erasure request

Options:
  --dry-run    show what would happen, write nothing
`.trim();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    console.error("--email is required.\n");
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  if (args.now && args.undo) {
    console.error("--now and --undo are contradictory. Pick one.");
    process.exitCode = 1;
    return;
  }

  const email = args.email.trim().toLowerCase();
  const contact = await prisma.contact.findUnique({
    where: { email },
    include: { _count: { select: { tokens: true } } },
  });

  if (!contact) {
    // Not an error worth a non-zero exit: "there is no record of this person"
    // is a perfectly good answer to give someone who asked to be erased.
    console.log(`No contact found with email ${email}. Nothing to erase.`);
    return;
  }

  console.log(`Contact:        ${email}`);
  console.log(`Signed up:      ${contact.createdAt.toISOString()}`);
  console.log(`Confirmed:      ${contact.consentConfirmedAt?.toISOString() ?? "(never)"}`);
  console.log(`Tokens on file: ${contact._count.tokens}`);
  console.log(
    `Marked for erasure: ${contact.markedForDeletionAt?.toISOString() ?? "(not marked)"}`
  );

  if (args.undo) {
    if (!contact.markedForDeletionAt) {
      console.log("\nNot currently marked for erasure. Nothing to undo.");
      return;
    }
    if (args.dryRun) {
      console.log("\nDry run — the erasure mark would be cleared. Nothing written.");
      return;
    }
    await prisma.contact.update({
      where: { id: contact.id },
      data: { markedForDeletionAt: null },
    });
    console.log(
      "\nErasure request cleared. Note this does NOT un-revoke access tokens — " +
        "re-issue with `npm run access:reissue -- --email <address>` if they need a link."
    );
    return;
  }

  if (args.dryRun) {
    console.log(
      args.now
        ? "\nDry run — the contact and all cascaded tokens/logs would be deleted now."
        : "\nDry run — the contact would be marked for erasure and their access tokens revoked."
    );
    return;
  }

  if (args.now) {
    await prisma.contact.delete({ where: { id: contact.id } });
    console.log(
      `\nHard-deleted ${email}, including ${contact._count.tokens} token(s) and their access logs.`
    );
    return;
  }

  // Mark, then kill access straight away. The mark alone only takes effect on
  // the next nightly purge, and leaving a valid install link working in the
  // meantime is not what someone asking to be erased expects.
  const now = new Date();
  const [, revoked] = await prisma.$transaction([
    prisma.contact.update({
      where: { id: contact.id },
      data: { markedForDeletionAt: contact.markedForDeletionAt ?? now },
    }),
    prisma.token.updateMany({
      where: { contactId: contact.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  console.log(
    `\nMarked ${email} for erasure and revoked ${revoked.count} live token(s). ` +
      "The row is hard-deleted on the next /api/purge-unconfirmed run (nightly, 03:00 UTC)."
  );
  console.log("To delete immediately instead, re-run with --now.");
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
