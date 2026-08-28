// Resend transactional email (Decided, Q3). Sender display name is always
// "Speak Sustainability" (Q9) — the brand the recipient recognizes from
// signup; subject lines that name the skill are added per-email, not here.
import { Resend } from "resend";

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

/** Confirmation email — FR-2.1. Sent immediately on signup submit. */
export async function sendConfirmationEmail({ to, token }) {
  const confirmUrl = `${siteUrl()}/api/confirm?t=${encodeURIComponent(token)}`;
  const privacyUrl = `${siteUrl()}/privacy/`;

  const html = `
    <p>Thanks for your interest in the Climate Comms Review pilot.</p>
    <p>Confirm your email to finish signing up — this link expires in 30 minutes:</p>
    <p><a href="${confirmUrl}" style="display:inline-block;background:#005bbb;color:#ffffff;
       padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
       Confirm my email</a></p>
    <p style="color:#5e6a71;font-size:14px;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${confirmUrl}">${confirmUrl}</a>
    </p>
    <p style="color:#5e6a71;font-size:13px;margin-top:24px;">
      Didn't request this? Ignore this email — no account will be created.<br>
      <a href="${privacyUrl}">Privacy notice</a>
    </p>
  `.trim();

  const text = [
    "Thanks for your interest in the Climate Comms Review pilot.",
    "",
    `Confirm your email (expires in 30 minutes): ${confirmUrl}`,
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
    subject: "Confirm your email — Speak Sustainability pilot",
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`);
  }
}

/**
 * Install-access email — FR-4.1. Sent immediately on approval (FR-3.1/3.3),
 * no wait. Subject names the skill itself, not the "Speak Sustainability"
 * brand (Q9) — the recipient needs to match it against their LLM client's
 * own Skills UI after installing.
 */
export async function sendInstallAccessEmail({ to, token }) {
  // The signed token is itself the unguessable path segment (FR-5.3) — no
  // separate slug to generate or store. /access/<token> isn't gated yet
  // (Phase 3); it currently resolves to a static "coming very soon" page.
  const accessUrl = `${siteUrl()}/access/${token}`;
  const privacyUrl = `${siteUrl()}/privacy/`;
  const supportEmail = "bschauer@rare.org"; // FR-4.4 — alpha only, swap before Climate Week

  const html = `
    <p>You're in — Climate Comms Review is ready to install.</p>
    <p>
      Climate Comms Review reviews climate, energy, and sustainability
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
    "You're in — Climate Comms Review is ready to install.",
    "",
    "Climate Comms Review reviews climate, energy, and sustainability communications " +
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
    subject: "You're in — install Climate Comms Review",
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`);
  }
}
