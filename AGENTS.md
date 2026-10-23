# Rules for AI assistants

Read this before you change anything. These rules apply to Claude, Copilot, Cursor and any other assistant.

## Before you start

1. Read `README.md`, then the doc for your task:
   - Tips or sources → `docs/CONTENT_GUIDE.md`
   - App, server or integrations → `docs/ARCHITECTURE.md`, `docs/DEPLOY.md`
   - New features → `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`
2. Run `python3 scripts/build.py && npm test`. Confirm everything passes before you change anything.

## Hard rules

### Content
- **Add tips as packs in `content/packs/`** (or through the admin console). Do not edit `src/template.html` to add, change or count tips.
- **Every tip needs a real source.** Find it with a search or open the page. Never write a URL from memory. Never invent one. If you cannot find a source that backs the exact tip, say so and leave the tip out.
- **The first source must back the exact tip.** Topic-level pages may follow it.
- **Say how well known a tip is.** `common` if most adults already know it, `lesser-known` otherwise. Prefer adding lesser-known tips.
- **Do not hold back useful health, medicine or testing tips** because they touch on medicines or results (D-010). Do not add safety tags or extra warnings. Put who should take care in the tip's own `caution` line, from the source.
- **Never change `review.status` to "reviewed".** Only a named human clinician can do that.
- **Never reuse or delete an id.** To remove a tip, set `"status": "retired"`.
- **No health claim beyond the source.** If the source says "may help", the tip says "may help".
- **Every live tip should be reachable from a moment.** The build reports reach.

### Copy (any text a user sees)
- Write to the user, as the product. Never include internal strategy, build notes or our discussions. For example: do not write "No agent needed" or "In the real app".
- Use short sentences and the active voice. Give each word one meaning. Keep it warm and human.
- The medical disclaimer lives in the footer only. Do not repeat cautionary copy elsewhere.
- Operator features (adding tips, stats, test tools) belong in `/admin`, never in the app.

### Code
- The app stays a single HTML file built by `scripts/build.py`. It must still work opened on its own, with server features switched off.
- Matching and ranking live in `src/engine.js`, shared by the app and the server. The rules in `candidates()` are product decisions. Change them only with a matching entry in `docs/DECISIONS.md`.
- Moments come from integrations, links, photos, documents and barcodes, not forms (D-012). Do not add simulated data.
- Claude may only map input to existing event keys (D-013).
- No analytics or trackers. Outbound requests go only to the services listed in `docs/ARCHITECTURE.md`.
- Links people share are fetched through `server/net.js`, which blocks private addresses. Do not bypass it.

## Before you open a pull request

- [ ] `python3 scripts/build.py` exits 0, and you have read its warnings.
- [ ] `npm test` passes. If you added behaviour, add a check to `tests/app.test.js` or `tests/server.test.js`.
- [ ] New tips: each source was opened or found by search in this session.
- [ ] User-facing copy speaks to the user, not to us.
- [ ] `CHANGELOG.md` has a line for the change.
- [ ] A product decision? Add it to `docs/DECISIONS.md`.

## Good first tasks

See "Now" in `docs/ROADMAP.md`.
