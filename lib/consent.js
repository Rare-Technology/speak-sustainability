// Single source of truth for the consent checkbox wording + its version tag.
//
// `consentTextVersion` is stamped onto every Contact row at signup
// (GDPR-5 — audit trail: which exact wording someone agreed to). Bump the
// version string any time ACCESS_CONSENT_COPY's wording changes materially
// — the two constants below must stay in sync with the literal copy in
// index.html's #waitlist-form checkboxes (there is no template shared
// between the static HTML and this server-side module, so a copy edit in
// one place needs the matching edit in the other; keep them side by side
// when editing).
export const CONSENT_TEXT_VERSION = "2026-08-25-v1";

export const ACCESS_CONSENT_COPY =
  "I agree to be contacted about pilot access and to Rare's privacy notice.";

export const FEEDBACK_CONSENT_COPY =
  "I'm open to being contacted occasionally for feedback or input on the tool.";
