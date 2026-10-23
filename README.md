# Wellwise

Useful health insights, sparked by everyday moments.

Wellwise shows a short, sourced health tip when it fits your day: poor air quality, a new purchase, a long flight, a late night. It works on its own, and it can also take moments from a personal AI agent.

This repository holds a working prototype. The app runs in one HTML file. All data stays in the user's browser.

## Quick start

```bash
python3 scripts/build.py      # check content and build dist/index.html
npm install                   # once, for the tests
npm test                      # run the headless app checks
```

Then open `dist/index.html` in a browser. No server is needed.

## Repository map

| Path | What it holds |
|---|---|
| `content/wellwise-content.json` | The library: tips, links, moments, products, categories. |
| `content/packs/` | New tips waiting to go in. One JSON file per batch. |
| `content/schema/` | JSON Schema for tip packs. |
| `src/template.html` | The app. It reads the library at build time. |
| `scripts/build.py` | Checks packs, fills defaults, builds `dist/`. |
| `tests/app.test.js` | Headless checks of every page and the main flows. |
| `dist/` | Build output. Not committed; CI builds it. |
| `docs/` | Product brief, architecture, content guide, roadmap, decisions. |
| `legacy/` | The V2 prototype and the one-time V2→V3 migration. For history only. |
| `AGENTS.md` | Rules for AI assistants that work on this repository. |

## Deploy

Push to `main`. The workflow in `.github/workflows/build-and-deploy.yml` checks the content, runs the tests, builds the app, and publishes `dist/` to GitHub Pages.

One-time setup: in the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

The live site checks for a newer `wellwise-content.json` next to the app. New tips appear without a new app build.

## Where to start reading

- Product question? Read `docs/PRODUCT.md`, then `docs/ROADMAP.md`.
- Adding tips? Read `docs/CONTENT_GUIDE.md`.
- Changing the app? Read `docs/ARCHITECTURE.md`.
- Why something is the way it is? Read `docs/DECISIONS.md`.

## Status

Prototype. Moments, agents and message delivery are simulated. Tips are not yet reviewed by a clinician. See `docs/ROADMAP.md` for what is open.

No licence is set yet. Add one before you make the repository public.
