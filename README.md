# Speak Sustainability — marketing landing page

Pre-launch waitlist page for **Speak Sustainability**, a Rare product and sibling to
[Change Agent](https://changeagent.earth). Built as a standalone static site using the
**same stack, tooling, and Rare Design System tokens** as the Change Agent site
(`../change-agent-site`), so the two read as one family.

## Stack

Plain static HTML/CSS/JS — no framework, no build step for the page itself. Design tokens
are generated from DTCG JSON via **Style Dictionary** (`design-tokens/`), and the built CSS
is committed and served statically. Fonts are self-hosted (no third-party requests).

## Local dev

```bash
npm install            # dev tooling only (http-server, lighthouse)
npm run serve          # http://localhost:8080
```

Or any static server, e.g. `python3 -m http.server 8123`.

## Re-theming (design tokens)

```bash
npm run tokens:build   # rebuilds design-tokens/build/*.css from the DTCG source
```

Edit the DTCG source under `design-tokens/tokens/**`, never the generated
`design-tokens/build/*.css`. Speak Sustainability's departures from the Change Agent
theme are all at the token level:

- **`surface.brand` → Rare Green (`#008542`).** The hero leads with green instead of Rare
  Blue. Green `.500` is the brand-guide primary and keeps the white hero headline at
  WCAG AA (4.7:1); the mockup's lighter lime (`#8EB72B`) would have failed (~2.3:1).
- **New gold accent family** (`color.yellow.100 / .500 / .700`) for the featured
  "Comms Critique" use-case card. Change Agent's palette had only `yellow.500`; the
  `.100` tint (card surface) and `.700` AA-safe ink (eyebrow + card copy) were added
  following the same `100/500/700` convention as the other secondary accents.
- `action.primary` stays Rare Blue (nav buttons, links, form, most eyebrows).

## Decisions / flags for review

These were called out in the brief as things to confirm rather than guess:

1. **Hero green** — used Rare brand green `#008542` (accessible) instead of the mockup's
   lighter lime, which fails white-text contrast. Swap `surface.brand` if a lighter green
   is preferred *and* the headline treatment is changed to keep AA.
2. **Gold accent hex** — introduced as a new token family (see above). Values match the
   mockup; adjust in `tokens/primitives/color.json` if the brand gold differs.
3. **Footer "Contact" link** — placeholder `href="#"` with a `TODO` in `index.html`.
   Point it at the real destination (mailto: or a contact page).
4. **Accordion behavior** — one-open-at-a-time, matching the Change Agent accordion.
5. **Accordion body copy** — ~20 words of lorem ipsum per row, held in a single
   `ACCORDION_COPY` array in `index.html` for trivial swap-in of real copy.
6. **Rare logomark** — `assets/rare-logo.svg` is the **official vector**, converted from the
   supplied Pantone-Coated print EPS (`EPS → PDF → SVG`, fully vector, no raster). The print
   spot colors were normalized to the site's brand token RGB (blue `#005bbb`, green `#008542`,
   gray `#5e6a71`) so the footer mark matches the rest of the page; the raw CMYK→RGB
   conversion came out lighter (`#2D6DBE` / `#128342`). Placed top-right in the footer above
   the links, per the mockup. To regenerate: `gs -dEPSCrop -sDEVICE=pdfwrite` then `pdf2svg`.
7. **Speak Sustainability logo** — the real logo (`assets/speak-sustainability-logo.svg`,
   vector wordmark + embedded leaf mark) is used in the nav and footer, sized by height
   (26px desktop / 22px mobile). Its `viewBox` was cropped to the content bounds so it sizes
   with no dead space. The nav pairs it with a separate "by Rare" sublabel (hidden on mobile).
8. **Waitlist form** — now posts to a real backend (`api/signup.js`, see "Signup backend"
   below). Superseded: it used to be stubbed (validate/log/no-op) like the Change Agent
   waitlist.

## Signup backend (Phases 1–3 of `docs/planning/skill-install-access-spec.md`)

The waitlist form (`#signup` in `index.html`) posts to small Vercel serverless
functions in `api/`, backed by a dedicated Supabase Postgres project via Prisma
(`prisma/schema.prisma`) — not the `change-agent-app` database. Double opt-in signup
through install-access-email issuance through the gated install page and token-gated
package downloads are all built, as is Phase 4 (scheduled purge jobs, revoke/erasure/
re-issue tooling, the feedback-consent export — see "Ops runbook" below).

- `api/signup.js` — validates + rate-limits (5/hour per IP and per email), upserts a
  `Contact`, and emails a 30-minute signed confirm link via Resend.
- `api/confirm.js` — verifies the link, sets `consentConfirmedAt`, and auto-approves
  (`lib/approval.js` — a config flag, `AUTO_APPROVE_CONTACTS`, not hardcoded, so
  switching to manual review later doesn't touch this file). On approval it issues a
  90-day signed access token and sends the install-access email
  (`lib/email.js#sendInstallAccessEmail`), then redirects to `confirmed.html` or
  `confirm-expired.html`.
- `api/access.js` — FR-5.1, the real `/access/:token` handler (`vercel.json` rewrites
  the path here). Verifies the access token server-side (`lib/accessToken.js` — multi-use,
  unlike the confirm token, so no single-use/replay check), logs the view and bumps the
  token's usage counters (`lib/accessLog.js`), and serves `install.html`'s content. An
  invalid/expired/revoked token redirects to `access-expired.html` instead (FR-5.5).
- `install.html` — the real install page content (FR-6): path selection, the platform
  tab bar and package downloads (Path A), the CLI terminal block (Path B), the
  verification prompt, and a troubleshooting accordion. Reads its own access token out
  of `location.pathname` client-side (the URL stays `/access/<token>` — it's a rewrite,
  not a redirect) to build its two download links.
- `api/access-download.js` — FR-5.2/5.3, the token-gated package download route
  (`?t=<token>&variant=standard|claude`). Same token check as `api/access.js`, then
  streams the requested `.zip` from private Vercel Blob storage — see "Package storage"
  below.
- `access-expired.html` — FR-5.5, plain on-brand page for an invalid/expired/revoked
  access token (no self-service resend, unlike `confirm-expired.html` — just a support
  contact).
- `api/purge-unconfirmed.js` — deletes unconfirmed signups older than 7 days (FR-2.4)
  and contacts marked for erasure (GDPR-4). Runs nightly at **03:00 UTC** via the
  `crons` array in `vercel.json`.
- `api/purge-access-logs.js` — deletes `AccessLog` rows older than 90 days (spec
  retention: "90 days rolling, then aggregate-only" — the surviving aggregate is
  `Token.usedAt`/`useCount`, never purged). Runs nightly at **04:00 UTC**, an hour
  behind the contact purge so cascaded deletes settle first.
- `lib/cronAuth.js` — shared authorization for both purge jobs. Vercel Cron sends an
  HTTP **GET** with `Authorization: Bearer $CRON_SECRET`; a human can trigger a run on
  demand with **POST** + `x-purge-job-secret: $PURGE_JOB_SECRET`. Either credential is
  accepted; if neither secret is configured, nothing is authorized.
- `robots.txt` — disallows the `/access` path prefix (FR-5.4); `install.html` and
  `access-expired.html` also carry their own `noindex,nofollow` meta tag.
- `privacy/index.html` — the privacy notice the consent checkbox links to.
- `scripts/list-approved-contacts.mjs` (`npm run contacts:approved`) — FR-3.2,
  queryable list of confirmed/approved contacts. No UI at this scale.
- `scripts/sync-skill-package.mjs` (`npm run skill:sync`) — manual, not scheduled;
  see "Package storage" below.
- `scripts/revoke-access.mjs`, `scripts/reissue-access.mjs`,
  `scripts/mark-for-erasure.mjs`, `scripts/list-feedback-contacts.mjs` — see
  "Ops runbook" below.

**Setup required before this works in any environment:**

1. Copy `.env.example` to `.env` (local) or set the same keys in Vercel's env var UI.
2. Create a new Supabase Postgres project under Rare's org (**not** `change-agent-app`'s)
   and fill in `DATABASE_URL` (pooled, port 6543) / `DIRECT_DATABASE_URL` (direct, port
   5432) from its connection settings.
3. Run `npm run prisma:migrate:deploy` (applies `prisma/migrations/20260825000000_init/`
   and `prisma/migrations/20260828120000_access_log/`), then
   `npx prisma db execute --schema=prisma/schema.prisma --file=prisma/enable-rls.sql`
   to enable RLS with zero policies on the new tables — matches `change-agent-app`'s
   convention (see comments in `prisma/schema.prisma`); the app connects via the Postgres
   owner role, which bypasses RLS by ownership, so this only blocks Supabase's default
   anon/authenticated API roles from reading the tables directly.
4. Set `RESEND_API_KEY` / `RESEND_FROM_EMAIL` for a domain with SPF/DKIM/DMARC verified
   in Resend, and `CONFIRM_TOKEN_SECRET` / `IP_HASH_SALT` to long random values.
5. Run `npm run env:check` after editing `.env` by hand — a cheap guard (`lib/envGuard.js`)
   that catches `DATABASE_URL`/`DIRECT_DATABASE_URL` being swapped before it reaches
   production. It also runs automatically on every cold start via `lib/prisma.js`, but
   catching it here is faster than waiting for a deploy to fail.
6. Set up package storage (below) before `/access/:token` can serve real downloads.
7. Set `CRON_SECRET` in Vercel (Production) to a long random value — **the scheduled
   purge jobs do not run without it.** It's an ordinary env var you create yourself;
   Vercel does not populate it, it just forwards whatever you set as the
   `Authorization: Bearer` header on each scheduled invocation. `PURGE_JOB_SECRET` is
   separate and only needed for triggering a purge by hand.

### Package storage (Phase 3, FR-5.2/5.3)

The two package `.zip` variants (standard + Claude-specific) live in **private Vercel
Blob storage**, not this repo — the upstream skill repo (`ethulin/climate-comms-review`)
is private, and this site's repo is public, so committing the zips here would make them
trivially fetchable and defeat the whole point of gating downloads.

1. Create a Blob store for this project (Vercel dashboard → Storage, or
   `vercel integration add blob`) — this auto-sets `BLOB_READ_WRITE_TOKEN` in the linked
   Vercel environments.
2. Locally: pull just that one token to a **separate file**, never directly onto `.env` —
   `vercel env pull .env.blob-check` and copy the `BLOB_READ_WRITE_TOKEN` line into `.env`
   by hand, then delete `.env.blob-check`. (`vercel env pull` overwrites every Sensitive
   var in whatever file you point it at with an empty string — see FR-4.3's note in
   `docs/planning/skill-install-access-spec.md` — so pulling straight onto a `.env` that
   already has real secrets in it silently blanks all of them, not just the one you
   wanted.) Make sure `gh` is authenticated with read access to the private upstream
   repo, then run `npm run skill:sync`. This downloads the current GitHub release's two
   assets and uploads them to Blob at fixed pathnames (`lib/skillPackage.js`).
3. Re-run `npm run skill:sync` (optionally with `RELEASE_TAG=vX.Y.Z`) whenever you want
   to deliberately adopt a new upstream release — this is a manual, not-scheduled step
   on purpose, so already-emailed 90-day access links never silently change what they
   serve underneath a recipient.

## Ops runbook (Phase 4)

Every script below loads `.env` via `node --env-file=.env` in its `package.json` entry
and talks to the same database as production. There is no staging database — `--dry-run`
first is not paranoia, it's the only rehearsal available.

| Situation | Command |
|---|---|
| Someone shared their install link / an address is abusing access | `npm run access:revoke -- --email <address>` |
| Kill one specific token | `npm run access:revoke -- --token-id <id>` |
| Kill **every** outstanding install link | `npm run access:revoke -- --all` |
| "My link expired / I lost the email" | `npm run access:reissue -- --email <address>` |
| Erasure request (GDPR-4/9) | `npm run contacts:erase -- --email <address>` |
| Erasure, delete today rather than tonight | `npm run contacts:erase -- --email <address> --now` |
| Who has install access | `npm run contacts:approved` |
| Who consented to feedback outreach (Q8) | `npm run contacts:feedback` (`-- --csv` to pipe to a file) |
| Run a purge now instead of waiting for 03:00 UTC | `curl -X POST -H "x-purge-job-secret: $PURGE_JOB_SECRET" https://speaksustainability.org/api/purge-unconfirmed` |

**Revoke vs. rotating `CONFIRM_TOKEN_SECRET`.** Both kill every outstanding link, and
they are not interchangeable:

- `access:revoke --all` is the normal answer. It writes `Token.revokedAt` per token —
  auditable, effective on the next request, no redeploy, and it leaves in-flight
  30-minute confirm links alone so people mid-signup aren't stranded.
- Rotating `CONFIRM_TOKEN_SECRET` in Vercel is the **break-glass** for the different
  case where the signing secret itself leaked and no signature can be trusted any more.
  It invalidates confirm *and* access tokens instantly and needs a redeploy. Afterwards,
  every confirmed contact needs `npm run access:reissue` individually — there is no bulk
  re-issue, deliberately, because a bulk re-send is a mass email and should be a
  considered act.

**Key versioning is deliberately not built.** A `kid` in the token payload plus multiple
accepted secrets would let the signing key rotate *without* invalidating live links.
That solves routine rotation hygiene (SEC-1's "rotated periodically"), not compromise —
in a leak, invalidating everything is the goal, not the problem. At pilot scale with
90-day tokens it isn't worth the machinery, and deferring costs nothing later:
`lib/tokens.js` can treat a payload with no `kid` as key v1, so tokens already in the
wild keep verifying when versioning does arrive.

**Not covered here:** there is no monitoring or alerting on the Supabase dependency.
Two transient DB failures during Phase 3 (a pooler hang, and an IPv6-reachability gap to
the direct host from Vercel's network) were both infrastructure, not code — but nothing
currently notices if either recurs, including a purge job silently failing, since Vercel
never retries a failed cron. Explicitly out of scope for Phase 4; revisit if it recurs.

## Assets

- `assets/hero-woman-{340,680}.webp` — hero illustration, served responsively via
  `<picture>`/`srcset` (mirrors the reference site's `hero-bicycle-*` pattern).
- `assets/fonts/` — self-hosted Source Sans 3 + Barlow Semi Condensed (OFL).

