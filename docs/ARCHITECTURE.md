# Architecture

## Shape

```
content/wellwise-content.json ─┐
content/packs/*.json ──────────┼─► scripts/build.py ─► dist/index.html          (the app, library embedded)
src/template.html ─────────────┘                    └► dist/wellwise-content.json (for live updates)
```

- The app is one self-contained HTML file. It has no dependencies and makes no network calls, except one optional check for newer content.
- The build script embeds the library into the template, replacing the `/*__DATA__*/` marker.
- At runtime, `checkForNewContent()` fetches `wellwise-content.json` next to the app. If its `contentVersion` is higher, the app swaps in the new library.

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
| `MOMENTS` | Weather, calendar and check-in moments: `id`, `source`, `name`, `event`, `friendly`. |
| `PRODUCTS` | Products for share and scan: keywords, `event`, display label. |
| `AGENT_SCENARIOS` | Simulated events from a personal agent. |

### Tip fields

| Field | Notes |
|---|---|
| `id` | `ww-NNN`. Never reused. |
| `title`, `action`, `why`, `caution` | User-facing copy. |
| `category` | Must match a name in `CATEGORIES`. |
| `scope`, `regions` | `GLOBAL` or one region code, plus the regions where the tip applies. |
| `safety` | `general`, `check` or `clinician`. |
| `grade` | `Strong`, `Moderate`, `Limited` or `Safety practice`. Currently an editorial draft. |
| `sources`, `sourceLevel`, `sourceChecked` | The first source backs the exact tip. |
| `triggerKeys` | Event keys that let a moment bring this tip. |
| `notes` | Optional regional note per region code. |
| `hi` | Optional Hindi `title`, `action` and `why`. |
| `sponsor` | Optional demo sponsor name and sponsor standard. |
| `status` | `draft` (hidden), `live`, or `retired` (hidden from discovery, kept in journeys). |
| `added` | ISO date. Drives the "New" badge for 30 days. |
| `review` | Clinical review status. Stays `not-reviewed` until a human clinician signs off. |
| `tags`, `concepts`, `timeline` | Filled from the category by the build. |

## Runtime (inside `src/template.html`)

| Function | Job |
|---|---|
| `applyContent(c)` | Loads the library, merges tips added on this device, and hides drafts and retired tips. |
| `candidates(event)` | Ranks tips for a moment. Clinician-only tips are held back and returned as `blocked`. |
| `resolveSel()` / `deliver()` | Turns a selected moment into one tip and saves it once to the journey and inbox. |
| `matchProduct(text)` | Matches shared text to a product by the longest keyword, on word boundaries. |
| `dueCheckins()` / `checkin()` | Check-ins at 7 and 30 days for tips the user is trying. |
| `validatePack()` | The in-browser version of the build script's checks. |
| `render()` and page functions | `discover`, `moments`, `journey`, `explore`, `inbox`, `settings`, `lab`, `tipPage`. |

### Ranking rules (`candidates`)

The base score is 100. Then:

- Already seen: −25
- In the user's chosen topics: +8
- Outside their topics, with "Stick to my interests" on: −15
- "Surprise me sometimes": +0 to +10, changing by day
- Fits the user's diet: +10
- Marked useful: +5. Marked not useful: −40
- Marked "Not for me": −60
- Already a habit: −20

Clinician-only tips never take part. Changing these rules is a product decision. Record it in `DECISIONS.md`.

## State (browser only)

| `localStorage` key | Holds |
|---|---|
| `wellwise-v3-prototype` | Settings, journey, statuses, check-ins, inbox, moments. |
| `wellwise-v3-added-tips` | Tip packs added on this device through Settings → Add tips. |

## Checks

- `scripts/build.py` validates every pack. It exits 1 on errors.
- `tests/app.test.js` loads `dist/index.html` in jsdom and runs 36 checks across every page and the main flows.
- CI runs both on every pull request.

## Known limits

- Moments, agents, scanning and delivery are simulated.
- No accounts, sync or backend.
- The in-browser and Python checks are two copies of the same rules. Keep them in step.
