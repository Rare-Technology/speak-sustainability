// Isolated approval gate (FR-3.3). Confirmation auto-approves for Alpha and
// Climate Week (Decided, Q1) — this function is the single place that
// decides that, so turning on manual review later (once the audience grows
// past Climate Week) is a config flip in Vercel's env var UI, not a code
// change to api/confirm.js.
//
// Defaults to true when unset: an unset var means "hasn't been consciously
// turned off," which happens to match Alpha's desired behavior — unlike the
// secrets in lib/tokens.js, this isn't something that should fail loudly if
// absent.
export function shouldAutoApprove() {
  return process.env.AUTO_APPROVE_CONTACTS !== "false";
}
