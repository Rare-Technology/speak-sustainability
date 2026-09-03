#!/usr/bin/env node
// SEC-7 — manual revoke path for a leaked or abused access link.
//
//   npm run access:revoke -- --email someone@example.org
//   npm run access:revoke -- --token-id <Token.id>
//   npm run access:revoke -- --all
//   (add --dry-run to see what would be revoked without writing)
//
// Sets Token.revokedAt, which lib/accessToken.js#verifyAccessToken checks on
// every /access/:token page view and package download — so a revoke takes
// effect on the very next request, with no deploy and no env change. The
// signed token string in the recipient's email still has a valid signature;
// the DB row is the source of truth, which is exactly why the row exists.
//
// Scoped to kind="access" on purpose. Confirm tokens are single-use and live
// 30 minutes; revoking one only strands somebody mid-signup, and the abuse
// case this tool exists for is always a shared/leaked install link.
//
// --all vs. rotating CONFIRM_TOKEN_SECRET: both kill every outstanding link.
// Prefer --all. It leaves an auditable revokedAt timestamp per token, needs
// no redeploy, and doesn't also invalidate in-flight confirm links. Rotating
// the secret is the break-glass for the different case where the SECRET
// itself leaked and signatures can no longer be trusted at all — see the
// runbook in README.md.
//
// Key versioning (a `kid` in the token payload + multiple accepted secrets,
// so the signing key can rotate without invalidating live links) is
// deliberately NOT built here. It solves routine rotation hygiene, not
// compromise — in a leak you WANT everything invalidated. It also stays
// available later at no extra cost: lib/tokens.js can treat a payload with no
// `kid` as key v1, so tokens already in the wild keep verifying.
//
// Uses its own short-lived PrismaClient (not lib/prisma.js's warm-serverless
// singleton) so the process disconnects and exits instead of staying open.
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { dryRun: false, yes: false, all: false, email: null, tokenId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--yes" || arg === "-y") args.yes = true;
    else if (arg === "--all") args.all = true;
    else if (arg === "--email") args.email = argv[++i];
    else if (arg === "--token-id") args.tokenId = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const USAGE = `
Usage:
  npm run access:revoke -- --email <address>     revoke every live access token for one contact
  npm run access:revoke -- --token-id <id>       revoke one specific token
  npm run access:revoke -- --all                 revoke every live access token (asks to confirm)

Options:
  --dry-run    list what would be revoked, write nothing
  --yes, -y    skip the confirmation prompt on --all
`.trim();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const selectors = [args.all, Boolean(args.email), Boolean(args.tokenId)].filter(Boolean);
  if (selectors.length !== 1) {
    console.error(
      selectors.length === 0
        ? "Nothing selected.\n"
        : "Pick exactly one of --email, --token-id, --all.\n"
    );
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  // "Live" = an access token that would still verify today. Already-revoked
  // and already-expired tokens are left alone: re-stamping revokedAt on them
  // would overwrite the timestamp of when the revoke actually happened.
  const where = {
    kind: "access",
    revokedAt: null,
    expiresAt: { gt: new Date() },
  };
  if (args.email) where.contact = { email: args.email.trim().toLowerCase() };
  if (args.tokenId) where.id = args.tokenId;

  const targets = await prisma.token.findMany({
    where,
    orderBy: { issuedAt: "desc" },
    include: { contact: { select: { email: true } } },
  });

  if (targets.length === 0) {
    if (args.email) {
      // Distinguish "no such contact" from "contact exists, nothing live to
      // revoke" — otherwise a typo'd address looks like a successful no-op.
      const contact = await prisma.contact.findUnique({
        where: { email: args.email.trim().toLowerCase() },
        select: { id: true },
      });
      console.log(
        contact
          ? `No live access tokens for ${args.email} — already revoked, expired, or never issued.`
          : `No contact found with email ${args.email}. Nothing revoked.`
      );
      return;
    }
    console.log("No live access tokens match. Nothing to revoke.");
    return;
  }

  console.table(
    targets.map((t) => ({
      tokenId: t.id,
      email: t.contact.email,
      issuedAt: t.issuedAt.toISOString().slice(0, 10),
      expiresAt: t.expiresAt.toISOString().slice(0, 10),
      useCount: t.useCount,
      lastUsedAt: t.usedAt?.toISOString().slice(0, 10) ?? "(never)",
    }))
  );

  if (args.dryRun) {
    console.log(`\nDry run — ${targets.length} token(s) would be revoked. Nothing written.`);
    return;
  }

  if (args.all && !args.yes) {
    if (!process.stdin.isTTY) {
      console.error(
        "\n--all needs an interactive terminal to confirm. Re-run with --yes if you're sure."
      );
      process.exitCode = 1;
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `\nRevoke all ${targets.length} live access token(s)? Everyone above loses their install ` +
        `link immediately. Type "revoke all" to confirm: `
    );
    rl.close();
    if (answer.trim() !== "revoke all") {
      console.log("Aborted. Nothing revoked.");
      return;
    }
  }

  const result = await prisma.token.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { revokedAt: new Date() },
  });

  console.log(`\nRevoked ${result.count} access token(s).`);
  console.log(
    "Anyone revoked here now lands on /access-expired.html, which tells them to email " +
      "support for a fresh link — issue one with `npm run access:reissue -- --email <address>`."
  );
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
