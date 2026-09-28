// Resend transactional email (Decided, Q3). Sender display name is always
// "Speak Sustainability" (Q9). The skill itself was renamed to match
// (2026-09-11 — see docs/planning/skill-install-access-spec.md's Q9 watch
// item), so the sender/subject split that section originally described has
// collapsed: subject lines now use the same "Speak Sustainability" name
// too, rather than naming the skill separately.
import { Resend } from "resend";
import { shouldAutoApprove } from "./approval.js";

let client;
function resend() {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(key);
  }
  return client;
}

function fromAddress() {
  // e.g. "hello@speaksustainability.org" — must be on a domain with SPF/DKIM/DMARC
  // configured in Resend (FR-4.3). No default: fail loudly rather than silently
  // sending from an unverified/placeholder address.
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not set");
  return `Speak Sustainability <${from}>`;
}

function siteUrl() {
  const url = process.env.PUBLIC_SITE_URL;
  if (!url) throw new Error("PUBLIC_SITE_URL is not set");
  return url.replace(/\/$/, "");
}

/**
 * Confirmation email — FR-2.1. Sent immediately on signup submit. This is the
 * only email in the signup flow: its link confirms the address AND opens the
 * install page (api/confirm.js), and keeps doing so on later clicks for as
 * long as the access link it issued is live — so it's written as the email
 * to keep, not a throwaway "step 1 of 2".
 *
 * With manual review on (lib/approval.js), a click only confirms; the copy
 * says so, and the install link follows in sendInstallAccessEmail on approval.
 */
export async function sendConfirmationEmail({ to, token }) {
  const confirmUrl = `${siteUrl()}/api/confirm?t=${encodeURIComponent(token)}`;
  const privacyUrl = `${siteUrl()}/privacy/`;
  const oneStep = shouldAutoApprove();

  const intro = oneStep
    ? "Confirm your email and you'll go straight to your install instructions — " +
      "no second email to wait for. Setup takes about two minutes and works best " +
      "on a laptop or desktop."
    : "Confirm your email below. Once your pilot access is approved, we'll email " +
      "you your install link.";
  const buttonLabel = oneStep ? "Confirm &amp; get install instructions" : "Confirm my email";
  const keepNote = oneStep
    ? "Keep this email: the same button takes you back to your install page " +
      "for 90 days. It's personal to you — please don't forward it. Click it for the " +
      "first time within 7 days."
    : "Click it for the first time within 7 days.";

  const html = `
    <p>Thanks for signing up for the Speak Sustainability pilot.</p>
    <p>${intro}</p>
    <p><a href="${confirmUrl}" style="display:inline-block;background:#005bbb;color:#ffffff;
       padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
       ${buttonLabel}</a></p>
    <p style="color:#5e6a71;font-size:14px;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${confirmUrl}">${confirmUrl}</a>
    </p>
    <p style="color:#5e6a71;font-size:13px;">${keepNote}</p>
    <p style="color:#5e6a71;font-size:13px;margin-top:24px;">
      Didn't request this? Ignore this email — no account will be created.<br>
      <a href="${privacyUrl}">Privacy notice</a>
    </p>
  `.trim();

  const text = [
    "Thanks for signing up for the Speak Sustainability pilot.",
    "",
    intro,
    "",
    `${oneStep ? "Confirm & get install instructions" : "Confirm your email"}: ${confirmUrl}`,
    "",
    keepNote,
    "",
    "Didn't request this? Ignore this email — no account will be created.",
    `Privacy notice: ${privacyUrl}`,
  ].join("\n");

  // The Resend SDK resolves with { data, error } rather than throwing on
  // API-level failures (bad domain, invalid recipient, etc.) — check .error
  // explicitly, otherwise a misconfigured sender would silently "succeed"
  // from the caller's point of view while no email is actually sent.
  const { error } = await resend().emails.send({
    from: fromAddress(),
    to,
    subject: oneStep
      ? "Confirm your email to install Speak Sustainability"
      : "Confirm your email — Speak Sustainability pilot",
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`);
  }
}

/**
 * Install-access email — FR-4.1. No longer part of the normal signup flow
 * (the confirm click now lands on the install page directly — see
 * api/confirm.js). Still sent when an already-confirmed contact resubmits the
 * form (api/signup.js — "I lost the email"), by scripts/reissue-access.mjs,
 * and on approval if manual review is ever switched on (FR-3.3). Subject uses "Speak Sustainability" — now the skill's own name
 * too (2026-09-11 rename), not a separate brand-vs-skill split (Q9). Note
 * install.html itself still needs to say the exact per-client name/casing
 * (ChatGPT: "Speak Sustainability"; Claude/Gemini: the slug
 * "speak-sustainability") since that's the one surface where literal
 * accuracy against the Skills UI matters — this subject line is prose, not
 * a literal match instruction.
 */
export async function sendInstallAccessEmail({ to, token }) {
  // The signed token is itself the unguessable path segment (FR-5.3) — no
  // separate slug to generate or store. /access/<token> isn't gated yet
  // (Phase 3); it currently resolves to a static "coming very soon" page.
  const accessUrl = `${siteUrl()}/access/${token}`;
  const privacyUrl = `${siteUrl()}/privacy/`;
  const supportEmail = "bschauer@rare.org"; // FR-4.4 — alpha only, swap before Climate Week

  const html = `
    <p>You're in — Speak Sustainability is ready to install.</p>
    <p>
      Speak Sustainability reviews climate, energy, and sustainability
      communications against eight principles for accuracy and impact —
      paste your copy in and it flags where it overclaims, goes vague, or
      could land better.
    </p>
    <p><a href="${accessUrl}" style="display:inline-block;background:#005bbb;color:#ffffff;
       padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
       Go to install instructions</a></p>
    <p style="color:#5e6a71;font-size:14px;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${accessUrl}">${accessUrl}</a>
    </p>
    <p style="color:#5e6a71;font-size:13px;">
      This link is personal to you and also unlocks the package download —
      don't share it. It stays active for 90 days.
    </p>
    <p style="color:#5e6a71;font-size:13px;margin-top:24px;">
      Questions or trouble installing? <a href="mailto:${supportEmail}">${supportEmail}</a><br>
      <a href="${privacyUrl}">Privacy notice</a>
    </p>
    <p style="color:#5e6a71;font-size:13px;margin-top:12px;">
      Don't want emails like this from us? Reply to this address or email
      <a href="mailto:${supportEmail}">${supportEmail}</a> and we'll remove you —
      your access link above stays active either way.
    </p>
  `.trim();

  const text = [
    "You're in — Speak Sustainability is ready to install.",
    "",
    "Speak Sustainability reviews climate, energy, and sustainability communications " +
      "against eight principles for accuracy and impact — paste your copy in and it " +
      "flags where it overclaims, goes vague, or could land better.",
    "",
    `Install instructions: ${accessUrl}`,
    "",
    "This link is personal to you and also unlocks the package download — don't share it. " +
      "It stays active for 90 days.",
    "",
    `Questions or trouble installing? ${supportEmail}`,
    `Privacy notice: ${privacyUrl}`,
    "",
    `Don't want emails like this from us? Reply to this address or email ${supportEmail} ` +
      "and we'll remove you — your access link above stays active either way.",
  ].join("\n");

  // Same Resend gotcha as sendConfirmationEmail above: check .error explicitly
  // rather than trusting a resolved promise to mean the email actually sent.
  const { error } = await resend().emails.send({
    from: fromAddress(),
    to,
    subject: "You're in — install Speak Sustainability",
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`);
  }
}

/**
 * "Finish on a computer" reminder — requested from install.html's phone
 * panel (api/remind.js). No client lets you add a skill from its phone app,
 * so this re-sends the same access link for when the visitor is back at a
 * computer. Transactional and explicitly requested, so it sits under the
 * existing access consent (FR-1.2) — no new consent flag.
 *
 * scheduledAt (ISO string) uses Resend's scheduled send (max 30 days ahead)
 * rather than a cron + queue table; omit it to send immediately.
 */
export async function sendInstallReminderEmail({ to, token, scheduledAt }) {
  const accessUrl = `${siteUrl()}/access/${token}`;
  const privacyUrl = `${siteUrl()}/privacy/`;
  const supportEmail = "bschauer@rare.org"; // FR-4.4 — same alpha-scoped address as the access email

  const html = `
    <p>Here's the reminder you asked for — Speak Sustainability is ready to install.</p>
    <p>
      <strong>Open this on your laptop or desktop.</strong> ChatGPT, Claude, and
      Gemini only let you add skills from a computer — setup takes about two
      minutes, and once it's installed you can use it from your phone too.
    </p>
    <p><a href="${accessUrl}" style="display:inline-block;background:#005bbb;color:#ffffff;
       padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
       Go to install instructions</a></p>
    <p style="color:#5e6a71;font-size:14px;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${accessUrl}">${accessUrl}</a>
    </p>
    <p style="color:#5e6a71;font-size:13px;">
      This is the same personal link from your earlier email — don't share it.
    </p>
    <p style="color:#5e6a71;font-size:13px;margin-top:24px;">
      Questions or trouble installing? <a href="mailto:${supportEmail}">${supportEmail}</a><br>
      <a href="${privacyUrl}">Privacy notice</a>
    </p>
  `.trim();

  const text = [
    "Here's the reminder you asked for — Speak Sustainability is ready to install.",
    "",
    "Open this on your laptop or desktop. ChatGPT, Claude, and Gemini only let you add " +
      "skills from a computer — setup takes about two minutes, and once it's installed " +
      "you can use it from your phone too.",
    "",
    `Install instructions: ${accessUrl}`,
    "",
    "This is the same personal link from your earlier email — don't share it.",
    "",
    `Questions or trouble installing? ${supportEmail}`,
    `Privacy notice: ${privacyUrl}`,
  ].join("\n");

  const { error } = await resend().emails.send({
    from: fromAddress(),
    to,
    subject: "Ready to install Speak Sustainability?",
    html,
    text,
    ...(scheduledAt ? { scheduledAt } : {}),
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`);
  }
}
