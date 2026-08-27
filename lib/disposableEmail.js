// Minimal disposable-email domain check (SEC-6, Could priority) — a soft
// heuristic logged via SignupAttempt.flagged, never blocking on its own.
// Short, deliberately non-exhaustive list of well-known throwaway-inbox
// providers; not a substitute for a maintained third-party list, but cheap
// and directionally useful at pilot scale.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "throwawaymail.com",
  "sharklasers.com",
]);

export function isDisposableEmailDomain(email) {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
