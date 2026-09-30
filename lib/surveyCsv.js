// Shared CSV shaping for the two Level Up surveys.
//
// Both the export scripts (scripts/export-*-survey.mjs) and the organizer
// notification email (lib/email.js sendSurveyResponseEmail) render the same
// columns, so the column list and the formatting live here once — otherwise
// the emailed attachment and the manual export would drift apart and no one
// would notice until two spreadsheets disagreed.

export const LIKELIHOOD_LABELS = {
  1: "Very unlikely",
  2: "Unlikely",
  3: "Not sure",
  4: "Likely",
  5: "Very likely",
};

function label(n) {
  return n ? LIKELIHOOD_LABELS[n] : "";
}

/** RFC 4180 quoting — every answer is free text from a public form. */
export function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function timestamp(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/** At-the-workshop survey (/level-up/) — WorkshopSurveyResponse rows. */
export const workshopSurvey = {
  columns: [
    "submitted_at_utc",
    "event",
    "biggest_obstacle",
    "likelihood_1_to_5",
    "likelihood_label",
    "support_request",
    "name",
  ],
  row: (r) => [
    timestamp(r.createdAt),
    r.event,
    r.biggestObstacle,
    r.likelihood,
    label(r.likelihood),
    r.supportRequest,
    r.name,
  ],
};

/** Emailed follow-up survey (/followup) — FollowUpSurveyResponse rows. */
export const followUpSurvey = {
  columns: [
    "submitted_at_utc",
    "event",
    "biggest_obstacle",
    "principles_likelihood_1_to_5",
    "principles_likelihood_label",
    "tool_likelihood_1_to_5",
    "tool_likelihood_label",
    "tcc_support_request",
    "would_recommend",
    "most_valuable_part",
  ],
  row: (r) => [
    timestamp(r.createdAt),
    r.event,
    r.biggestObstacle,
    r.principlesLikelihood,
    label(r.principlesLikelihood),
    r.toolLikelihood,
    label(r.toolLikelihood),
    r.supportRequest,
    r.recommendation,
    r.mostValuable,
  ],
};

/**
 * Whole CSV as a string, header first. The header prints even with zero rows —
 * an empty file is ambiguous between "no responses yet" and "the export broke."
 */
export function toCsv(shape, rows) {
  const lines = [shape.columns.join(",")];
  for (const r of rows) {
    lines.push(shape.row(r).map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
