# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
make dev          # installs root + client deps, sources .envrc, runs server.js (:3001) and vite (:5173)
make clean        # DELETES local data/*.db — wipes every local user's data
make build-container / stop-container   # Apple `container` runtime, binds ./data to /data
make build-podman / stop-podman         # podman compose
make publish      # the original project's Dockhand redeploy webhook; unused here
npm run migrate   # scripts/migrate.js — JSON seeds → SQLite, idempotent
```

Vite proxies `/api` → `localhost:3001`, so work against `http://localhost:5173` in dev. In production Express serves `client/dist` and has an `app.get('*')` SPA fallback, so the whole app is on `:3001`.

`npm test` runs the unit tests in `test/` (`node:test`, no extra dependencies; they cover `auth.js`, `sleep.js`, `fhir.js`, `units.js`, and the client's `search.js` and `unitPrefs.js`). There is no linter. Beyond that, verification is `node --check` on `server.js`, `db.js`, `auth.js`, `sleep.js`, `fhir.js` and `units.js` plus exercising endpoints with curl against a running dev server.

`ANTHROPIC_API_KEY` is optional: without it the server boots with OCR off and `POST /import/labs-pdf` answers 503. `ANTHROPIC_API_KEY_FILE` names a file holding the key instead (a Docker secret, say) and wins when both are set; an unreadable file leaves OCR off and logs why. `OCR_MODEL` overrides the model (default `claude-opus-5`). `.envrc` fetches it (and the Dockhand secret) via `op read` from 1Password; `make dev` sources `.envrc` itself.

## Architecture

Express API (`server.js`, single file, ~2100 lines) + `db.js` for SQLite + a Vite/React SPA in `client/`. No router, no ORM, no state library.

### Everything is one EAV table

`metrics(date, metric, value, source)` with `UNIQUE(date, metric, source)` holds all time-series data — body comp, sleep, labs, exercise, heart rate. Adding a new metric requires **zero schema change**; writes are `INSERT ... ON CONFLICT DO UPDATE`.

The per-section endpoints are just filters over that one table, driven by constants near the top of `server.js`:

- `BODY_METRICS`, `SLEEP_METRICS`, `EXERCISE_METRICS`, `HEARTRATE_METRICS` are **include** lists.
- `GET /api/:userId/blood` is the **complement** — every metric *not* in those four lists (`SECTION_METRICS`), minus Apple Health rows (`source = 'apple_health'`) whose metric is not a lab marker (`BLOOD_MARKERS` or `marker_configs`, see `labMarkerNames()`).
- `GET /api/:userId/apple-health` returns exactly those Apple Health rows: steps, calories, walking metrics, VO2 max and whatever else Health Auto Export sends that no section reads. The client's `AppleHealthSection` gives each one a small card.

Consequence: a new body/sleep/exercise/HR metric that isn't added to its section constant will silently surface under Labs instead, or under Apple Health if it came from Health Auto Export.

`pivotMetrics()` flattens rows into one object per date. When several sources wrote the same metric on the same date, the highest `id` wins — which is why `GET /sleep` re-derives `bedtime` (earliest) and `wake_time` (latest) across sources afterwards instead of trusting the pivot, comparing both on `nightHour()`'s axis (from 18:00 on, then past midnight up to 18:00 the next day).

### Per-user databases

One SQLite file per user at `DATA_DIR/<userId>.db` (`DATA_DIR` = `./data` locally, `/data` in the container), connections cached in `db.js`. The user list itself lives in `DATA_DIR/users.json`, not in SQLite — `readUsers`/`writeUsers` plus the `requireUser` middleware, which resolves `:userId` into `req.user` on nearly every route. User IDs are slugified from the name.

Schema evolution in `getDb()`: new **tables/indexes** go in the `SCHEMA` string (all `IF NOT EXISTS`, executed on every open); new **columns on existing tables** go below it as `try { db.exec('ALTER TABLE ... ADD COLUMN ...') } catch {}`. Both run on every connection open, for every user DB.

### Reference ranges are layered

`BLOOD_MARKERS` in `server.js` is the hardcoded baseline (calibrated against Rythm Health's Optimal/Average zones). `GET /blood` clones it, then overlays `range_low`/`range_high`/`unit` from the `marker_configs` table (written by PDF import). `optimal_low`/`optimal_high` **only ever** come from the hardcoded table — an imported lab's printed range never overwrites the tighter optimal zone.

### Lab/InBody import is two-phase, by design

1. `POST /import/labs-pdf` — sha256 the upload (duplicate → 409), store it at `DATA_DIR/pdfs/<hash><ext>`, send it to Claude as a `document`/`image`/text block with `LAB_SYSTEM_PROMPT`, convert every value to its marker's unit (`units.js`, below), and return the result **without touching the DB**.
2. Client shows a preview so the user can review/toggle values, with each converted value's printed one under it and anything that could not be converted left unticked — this lives inline in `ImportSection.jsx`; `components/OcrPreviewModal.jsx` is dead code (nothing imports it, and its `onConfirm` drops `file_hash`/`filename`).
3. `POST /import/labs-confirm` inserts the `lab_reports` row first, then stamps its id onto every `metrics` row it writes via `lab_report_id`. A marker with no unit yet gets the one its values arrived in (`marker_configs.unit`, never replacing a unit already set).

**Units.** Labs print their own units (g/L, mmol/L, mg/dL), and each marker is kept in one: its `marker_configs.unit`, else `BLOOD_MARKERS`' (`markerUnitFor()`). The prompt asks for values exactly as printed plus a `units` object, and `convertReport()` in `units.js` converts value and range together: by powers of ten within a family (mass, molar, cell counts, enzyme units, …), and between mass and molar units through `MOLAR_MASS`. Urea is turned into BUN (its nitrogen share). It returns `conversions[metric].status`: `same`, `converted`, `new` (no unit yet: kept as printed), or `unknown`/`no_unit`, which the review leaves unticked; ticked anyway, the value is taken as being in the marker's unit. InBody scans are not converted (the prompt already asks for lbs). The OCR result is logged as counts only, since container logs are kept. The prompt is also given the profile's marker names, so a test lands on its existing name (`co2` rather than `bicarbonate`).

Health records are the exception: `POST /import/health-records` takes FHIR resources (the client's `healthRecords.js` pulls them out of the Health app's export zip with `File.slice` and `DecompressionStream`, no zip library) and writes straight away with `source = 'health_records'`, because the data is structured. `fhir.js` keeps numeric laboratory Observations only and maps known LOINC codes onto `BLOOD_MARKERS` keys (`MARKER_BY_LOINC`); other tests get a name made from their label. It writes no `lab_reports` row, so there is no per-import undo; re-importing is an idempotent upsert.

That stamp is what makes `DELETE /lab-reports/:id` able to cleanly undo a bad import (it also has a legacy fallback matching on date + marker name for rows written before the column existed). The OCR model id comes from `OCR_MODEL`.

### Access control (`auth.js`, optional)

Off unless `SERVE_SOCKET` is set, so a default install behaves as before. With it set, the server also listens on that unix socket and believes the identity header (`IDENTITY_HEADER`, default `Tailscale-User-Login`, as set by `tailscale serve`) **only on the socket**; the TCP port then answers `/healthz` alone. Each http server tags `req.door` (`tcp`/`socket`) and `gate()` runs before the body parser and static files. On the socket the login must be in `ALLOWED_USERS`; `requireUser` hides any profile whose `owners` (in `users.json`) lacks the login, answering 404 as if it did not exist; `GET /api/users` filters the same way; `POST /api/users` sets `owners` to the creator; `PATCH /api/users/:id` can change `owners`. Browser writes must carry `Sec-Fetch-Site: same-origin`; requests without that header (Health Auto Export) pass. `DEV_USER` is a stand-in login on TCP for development and is refused next to `SERVE_SOCKET`. `/healthz` sits before the gate on every door. `cors()` is opt-in through `CORS_ORIGIN`.

### Apple Health ingest (`POST /api/:userId/import/apple-health`)

Target of the Health Auto Export iPhone app. `HAE_METRIC_MAP` renames HAE metrics; `null` means explicitly ignore; **unmapped names pass through as-is**, so new metrics land in the DB without code changes.

Sleep has three separate code paths in the same handler, and this is the most fragile part of the codebase:

- **Raw per-stage intervals** (HAE "Summarize Data" *off* — what the README tells users to configure): each interval's `date` is just its calendar day, not a night. Intervals are clustered per source with a 4-hour gap threshold, then `nightDate()` in `sleep.js` assigns each cluster an "owner night": start ≥ 19:00 → next calendar day, start < 02:00 → same day; a cluster starting at any other hour is a night only with ≥ 3 h asleep (`MIN_NIGHT_SLEEP_HOURS`), filed under the day it starts, and a nap (skipped) otherwise. Clusters are accumulated per `(source, ownerDate)` before writing so a night split by a wake disturbance sums rather than overwrites. Before writing, each source's sleep rows (`SLEEP_ROWS`) are deleted from the first night the payload writes to the last (`nightSpans()` in `sleep.js`), so re-sending history replaces nights instead of leaving rows an older rule filed on another day. The span comes from the nights, never from the intervals' own dates, which would clear a night the payload does not carry. A night that is only the tail of one already stored (`isClippedTail()`: the stored night began in the evening, the incoming one after it, and is no longer) is neither cleared nor written, so an export window that opens after midnight cannot cut a night short.
- **Compound nightly objects** (`totalSleep`/`deep`/`rem`/`core`, Summarize on) — nap filter only (`isNight()` in `sleep.js`, same rule); the point's own `date` is the night.
- Plain `qty` points for everything else.

Workouts are aggregated per day into `workout_count`, `exercise_minutes` and `hr_z1_min`…`hr_z5_min`, using max HR = `220 - age` from the user's `birth_year` (auto-extracted from HAE's `date_of_birth` on first sync if unset).

### Client

`UserContext` holds the active user (`localStorage: hd_userId`); `App.jsx` keeps the active section in `localStorage: activeSection` and per-user hidden sections in `health_hidden_sections_<userId>`. All HTTP goes through the single `api` object in `client/src/api.js` — add endpoints there, not inline `fetch` in components. One `*Section.jsx` component per dashboard section; charts are Recharts; PNG export uses html2canvas.

The section list lives in `client/src/sections.js` (sidebar, section observer and search all read it), and lab groups, marker display names (`markerTitle`: "HDL", not "Hdl") and `getMarkerStatus` in `client/src/markers.js`. Search (`components/SearchPalette.jsx`, opened from the sidebar, the mobile top bar, ⌘K / Ctrl+K or `/`) ranks an index `client/src/search.js` builds from the loaded section data: sections, the fixed cards, lab groups, and every lab marker and Apple Health metric with data, each with other names it is found by (`MARKER_ALIASES`, `APPLE_ALIASES`) and the element id to scroll to. A card the search can land on carries that id (`metricAnchor(section, key)` → `m-<section>-<key>`, or a fixed id such as `sleep-night`); a new card or section needs one, plus an entry in `CARDS` or `SECTIONS`. Picking a result un-hides a hidden section, and for Labs clears the status filters and marker search when they hide the target. `test/search.test.js` covers the ranking with made-up data. The palette's "Out of range" filter lists every result whose newest value the dashboard marks red: lab markers by `getMarkerStatus`, and the Body cards' own ratings (`CARD_STATUS` in `search.js`).

Display units are per profile (`units` in `users.json`, set from Settings, validated against `UNIT_CHOICES` in `server.js`): weight kg/lbs, distance km/mi, temperature °C/°F, height cm/ft-in. Storage never changes (body masses in lbs, distance in miles, `body_temp_f` in °F, `wrist_temp_c` in °C); `client/src/unitPrefs.js` converts for display (`convertEntries`, `displayMetric`) and back from forms (`massToLbs`, `cmToInches`), and `useUnits()` in `UserContext` gives a component the active profile's units. A new metric with a unit choice goes in `displayMetric`. Lab units are not affected.

Every date the app stores is a local calendar day (`YYYY-MM-DD`): a night, a weigh-in, a lab draw. Make one with `toLocalDateStr()` / `localDateDaysAgo()` from `client/src/localDate.js`, never `toISOString().slice(0, 10)`, which is the UTC day and names the wrong one for hours each day away from UTC.

Styling is a dark theme with literal hex values inline in components (`bg-[#131d2e]`, `text-[#94a3b8]`, accent `#7c3aed`). `tailwind.config.js` defines named colors but most components predate them — match the surrounding file rather than converting.

## Retained archives

Deleting a profile never unlinks anything: `db.js` renames its database to `<id>.db.deleted-<stamp>` (with `-wal`/`-shm`) and its `pdfs/<id>` and `dna/<id>` directories the same way. Those and any `*.bak-*` snapshot are kept 90 days and then deleted by hand (`ARCHIVE_RETENTION_DAYS`). There is deliberately no sweeper: the archive exists because one unconfirmed API call can delete a profile. The server lists them at startup (`[retention]`), naming any past 90 days.

## Deployment

Multi-stage Dockerfile: `node:22` builds (compiles `better-sqlite3`, builds the client), `node:22-slim` runs. `docker-entrypoint.sh` seeds the empty `/data` volume from the baked-in `/app/data-defaults` (`cp -rn`, never clobbers), runs `scripts/migrate.js` (idempotent `INSERT OR IGNORE`), then starts the server.

A push to `main` runs `.github/workflows/ci.yml` (syntax check, `npm ci`, client build, API boot smoke test) and `.github/workflows/docker-publish.yml`, which publishes the multi-arch `ghcr.io/kzaoaai/health:latest`. The running instance is redeployed from that image; how is kept outside the repo. `compose.yaml` (docktail labels), `.forgejo/workflows/` and `make publish` (the Dockhand webhook) are the original project's own deployment, carried over and unused here.

`client/dist` is tracked, so a local `npm run build` dirties it: `git checkout -- client/dist && git clean -fq client/dist` afterwards. The image builds its own.

## Origin

This app began as a fork of spuder/health and has since become its own app: features and fixes land here only, and nothing goes back upstream as a PR. The code is MIT-licensed from the original; `LICENSE` and its copyright line stay. It no longer follows upstream: nothing goes back and nothing is pulled from it. Work happens on `feat/*` and `fix/*` branches, fast-forwarded into `main`.

The repo is public: no real health values, names, hostnames, addresses or emails in code, tests, fixtures or commit messages. Test data is made up.

### Open items

- `README.md` still presents the original project: its badges, links and prebuilt image point at spuder/health.
- Ideas, not yet asked for: lab results shown in SI units as a display setting, automatic lab-report import from a document archive, and links that open a given section or card.
