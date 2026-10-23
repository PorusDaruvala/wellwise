# Rules for AI assistants

Read this before you change anything. These rules apply to Claude, Copilot, Cursor and any other assistant.

## Before you start

1. Read `README.md`, then the doc for your task:
   - Tips or sources → `docs/CONTENT_GUIDE.md`
   - App behaviour → `docs/ARCHITECTURE.md`
   - New features → `docs/PRODUCT.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`
2. Run `python3 scripts/build.py && npm test`. Confirm everything passes before you change anything.

## Hard rules

### Content
- **Add tips as packs in `content/packs/`.** Do not edit `src/template.html` to add, change or count tips.
- **Every tip needs a real source.** Find it with a search or open the page. Never write a URL from memory. Never invent one. If you cannot find a source that backs the exact tip, say so and leave the tip out.
- **The first source must back the exact tip.** Topic-level pages may follow it.
- **Classify safety honestly.**
  - `clinician`: the tip touches on medicines, drug interactions or test results. These tips never fire from a moment.
  - `check`: safe for most people, but not for everyone.
  - `general`: everything else.
- **Never change `review.status` to "reviewed".** Only a named human clinician can do that.
- **Never reuse or delete an id.** To remove a tip, set `"status": "retired"`.
- **No health claim beyond the source.** If the source says "may help", the tip says "may help".

### Copy (any text a user sees)
- Write to the user, as the product. Never include internal strategy, build notes or our discussions. For example: do not write "No agent needed" or "In the real app".
- Use short sentences and the active voice. Give each word one meaning. Keep it warm and human.
- Keep prototype disclaimers in the footer only.

### Code
- Keep the app a single, self-contained HTML file. No external scripts, fonts or network calls, except the optional content check in `checkForNewContent()`.
- All user data stays in `localStorage`. Do not add analytics, trackers or uploads.
- The ranking and safety rules in `candidates()` are product decisions. Change them only with a matching entry in `docs/DECISIONS.md`.

## Before you open a pull request

- [ ] `python3 scripts/build.py` exits 0, and you have read its warnings.
- [ ] `npm test` passes. If you added behaviour, add a check to `tests/app.test.js`.
- [ ] New tips: each source was opened or found by search in this session.
- [ ] User-facing copy speaks to the user, not to us.
- [ ] `CHANGELOG.md` has a line for the change.
- [ ] A product decision? Add it to `docs/DECISIONS.md`.

## Good first tasks

See "Now" in `docs/ROADMAP.md`.
