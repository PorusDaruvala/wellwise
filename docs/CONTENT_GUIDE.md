# Content guide

The app and the tips are separate. You add tips by adding data. You do not change the app.

## Add tips in four steps

1. **Write a pack** in `content/packs/`. Name it by date and topic, for example `2026-11-monsoon.json`. Download a blank pack from the admin console (`/admin`), or copy the shape from `content/schema/tip-pack.schema.json`.

   For each tip, write only these fields:
   - `title`, `category`, `action`, `why`, `caution`
   - `sources`: one or more `https://` links. The first link must back this exact tip.

   Everything else is optional. The build fills in the id, region, familiarity, grade, timeline, tags, status and date added. The full shape is in `content/schema/tip-pack.schema.json`.

2. **Check it:** `python3 scripts/build.py --check content/packs/your-pack.json`
   - ✗ is an error. The pack will not go in until you fix it.
   - ! is a warning. The pack still goes in, but read it.

3. **Build and test:** `python3 scripts/build.py && npm test`. New tips show a "New" badge for 30 days.

4. **Make it permanent:** `python3 scripts/build.py --merge`. This folds the packs into `content/wellwise-content.json`. Then delete the merged pack files and commit.

## Writing a good tip

| Field | Do | Don't |
|---|---|---|
| `title` | Start with a verb. Keep it under about 60 characters. | Use jargon or a question. |
| `action` | Name one thing a person can do today. | List several actions. |
| `why` | Say why, in one sentence, no stronger than the source. | Promise an outcome. |
| `caution` | Say who should take care, or when not to do it. | Leave it empty or generic. |
| `notes` | Add a real local detail per region, if you have one. | Write a generic line such as "Think of local foods". |

Style: short sentences, active voice, one meaning per word. Warm and human.

## Sources

- Find each source in this session, by search or by opening the page. Never write a URL from memory.
- Prefer official and clinical bodies: WHO, NHS, CDC, NIH, FDA, EPA, USPSTF, AHA, AAD, national regulators.
- If no page backs the exact tip, rewrite the tip to match what the source says, or leave the tip out.

## How well known is it?

Set `familiarity` on every tip.

| Value | Use when | Effect |
|---|---|---|
| `common` | Most adults have heard it (eat vegetables, wear sunscreen). | Shows "Well known" and a note that it is repeated because it matters and links to other tips. |
| `lesser-known` | Most people have not heard it, or not in this form. The default. | Shows "Lesser known". Comes first in "Keep exploring". |

Favour lesser-known areas: products and materials, ingredients and labels, clothing, the gut, kidneys and metabolism, eyes, ears and teeth, sexual and reproductive health, and mental wellbeing.

## No safety classes

Tips about medicines, tests and results are welcome and can come from any moment (D-010). Do not add warning tags. Say who should take care in the tip's `caution` line, using what the source says. The general medical disclaimer is in the app footer.

## Moments and reach

A tip reaches people from a moment only if one of its `triggerKeys` matches an event in `MOMENTS`, `PRODUCTS` or `AGENT_SCENARIOS`. The build warns you when no moment can bring a tip.

To add a moment, add it to `MOMENTS` (or a product to `PRODUCTS`) in the content file, with `keywords` so links, messages, calendar entries and documents can find it. Then use its `event` key in tips.

## Add tips on a running server

Open `/admin`, sign in with the admin token, and upload a pack. The server runs the same checks and the tips go live at once. To keep them, download the merged library or run the pack through `scripts/build.py --merge` and commit.

## Change or remove a tip

- **Change:** edit it in `content/wellwise-content.json`, then rebuild.
- **Remove:** set `"status": "retired"`. Never delete a tip, and never reuse an id.
- **Hold back:** set `"status": "draft"`.

## Add a category

Add an entry to `CATEGORIES` with `name`, `tag`, `concept`, `defaultGrade`, `defaultTimeline` and `know` (the singular and plural phrases for "You now know…").
