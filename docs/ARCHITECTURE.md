# Architecture

## Shape

```
content/wellwise-content.json ─┐
content/packs/*.json ──────────┼─► scripts/build.py ─► dist/index.html          (the app, library + engine embedded)
src/template.html, engine.js ──┘                    ├► dist/wellwise-content.json
                                                     └► dist/admin.html, manifest, sw.js, icon

dist/ ──► server/ (Node, SQLite) ──► the browser
              │
              ├─ live air and weather (Open-Meteo, BigDataCloud place name)
              ├─ barcodes (Open Food Facts, Open Beauty Facts, Open Products Facts)
              ├─ links people share (any public page)
              ├─ photos and documents (Claude, optional)
              ├─ calendars (.ics feeds)
              ├─ WhatsApp Business Cloud API (in and out)
              ├─ inbound email (Postmark-style webhook)
              └─ agents (REST and MCP, per-person key)
```

- The app is one HTML file. Opened on its own, it uses keyword matching and a local daily tip. Served by the server, it switches on accounts, integrations and delivery.
- `src/engine.js` holds matching and ranking. The build inlines it into the app; the server `require`s it. One copy of the rules.
- `checkForNewContent()` fetches `wellwise-content.json`. The server serves the built library plus any packs added in the admin console.

## Server (`server/`)

| File | Job |
|---|---|
| `index.js` | Starts the server and the scheduler. |
| `app.js` | Routes, sessions, delivery, the scheduler, agent API, MCP, webhooks, share target, admin API. |
| `db.js` | SQLite (`node:sqlite`): users, inbox, intakes, calendar events, feedback, packs, cache. |
| `intake.js` | `interpret()`: one pipeline for text, links, barcodes, photos and documents. `pickTip()`: the best tip for the matches. |
| `llm.js` | Claude reads photos, PDFs and hard text, answering only with known event keys. |
| `live.js` | Live readings → near-you moments, region and place name. Coordinates rounded to 0.1°. |
| `calendar.js` | Parses .ics feeds and finds moments from titles, places and times (late finishes, packed meeting days). |
| `whatsapp.js` | Webhook signature check, media download, replies, delivery inside and outside the 24-hour window. |
| `content.js` | The live library and pack checks (same rules as `scripts/build.py`). |
| `net.js` | Fetches shared links with private-address blocking, redirects checked, size and time limits. |

### HTTP surface

| Path | Who | What |
|---|---|---|
| `GET /`, `/admin`, `/manifest.webmanifest`, `/sw.js` | Anyone | The app, the admin console, the PWA files. |
| `/api/me`, `/api/state`, `/api/inbox`, `/api/feedback` | The person (cookie) | Account, synced state, delivered tips, ratings. |
| `/api/live`, `/api/intake`, `/api/calendar`, `/api/whatsapp`, `/api/agent-key`, `/api/email`, `/api/device-*` | The person | Integrations. |
| `POST /share` | Other apps | Web Share Target. Redirects to `#moments/intake/<id>`. |
| `/api/agent/v1/*`, `POST /mcp` | Agents (Bearer key) | `moments`, `tips`, `events`; MCP tools `wellwise_find_tip`, `wellwise_send_moment`, `wellwise_journey`. |
| `/webhooks/whatsapp`, `/webhooks/email` | Meta, email provider | Inbound messages. |
| `/api/admin/*` | Operators (Bearer admin token) | Status, packs, merged library, reader test, run scheduler. |

### Scheduler (`tick()`, every 10 minutes)

- Re-reads each connected calendar every 30 minutes. Sends one tip within 24 hours of an event that fits.
- Once a day, after 7:00, sends a near-you tip if the person's live conditions bring one.
- Once a day, after 8:00, sends the daily tip (or Mondays for weekly).
- Sends 7- and 30-day check-ins for tips the person is trying.
- Every delivery is deduplicated per person (`inbox.dedupe`). Frequency "off" sends nothing.

## Content model

`wellwise-content.json` has these top-level keys:

| Key | Holds |
|---|---|
| `schemaVersion` | Shape of the file. Currently 1. |
| `contentVersion` | Number that rises with each build, in the form `YYYYMMDDHHMM`. |
| `REGIONS` | `US`, `IN`, `GB`, `OTHER`. |
| `CATEGORIES` | Name, tag, default grade, default timeline, and the "You now know…" phrase. |
| `TIPS` | The library. Fields are listed below. |
| `EDGES` | Links between tips: `a`, `b`, `type`, `why`. |
| `MOMENTS` | `id`, `source` (`environment`, `calendar`, `prompt`), `name`, `event`, `friendly`, `keywords`. Keywords let text, calendar entries, messages and documents find the moment. |
| `PRODUCTS` | Products for share, scan and agents: `keywords`, `event`, `name`, `object`. |

### Tip fields

| Field | Notes |
|---|---|
| `id` | `ww-NNN`. Never reused. |
| `title`, `action`, `why`, `caution` | User-facing copy. |
| `category` | Must match a name in `CATEGORIES`. |
| `scope`, `regions` | `GLOBAL` or one region code, plus the regions where the tip applies. |
| `familiarity` | `common` or `lesser-known`. |
| `grade` | `Strong`, `Moderate`, `Limited` or `Safety practice`. Currently an editorial draft. |
| `sources`, `sourceLevel`, `sourceChecked` | The first source backs the exact tip. |
| `triggerKeys` | Event keys that let a moment bring this tip. |
| `notes` | Optional regional note per region code. |
| `hi` | Optional Hindi `title`, `action` and `why`. |
| `sponsor` | Optional demo sponsor `name` and sponsor standard (`criteria`). Shown on the tip page, labelled, topic-only (D-006). |
| `status` | `draft` (hidden), `live`, or `retired` (hidden from discovery, kept in journeys). |
| `added` | ISO date. Drives the "New" badge for 30 days. |
| `review` | Clinical review status. Stays `not-reviewed` until a human clinician signs off. |
| `tags`, `concepts`, `timeline` | Filled from the category by the build. |

## Ranking rules (`candidates` in `src/engine.js`)

The base score is 100. Then:

- Already seen: −25
- In the user's chosen topics: +8
- Outside their topics, with "Stick to my interests" on: −15
- "Surprise me sometimes": +0 to +10, changing by day
- Fits the user's diet: +10
- Marked useful: +5. Marked not useful: −40
- Marked "Not for me": −60
- Already a habit: −20

Changing these rules is a product decision. Record it in `DECISIONS.md`.

## State

- In the browser: `localStorage` key `wellwise-v3-prototype` (settings, journey, inbox). It syncs to the server when online; the newer copy wins.
- On the server: `data/wellwise.db`. Linked services (phone, calendar address, agent key, email address, rounded location) live only on the server.

## Checks

- `scripts/build.py` validates the content and every pack. It exits 1 on errors and reports reach.
- `tests/app.test.js` loads `dist/index.html` in jsdom, offline.
- `tests/server.test.js` runs the server on a random port with every outside service replaced by fixed answers.
- CI runs both on every pull request.

## Known limits

- Calendar times with a time zone are read as server-local time; recurring events count only their first date.
- WhatsApp tips outside the 24-hour window need an approved template (`WHATSAPP_TEMPLATE`).
- Photos and PDFs need `ANTHROPIC_API_KEY`. Without it, photos work only when the browser can read a barcode.
- The pack checks exist in Python and JavaScript. Keep them in step.
