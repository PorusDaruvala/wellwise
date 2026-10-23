# Wellwise

Useful health insights, sparked by everyday moments.

Wellwise shows a short, sourced health tip when it fits your day: poor air quality near you, a product you share or scan, a flight in your calendar, a photo you send on WhatsApp. Moments arrive by themselves, through integrations, links, photos and documents, not forms.

The app is one HTML file, served by a small Node server with SQLite that adds accounts, live data, integrations, delivery and an admin console.

## Quick start

```bash
python3 scripts/build.py      # check content and build dist/
npm install
npm start                     # http://localhost:8787 (admin console: /admin)
npm test                      # app and server checks
```

Settings and keys are in `.env.example`. Hosting, WhatsApp, email and agents are in `docs/DEPLOY.md`. `dist/index.html` also opens on its own, with online features off.

## Repository map

| Path | What it holds |
|---|---|
| `content/wellwise-content.json` | The library: tips, links, moments, products, categories. |
| `content/packs/` | New tips waiting to go in. One JSON file per batch. |
| `content/schema/` | JSON Schema for tip packs. |
| `src/template.html` | The app. It reads the library at build time. |
| `src/engine.js` | Matching and ranking, shared by the app and the server. |
| `src/admin.html` | The admin console for operators. |
| `server/` | The Node server: API, integrations, scheduler, webhooks. |
| `scripts/build.py` | Checks packs, fills defaults, builds `dist/`. |
| `tests/` | Headless checks of the app, and server checks with outside services stubbed. |
| `dist/` | Build output. Not committed; CI builds it. |
| `docs/` | Product brief, architecture, content guide, roadmap, decisions. |
| `legacy/` | The V2 prototype and the one-time V2→V3 migration. For history only. |
| `AGENTS.md` | Rules for AI assistants that work on this repository. |

## Deploy

Run the server on any Node host with a persistent disk. See `docs/DEPLOY.md`.

The workflow in `.github/workflows/build-and-deploy.yml` checks the content, runs the tests on every pull request, and publishes an offline-only copy of `dist/` to GitHub Pages.

The app checks for a newer `wellwise-content.json` from the server. Tips added in the admin console appear without a new build.

## Where to start reading

- Product question? Read `docs/PRODUCT.md`, then `docs/ROADMAP.md`.
- Adding tips? Read `docs/CONTENT_GUIDE.md`.
- Changing the app or server? Read `docs/ARCHITECTURE.md` and `docs/DEPLOY.md`.
- Why something is the way it is? Read `docs/DECISIONS.md`.

## Status

Moments, agents and delivery are real. WhatsApp and email need their accounts set up; photos and documents need an Anthropic API key. Tips are not yet reviewed by a clinician. See `docs/ROADMAP.md` for what is open.

No licence is set yet. Add one before you make the repository public.
