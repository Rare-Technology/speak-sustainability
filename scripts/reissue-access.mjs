#!/usr/bin/env node
// Issues a fresh 90-day access token for an existing contact and re-sends the
// install-access email (FR-4.1/4.2).
//
//   npm run access:reissue -- --email someone@example.org
//   (add --dry-run to check who you'd be emailing without sending)
//
// This is the recovery path behind two promises the site already makes and
// had no tooling for: access-expired.html tells people to email support for a
// fresh link, and every revoke (scripts/revoke-access.mjs) leaves someone
// locked out. It's also the answer to "I lost the email."
//
// By default it supersedes the contact's existing live access tokens —
// revoking them as it issues the new one — so a re-issue can't quietly leave
// an older link working alongside the new one. That matters most in the case
// this is likeliest to be used for: someone forwarded or leaked their link
// and needs a clean replacement. Pass --keep-existing to issue an additional
// token instead, leaving prior ones live.
//
// Deliberately reuses lib/tokens.js and lib/email.js rather than
// re-implementing either — a re-issued token must be indistinguishable from
// one issued by api/confirm.js, and the recipient should get the same email.
//
// Uses its own short-lived PrismaClient (not lib/prisma.js's warm-serverless
// singleton) so the process disconnects and exits instead of staying open.
import { PrismaClient } from "@prisma/client";
import { buildAccessToken, accessTokenExpiry } from "../lib/tokens.js";
import { sendInstallAccessEmail } from "../lib/email.js";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { email: null, dryRun: false, keepExisting: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--keep-existing") args.keepExisting = true;
    else if (arg === "--email") args.email = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const USAGE = `
Usage:
  npm run access:reissue -- --email <address>

Options:
  --dry-run          show what would happen, issue nothing and send nothing
  --keep-existing    leave the contact's current access tokens live (default: revoke them)
`.trim();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    console.error("--email is required.\n");
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const email = args.email.trim().toLowerCase();
  const contact = await prisma.contact.findUnique({ where: { email } });

  if (!contact) {
    console.error(`No contact found with email ${email}.`);
    process.exitCode = 1;
    return;
  }

  // Re-issuing to someone who never confirmed would hand out access on an
  // unconfirmed email address — the exact thing double opt-in exists to
  // prevent (FR-2.1/GDPR-1). Send them back through signup instead.
  if (!contact.consentConfirmedAt) {
    console.error(
      `${email} has never confirmed their email (consentConfirmedAt is null). ` +
        "Ask them to sign up again rather than re-issuing — access requires a confirmed opt-in."
    );
    process.exitCode = 1;
    return;
  }

  if (contact.reviewStatus !== "approved") {
    console.error(
      `${email} has reviewStatus "${contact.reviewStatus}", not "approved". ` +
        "Approve them first — this script won't override the review gate."
    );
    process.exitCode = 1;
    return;
  }

  if (contact.markedForDeletionAt) {
    console.error(
      `${email} is marked for erasure (markedForDeletionAt ` +
        `${contact.markedForDeletionAt.toISOString()}) and will be hard-deleted on the next ` +
        "purge run. Clear the erasure request before re-issuing."
    );
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.token.findMany({
    where: { contactId: contact.id, kind: "access", revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, issuedAt: true, expiresAt: true, useCount: true },
  });

  console.log(`Contact:            ${email}`);
  console.log(`Confirmed at:       ${contact.consentConfirmedAt.toISOString()}`);
  console.log(`Install email sent: ${contact.installEmailSentAt?.toISOString() ?? "(never)"}`);
  console.log(
    `Live access tokens: ${existing.length}` +
      (existing.length && !args.keepExisting ? " (will be revoked)" : "")
  );

  if (args.dryRun) {
    console.log("\nDry run — no token issued, no email sent.");
    return;
  }

  const expiresAt = accessTokenExpiry();
  const tokenRow = await prisma.token.create({
    data: { contactId: contact.id, kind: "access", expiresAt },
  });
  const signedToken = buildAccessToken({
    tokenId: tokenRow.id,
    contactId: contact.id,
    expiresAt,
  });

  // Send before revoking the old links. If Resend fails, the contact keeps
  // whatever access they had — the failure mode is "they got no new email",
  // not "they lost the link they had and got nothing back." The token just
  // created is revoked on failure rather than left behind: nobody received
  // it, so it's a live credential with no owner.
  try {
    await sendInstallAccessEmail({ to: contact.email, token: signedToken });
  } catch (err) {
    await prisma.token.update({
      where: { id: tokenRow.id },
      data: { revokedAt: new Date() },
    });
    throw new Error(
      `Email send failed, so token ${tokenRow.id} was revoked and nothing changed for ` +
        `${email}. Underlying error: ${err.message ?? err}`
    );
  }

  if (!args.keepExisting && existing.length > 0) {
    await prisma.token.updateMany({
      where: { id: { in: existing.map((t) => t.id) } },
      data: { revokedAt: new Date() },
    });
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { installEmailSentAt: new Date() },
  });

  console.log(`\nIssued token ${tokenRow.id}, valid until ${expiresAt.toISOString().slice(0, 10)}.`);
  console.log(`Install-access email re-sent to ${email}.`);
  if (!args.keepExisting && existing.length > 0) {
    console.log(`Revoked ${existing.length} superseded token(s).`);
  }
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
