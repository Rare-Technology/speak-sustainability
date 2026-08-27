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
