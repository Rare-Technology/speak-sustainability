// Resend transactional email (Decided, Q3). Sender display name is always
// "Speak Sustainability" (Q9). The skill itself was renamed to match
// (2026-09-11 — see docs/planning/skill-install-access-spec.md's Q9 watch
// item), so the sender/subject split that section originally described has
// collapsed: subject lines now use the same "Speak Sustainability" name
// too, rather than naming the skill separately.
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
    <p>Thanks for your interest in the Speak Sustainability pilot.</p>
    <p>
      This is step 1 of 2 — it just verifies this is really your email address.
      Click below and you're not done yet, but almost: a second email with your
      install link follows right after, within a minute or two. This link
      expires in 30 minutes:
    </p>
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
    "Thanks for your interest in the Speak Sustainability pilot.",
    "",
    "This is step 1 of 2 — it just verifies this is really your email address. " +
      "Click the link below and you're not done yet, but almost: a second email " +
      "with your install link follows right after, within a minute or two.",
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
 * no wait. Subject uses "Speak Sustainability" — now the skill's own name
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

/**
 * Organizer notification — one email per Level Up survey response, to the
 * addresses in SURVEY_NOTIFY_EMAILS (comma-separated). Unset means "don't
 * notify," which is why this returns instead of throwing: a missing recipient
 * list is a deliberate off switch, not a misconfiguration, and must never cost
 * a respondent their submission.
 *
 * The cumulative CSV rides along as an attachment rather than a link: there is
 * no authenticated place to host a responses page, and a public one would put
 * the whole response set behind a guessable URL. Attachments also survive in
 * the inbox after the data is exported elsewhere.
 *
 * SURVEY_NOTIFY_ATTACH_CSV=false drops the attachment and says so in the body.
 * That exists because an attachment from a young sending domain is a strong
 * quarantine signal at filtering gateways (rare.org's Cloudflare Email
 * Security held the first one, 2026-09-30) — the answers themselves are all
 * in the message body either way, and the export scripts are unaffected.
 *
 * Callers must treat a rejection here as non-fatal — see api/followup-survey.js.
 */
export async function sendSurveyResponseEmail({ surveyName, subject, answers, csv, csvFilename, total }) {
  const to = (process.env.SURVEY_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return { skipped: true };

  // Default on: only an explicit "false"/"0" turns the attachment off.
  const attachCsv = !/^(false|0)$/i.test((process.env.SURVEY_NOTIFY_ATTACH_CSV || "").trim());

  const escape = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = answers
    .map(
      ({ question, answer }) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #dde3e8;color:#5e6a71;
            font-size:14px;vertical-align:top;width:40%;">${escape(question)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #dde3e8;font-size:15px;
            vertical-align:top;white-space:pre-wrap;">${escape(answer || "— no answer —")}</td>
      </tr>`
    )
    .join("");

  const html = `
    <p>Someone just completed the <strong>${escape(surveyName)}</strong>. Their answers are below.</p>
    <p style="color:#5e6a71;font-size:14px;">
      This is response #${total} so far.
      ${
        attachCsv
          ? `Every response to date is attached as a CSV (${escape(csvFilename)}) —
             open it in Excel, or import it into Google Sheets with File → Import → Upload.`
          : "For every response to date as a spreadsheet, run <code>npm run followup:export</code> " +
            "(or <code>npm run survey:export</code>) from the site repo."
      }
    </p>
    <table style="border-collapse:collapse;width:100%;max-width:640px;margin-top:16px;">${rows}</table>
    <p style="color:#5e6a71;font-size:13px;margin-top:24px;">
      Automated notification from speaksustainability.org. Replies to this
      address aren't monitored.
    </p>
  `.trim();

  const text = [
    `Someone just completed the ${surveyName}. Their answers:`,
    "",
    ...answers.flatMap(({ question, answer }) => [question, answer || "— no answer —", ""]),
    attachCsv
      ? `This is response #${total} so far. Every response to date is attached as ${csvFilename}.`
      : `This is response #${total} so far. For every response to date as a spreadsheet, run ` +
        "`npm run followup:export` (or `npm run survey:export`) from the site repo.",
    "",
    "Automated notification from speaksustainability.org. Replies aren't monitored.",
  ].join("\n");

  // Same Resend gotcha as the other senders: check .error explicitly rather
  // than trusting a resolved promise to mean the email actually sent.
  const { error } = await resend().emails.send({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
    ...(attachCsv
      ? {
          attachments: [
            { filename: csvFilename, content: Buffer.from(csv, "utf8").toString("base64") },
          ],
        }
      : {}),
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message || JSON.stringify(error)}`);
  }
  return { sent: to.length, attached: attachCsv };
}
