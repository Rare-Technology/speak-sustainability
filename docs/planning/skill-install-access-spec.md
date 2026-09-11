# Skill Install Access — Plan & Spec

**Status:** Decisions locked (Q1–Q9) — Phases 0–4 complete and live (2026-09-02); Phase 5 (prototypes) not started. Open before Climate Week launch: move the support contact off `bschauer@rare.org` (FR-4.4/Q5, still alpha-scoped by decision).
**Site:** speaksustainability (static, no backend today)
**Skill:** ethulin/climate-comms-review ("Climate Comms Review")
**Live version of this doc:** https://claude.ai/code/artifact/c4d11324-39a7-47b7-8d6d-f14ddde774c6 (styled, may be ahead of this file if edited there directly — treat this file as the source of truth for implementation)

A lightweight, GDPR-minded flow that turns an anonymous visitor into a known contact, hands them a working install of the Climate Comms Review skill, and gives Rare a paper trail — without building an auth system.

## Constraints

- **No WorkOS, no SSO/OAuth, no session-based auth.** Contact capture with a light gate, not a customer identity system.
- **GDPR + UK GDPR compliant** by construction — consent, minimization, retention, erasure — not bolted on later.
- **Same look and feel as the live landing page** — Rare Design System tokens (`design-tokens/build/rare-tokens.css`), existing component patterns (native `<dialog>` modals, card/button/accordion styles) already in `index.html`.
- **The install page itself must not be casually discoverable** — either a real sign-in gate, or deliberate obscurity (unguessable URL, `noindex`, no internal links, no sitemap entry).

## What "keep an eye on who's using the skill" actually means

Per the skill's own README: *"The skill contains instructions and reference material only. It ships no executable code and does not need network access."* Nothing phones home once installed — there's no event stream from inside ChatGPT/Claude/Gemini telling us the skill ran.

So "monitoring usage" here can only mean **top-of-funnel visibility**: who signed up, whose email we confirmed, who opened the access email, who visited the install page, which path/platform tab they viewed. The bad-actor safeguard is **access control before the download** (confirmed email + signed link), not runtime telemetry. True in-client usage analytics would require the skill package itself to include code that calls home — out of scope (see below).

## Flow

```
Visitor fills out waitlist form (email + role/org optional + consent checkboxes)
  → double opt-in confirmation email (30 min expiry)
    → confirms → auto-approve (Alpha & Climate Week — no manual review; revisit post-launch)
      → install-access email sent (signed link, 90-day expiry)
        → recipient opens link
          → gated install page + gated package download (token verified server-side, noindex, no crawlers)
            → Step 1: choose path — LLM Clients vs CLI Agents
              → Path A: download package (token-gated) + ChatGPT/Claude/Gemini/Enterprise tabs
              → Path B: CLI one-line install command
            → Verification: paste sample copy, run the review prompt
            → Troubleshooting & contact
```

Unconfirmed signups auto-purge after 7 days. No manual review step exists in the UI/flow for Alpha or Climate Week, but the `review_status` field and an `auto_approve` config flag are built in from the start so turning on manual review later is a config change, not new plumbing.

## Functional requirements

### 1 — Signup capture

Reuses the existing `#waitlist-form` in `index.html` (currently stubbed to `console.log` — see `form()` IIFE near the bottom of the file).

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | Reuse existing `#waitlist-form` markup/validation; replace the console.log stub with a real POST to the signup endpoint. | Must |
| FR-1.2 | Add an unticked, **required** consent checkbox ("I agree to be contacted about pilot access and to Rare's privacy notice") linked to a privacy notice. Submission blocked without it. Covers the transactional purpose only. | Must |
| FR-1.3 | Add a hidden honeypot field + minimum fill-time check as a first, invisible bot filter (no CAPTCHA). | Should |
| FR-1.4 | Rate-limit submissions per IP and per email (e.g. 5/hour) at the endpoint. | Must |
| FR-1.5 | Role/organization are **optional** fields (currently `required` in the HTML) — persisted as outreach context, never used to gate access. Email is the only required field. (Decided, Q6) | Must |
| FR-1.6 | On success, show inline confirmation ("check your inbox to confirm") rather than "you're on the list" — current stub copy overpromises before consent is confirmed. | Must |
| FR-1.7 | Add a **second, separately-unticked, optional** checkbox: "I'm open to being contacted occasionally for feedback or input on the tool." Independent of FR-1.2 — its own consent flag, doesn't block signup. (Decided, Q8) | Must |

### 2 — Confirmation (double opt-in)

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Send confirmation email within seconds of signup, containing a single-use signed token (email + timestamp + nonce, HMAC-signed). | Must |
| FR-2.2 | Token expires after 30 minutes; expired/reused tokens show a friendly re-request page, never a raw error. | Must |
| FR-2.3 | Clicking the link records `consent_confirmed_at` (timestamp) + IP/user-agent hash, then routes to a "thanks — you're on the list" page. | Must |
| FR-2.4 | Unconfirmed signups auto-purge after 7 days. | Must |

### 3 — Review & approval (deferred — not active for Alpha/Climate Week)

**Decided (Q1):** no manual review during alpha testing or Climate Week — confirming email is sufficient. Revisit once the audience opens up past launch week.

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Confirmation auto-approves — access email (§4) fires directly off `consent_confirmed_at`, no queue/review step for Alpha/Climate Week. | Must |
| FR-3.2 | Confirmed signups still land in a queryable list (spreadsheet export or minimal internal view) even though nothing blocks on it — seed for the post-launch review queue and for spotting abuse to revoke (SEC-7). | Should |
| FR-3.3 | Build the approval step as an isolated function/flag from the start (e.g. `auto_approve = true`) rather than skipping the code path — turning on manual review later should be a config flip. | Should |
| FR-3.4 | Log simple heuristic flags (disposable-email domain, duplicate signup from same IP in a short window) even without blocking, for later action. | Could |

### 4 — Install-access email

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Separate email from confirmation, sent automatically right after confirmation (no approval wait), containing the signed install-page link + one-paragraph recap. | Must |
| FR-4.2 | Access token is long-lived — **90 days** (Decided, Q2) — scoped to a single email address, individually revocable. | Must |
| FR-4.3 | Send via **Resend** (Decided, Q3), from **`speaksustainability.org`** — SPF/DKIM/DMARC records for that domain are the ones going to Rare IT (ticket #9749), currently pending propagation. `RESEND_FROM_EMAIL` is `hello@speaksustainability.org`, already set in Vercel Production and local `.env`. (`rare.org` was the original plan but was dropped: `speaksustainability.org` avoids `rare.org`'s existing SPF record entirely, matches the "Speak Sustainability" display name from Q9, and keeps this ticket's DNS changes in the one zone already being touched for the Vercel cutover — no cross-domain ambiguity.) | Must |
| FR-4.4 | Footer contact address: **`bschauer@rare.org`** for alpha (Decided, Q5). Swap to a team-owned inbox before Climate Week launch, and reassess again after. | Must |

### 5 — Install page & package gating

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Page served only when the URL carries a valid, unexpired, unrevoked signed token — verified server-side. | Must |
| FR-5.2 | **Decided (Q4):** package `.zip` downloads (standard + Claude-specific) also served through the same token-checked route as the page — never static files at a public URL. | Must |
| FR-5.3 | Path is a long random slug (e.g. `/access/9f2c…/`), never linked from the public site/sitemap/nav. Download route follows the same pattern. | Must |
| FR-5.4 | **Decided (Q7):** block crawlers on access/download paths for now — `<meta name="robots" content="noindex,nofollow">`, `robots.txt` disallow, no internal links. Revisit post-launch if AI-discoverability becomes a goal. | Must |
| FR-5.5 | Invalid/expired token shows a plain, on-brand "this link has expired — request a new one" page, not a 404/stack trace. Applies to the download route too. | Must |
| FR-5.6 | Every valid page view and download is logged (timestamp, token owner, coarse user-agent, package variant) — the only "usage" signal available (see clarification above). | Should |

### 6 — Install page content

Full page (not a modal — there's no underlying page for a modal to sit on, since this is reached via an emailed link). Content transcribed from `ai-skill-installation-flow-wireframes.md` and the skill's GitHub README.

**6.1 — Path selection (step 1 of 2):** Header `Install: Climate Comms Review`, sub-head `Choose your primary method of use.` Two large cards (reuse `.principle-card` styling): **Use with Web/Desktop LLM Clients** (ChatGPT, Claude, Gemini, Gemini Enterprise) and **Use with Command-Line Agents** (Claude Code, Codex, Cursor, etc). Selecting a card scrolls to the matching section.

**6.2 — Path A: LLM clients:** Prominent **Download Standard Package** link (`.zip`, token-gated route per FR-5.2), with a note for Claude users to use the Claude-specific package. Platform tab bar: `ChatGPT` · `Claude` · `Gemini Spark` · `Gemini Enterprise` — each panel repeats the exact numbered steps from the README's Install section verbatim.

**6.3 — Path B: CLI agents:** Title "Use with Command-Line Agents (Claude Code, Codex, Gemini CLI, Cursor, or another supported agent)." Dark terminal-style code block with copy button, containing the exact `npx skills add https://github.com/ethulin/climate-comms-review/tree/main/skill/climate-comms-re…` command. Note below: "The installer prompts you to choose an available agent. Omit `--global` for a project-only installation."

**6.4 — Verification (both paths converge):** Header `Verify installation`. Static, copyable prompt block (not an interactive form — nothing to submit to, since review happens inside the user's own LLM client):

```
Review this:
[paste the copy here]
```

Plus one line on what "it worked" looks like.

**6.5 — Troubleshooting & contact (new, not in original wireframe):** Accordion (reuse existing accordion component) of 3–5 likely failure modes per client. Direct contact line: **`bschauer@rare.org`** for alpha (Decided, Q5) — swap to a team mailbox/ticket tool before Climate Week. A visible line on the access link's 90-day expiry/renewal path.

### Email/sender naming (Decided, Q9 — updated 2026-09-11, rename complete)

Every email's **display name** is `"Speak Sustainability"` (the pilot brand the recipient recognizes from signup). **Subject lines** also use `"Speak Sustainability"` now — the sender/subject split this section originally described has collapsed, per the watch item below, now that the skill itself carries that name.

**The skill was renamed 2026-09-11** (repo transferred and renamed to `Rare-Technology/speak-sustainability-skill`, release `v1.1.0`). One fact this surfaced that wasn't known when Q9 was first decided: **the displayed name is not the same across clients**. The Agent Skills spec requires the manifest `name` field to be a lowercase-hyphenated slug matching the directory name — it can't literally be "Speak Sustainability" everywhere:

| Client | What actually appears in the Skills list |
|---|---|
| ChatGPT | `Speak Sustainability` — the only client with a separate display-name field (`agents/openai.yaml`) |
| Claude, Gemini | `speak-sustainability` — the raw slug |

`install.html`'s path-selection note (§6.1) states this per-client distinction explicitly, since that's the one surface where literal accuracy against each client's own UI matters. Email subject lines use the human-readable "Speak Sustainability" regardless of client — that's prose, not a literal match instruction, so the slug-casing distinction doesn't apply there.

> **Watch item — resolved.** The rename from "Climate Comms Review" to "Speak Sustainability" is complete: `SKILL.md`, `agents/openai.yaml`, the repo/folder path, and the two `.zip` release asset filenames were all renamed together upstream (by Erik Thulin), and this site's install page, CLI install command, and email copy (`install.html`, `lib/email.js`, `lib/skillPackage.js`, `scripts/sync-skill-package.mjs`, `confirmed.html`, `privacy/index.html`) were updated in the same pass, per this section's original instruction not to do it piecemeal.

## Data model

**Contact**

| Field | Notes |
|---|---|
| `id` | Internal identifier |
| `email` | Required, unique |
| `role`, `organization` | Optional (Decided, Q6) — context only, not used for gating |
| `consent_given_at` | Timestamp of form submit |
| `consent_confirmed_at` | Timestamp of double opt-in click; null = not yet a contact |
| `consent_text_version` | Which privacy-notice wording they agreed to |
| `feedback_consent_given_at` | Separate, optional (FR-1.7) — null unless that checkbox was ticked. Independent lawful basis, withdrawable on its own. |
| `review_status` | `pending` / `approved` / `held` / `rejected` — auto-set to `approved` on confirmation for Alpha/Climate Week (FR-3.1); field exists so manual review later is a config flip |
| `install_email_sent_at` | Null until sent |
| `source_ip_hash`, `user_agent` | Salted hash, not raw IP — abuse-signal only |
| `marked_for_deletion_at` | Set on unsubscribe/erasure request; hard-deleted on next purge run |

**Access token**

| Field | Notes |
|---|---|
| `token_id` | Opaque, random |
| `contact_id` | Owning contact |
| `kind` | `confirm` (single-use, 30 min) or `access` (multi-use, 90 days) |
| `issued_at`, `expires_at` | |
| `revoked_at` | Manual revoke path for abuse response |
| `last_used_at`, `use_count` | The only honest "usage" signal available |

**Retention:**
- Unconfirmed signups: purge after **7 days**.
- Confirmed contacts: retain while pilot relationship is active; review/delete after **12 months** of no interaction, or sooner on request.
- Rejected/held signups: retain only **30 days**.
- Access-page view logs: retain **90 days** rolling, then aggregate-only.

## GDPR / UK GDPR requirements

| ID | Requirement | Priority |
|---|---|---|
| GDPR-1 | Lawful basis is **consent** (Art. 6(1)(a)) — freely given, specific, informed, unambiguous. Unticked checkbox, not pre-ticked or bundled into T&Cs. | Must |
| GDPR-2 | Publish a short privacy notice (linked from checkboxes + every email footer): what's collected, why, retention, who it's shared with, how to withdraw/erase. | Must |
| GDPR-3 | **Decided (Q6):** data minimization — only email required; role/organization optional, never used to gate. | Must |
| GDPR-4 | Every email carries a one-click unsubscribe/erasure link, honored within 30 days (aim for immediate/automatic). | Must |
| GDPR-5 | Consent + access records double as the audit trail for accountability (Art. 5(2)). | Must |
| GDPR-6 | If the email/data vendor stores data outside UK/EEA, confirm adequacy decision or SCCs; note in the sub-processor list. | Must |
| GDPR-7 | **Decided:** confirmation/access emails are transactional (not marketing) under PECR. Feedback/input outreach is a distinct purpose requiring its own consent — captured via FR-1.7, not bundled into access-consent text. | Must |
| GDPR-8 | Consent withdrawable **per-purpose**, not all-or-nothing — a contact can opt out of feedback/input while keeping install-access emails, and vice versa. Each email type has its own scoped unsubscribe link. | Must |
| GDPR-9 | Simple DSAR path (email the contact address; respond within 30 days) — no self-service portal needed at this scale. | Should |

## Security & abuse mitigation

| ID | Requirement | Priority |
|---|---|---|
| SEC-1 | Tokens HMAC-signed (or JWT) with a server-side secret, rotated periodically; never derived from guessable data. | Must |
| SEC-2 | Confirmation tokens single-use/short-lived (30 min); access tokens long-lived but individually revocable. | Must |
| SEC-3 | HTTPS everywhere; secrets in the hosting platform's secret manager, never committed. | Must |
| SEC-4 | Rate-limit signup endpoint AND token-verification endpoint. | Must |
| SEC-5 | **Decided (Q4):** package download lives behind the same token check as the instructions page (FR-5.2/5.3). | Must |
| SEC-6 | Optional disposable-email domain block-list at signup, as a second bot filter alongside the honeypot. | Could |
| SEC-7 | Manual revoke action (even a spreadsheet flag → job that expires the token) so a leaked/abused link can be killed without affecting anyone else. | Should |

## Design-system reuse map

| Wireframe element | Source | Status |
|---|---|---|
| Path-selection cards | `.principle-card` + detail-dialog pattern (`#principle-modal`) | Reuse as-is |
| Buttons | `.btn`, `.btn-primary` | Reuse as-is |
| Accordion (troubleshooting FAQ) | Existing accordion (one-open-at-a-time) | Reuse as-is |
| Section rhythm, tokens, type scale | `rare-tokens.css` / `rare-core.css` | Reuse as-is |
| Platform tab bar (ChatGPT/Claude/Gemini/Enterprise) | — | **New** |
| Terminal / copy-command block | — | **New** |
| Gated-access status banner | — | **New** |

(Token-accurate sketches of the three new components are in the styled artifact linked at the top of this file.)

## Technical architecture

Live site is static HTML/CSS/JS, no server today. This flow needs: a form-handling endpoint, transactional email, and a place to store contacts/tokens.

**Decided (Q3, email):** Resend — Rare already has an account.

**Decided (Q3, data store):** a **new, dedicated Supabase project** for `speak-sustainability` — not the existing `change-agent-app` database.

Findings from investigating that codebase: it runs Supabase Postgres via Prisma 6, using the pgbouncer pooler (`DATABASE_URL`, port 6543, `pgbouncer=true&connection_limit=1`) for runtime queries and a direct connection (`DIRECT_DATABASE_URL`, port 5432) for migrations, hosted at `aws-1-us-east-1.pooler.supabase.com`. All five existing tables (`User`, `Session`, `UsageEvent`, `ChatThread`, `Feedback`) are shaped around WorkOS SSO accounts — nothing resembling a contact/lead/waitlist table exists there. RLS is enabled on every table but with **zero policies**: the app connects as the Postgres owner role via Prisma (bypassing RLS by ownership) and enforces per-user access in TypeScript (`userOwnsThread()`), not in SQL. That ownership pattern doesn't transfer to this flow — there are no user accounts here, so it needs its own token-scoped access model instead. Reusing the instance directly would also couple a marketing/lead-capture flow's retention and deletion lifecycle to an unrelated product's schema and deploy pipeline.

Provisioning a **new project under the same Supabase org** gets the best of both: no new vendor relationship or DPA to negotiate (procurement-free, unlike a genuinely new vendor such as Neon), the proven Prisma + pgbouncer connection pattern is ready to copy, and the RLS-enabled-no-policy convention carries over — while schema, retention/purge jobs, and deploy pipeline stay fully independent of Change Agent.

> **Follow-up, non-blocking:** Change Agent's project is hosted in AWS `us-east-1`. Worth a quick check before creating the new project on whether an EU region gives tighter data residency for this pilot's likely UK/EU-heavy audience, rather than defaulting to the same region out of habit (see GDPR-6).

**Decided stack (Option A — minimal serverless):** small serverless functions (signup, confirm, install-approve, token-verify-for-page, token-verify-for-download) + Resend + a new, dedicated Supabase Postgres project (own org, own project — not `change-agent-app`'s), accessed via Prisma following the same connection pattern proven there. Smallest amount of genuinely new infrastructure, keeps token design fully in-house, clean way to gate the download route.

## Email specs

All three emails: **From** display name `"Speak Sustainability"` (Decided, Q9).

**1. Confirmation email** — Trigger: immediately on signup submit. Subject: "Confirm your email — Speak Sustainability pilot." Body: one line of context, one button ("Confirm my email"), 30-minute expiry note, footer with privacy-notice link + "didn't request this? ignore this email."

**2. Install-access email** — Trigger: immediately on confirmation (no approval wait). Subject: "You're in — install Climate Comms Review." Body: two-sentence recap, one button ("Go to install instructions"), note the link is personal and also unlocks the download (Q4), footer with support contact (`bschauer@rare.org` for alpha) + unsubscribe/erasure link.

**3. Feedback & input request** — Trigger: **manual, ad hoc** — only to contacts with `feedback_consent_given_at` set; not an automated drip. Subject: "Quick question about your experience with Climate Comms Review." Body: plain, specific ask, no pressure framing, footer with an unsubscribe link scoped to feedback requests only. **Scope note:** this is private feedback, not a request to use anyone's words publicly — a public testimonial/quote would need its own explicit, separately-obtained publish-consent later.

## Decisions (resolved 2026-08-25)

1. **Manual review?** No, for Alpha and Climate Week (speed / small pre-qualified audience). Revisit post-launch. Build the toggle in from day one (FR-3.3).
2. **Link lifetime?** 90-day reusable access link.
3. **Email/data vendor?** Resend for email. Data store: a new, dedicated Supabase Postgres project under the same Rare org — not a reuse of `change-agent-app`'s instance. See Technical Architecture above for the full findings and rationale.
4. **Gate the download too?** Yes — same token check as the page.
5. **Support contact?** `bschauer@rare.org` for alpha. Revisit before Climate Week launch and again after.
6. **Role/org required?** No — optional.
7. **Block crawlers?** Yes, basic blocking for now (`noindex` + `robots.txt`). Revisit post-launch if AI-discoverability becomes a goal — that's a distinct research question (e.g. `llms.txt`, a skill registry), not solved by just unblocking crawlers.
8. **Email for feedback/input, not just access/updates?** Yes — via a second, separate, optional consent checkbox (FR-1.7), independently withdrawable (GDPR-8). Explicitly not testimonials/public quotes.
9. **Sender name vs. subject line naming?** Originally: sender display name = "Speak Sustainability" (brand), subject lines = "Climate Comms Review" (the skill's actual name). **Updated 2026-09-11:** the skill was renamed to match the brand, so both now use "Speak Sustainability" — see the full writeup under "Email/sender naming" above, including the per-client display-name nuance (ChatGPT shows the display name; Claude/Gemini show the lowercase slug) that surfaced during the rename.

## Implementation phases

| Phase | Scope |
|---|---|
| 0 — This document | Agree scope, resolve decisions, hand off to visual mockups. (**done**, 2026-08-25) |
| 1 — Signup + consent | Required access-consent checkbox + separate optional feedback/input checkbox (Q8), role/org made optional (Q6), honeypot, real endpoint, confirmation email (Resend) + double opt-in landing state. (**done**) |
| 2 — Access issuance | Auto-approve on confirmation (Q1) behind a config flag (FR-3.3), 90-day access-token issuance (Q2), install-access email. (**done**) |
| 3 — Gated install page + download | Token verification for both the page and package downloads (Q4), path-selection + Path A/B content, tab component, terminal block, verification section, crawler blocking (Q7). Also delivered the FAQ accordion (FR-6.5) originally slotted into Phase 4. (**done**) |
| 4 — Troubleshooting & ops | Retention/purge jobs scheduled (Vercel Cron, GET + `Authorization: Bearer $CRON_SECRET`), revoke tooling (SEC-7), feedback-consented contact export (Q8). Support contact stays `bschauer@rare.org` by decision — alpha-scoped, not yet swapped. Beyond the original scope: erasure tooling wiring up `markedForDeletionAt` (GDPR-4, previously written by nothing) and an access re-issue script, the recovery path `access-expired.html` already promised. Key versioning for token signing considered and **explicitly deferred** — it addresses routine rotation, not compromise, and stays additive later. DB monitoring/alerting **explicitly out of scope**. (**done**, 2026-09-02) |
| **5 — Prototypes** | High-fidelity mockups of the install page and emails from this spec. **← next** |

**Milestones:** Alpha testing (phases 1–4 as specified) → Climate Week launch (same flow; move support contact off a personal inbox) → Post-launch (revisit manual review, support contact's long-term home, and crawler/AI-discoverability policy together).

## Out of scope

- Runtime telemetry from inside the skill itself once installed (would require the skill package to include code that calls home — contradicts its "no executable code, no network access" design; separate decision).
- Full customer accounts, password reset flows, SSO/OAuth, or any WorkOS-style identity provider.
- A public-facing admin dashboard — a spreadsheet export or minimal internal view is enough at pilot scale.
- Automated drip campaigns or scheduled marketing sequences — the feedback/input email is manual and ad hoc.
- Requesting or publishing public testimonials/quotes — feedback stays private unless a separate, explicit publish-consent conversation happens later.

## Sources

- GitHub README for `ethulin/climate-comms-review` (install steps, repo structure)
- [`ai-skill-installation-flow-wireframes.md`](./ai-skill-installation-flow-wireframes.md) (UX rationale, adapted here to a standalone page)
- Live `index.html` and `design-tokens/build/rare-tokens.css` for the existing design system
