# Decisions

One entry per product or technical decision. Add new entries at the bottom. Do not edit old ones; supersede them instead.

---

### D-001 · Consumer-first, agent-optional · 2026-10-23
**Decision:** Wellwise works on its own. A personal AI agent is an optional source of moments.
**Why:** Few consumers use personal agents today, especially in India. Designing only for agents would wait on adoption and on partners.
**Effect:** Five moment sources need no agent: weather and air, share, scan, calendar and quick check-in. The agent link sits in Settings.

### D-002 · Never invent a health link · 2026-10-23
**Decision:** Matching is exact: a moment's event key must match a tip's trigger key. If nothing matches, show nothing.
**Why:** A wrong or forced health link costs more trust than a missed one.

### D-003 · Clinician-only tips never fire from a moment · 2026-10-23
**Decision:** Tips about medicines, drug interactions or test results are classed `clinician`. They show in the library with a "Talk to a clinician" notice, but no moment or purchase triggers them.
**Why:** Purchase-triggered advice about medicines moves toward medical advice and carries a high risk of harm.

### D-004 · Every tip has its own source · 2026-10-23
**Decision:** The first source of every tip must back that exact tip. AI assistants must find sources by search, never from memory.
**Why:** Trust is the main asset. Topic-level sources do not let anyone check a tip.

### D-005 · Content is data, not code · 2026-10-23
**Decision:** Tips live in `content/`. New tips arrive as packs. The app is not edited to add tips. The live app can load newer content without a rebuild.
**Why:** The library will keep growing. Adding tips must be safe, checkable and quick.

### D-006 · Ads are topic-only, behind a firewall · 2026-10-23
**Decision:** If ads come, they match the tip's topic, never the user's profile or history. Sponsors never choose which tip appears or what it says. Each tip sets its own sponsor standard.
**Why:** Neutrality is the moat. Health-based ad targeting also faces strict rules in many markets.

### D-007 · Copy speaks to the user, as the product · 2026-10-23
**Decision:** User-facing text never includes strategy, build notes or internal discussion. Prototype disclaimers appear in the footer only.
**Why:** Internal reasoning shown to users confuses them and weakens the product.

### D-008 · Data stays in the browser · 2026-10-23
**Decision:** No accounts, no backend, no analytics in the prototype.
**Why:** Privacy by default, while consent and data governance are still undesigned.

### D-009 · Retire, never delete · 2026-10-23
**Decision:** Removed tips get `"status": "retired"`. Ids are never reused.
**Why:** Users' journeys and links refer to tip ids. Deleting a tip would break their history.

### D-010 · No safety classes; one disclaimer · 2026-10-23
**Decision:** Supersedes D-003. The `general` / `check` / `clinician` classes are gone. Every tip can come from a moment, including tips about medicines, tests and results. One general disclaimer sits in the footer: Wellwise is not a substitute for medical advice; always check with a certified healthcare provider. No "Check first" tags, clinician notices or "not yet reviewed" lines.
**Why:** Well-sourced health, medicine and testing tips are among the most valuable and least known. Holding them back, or wrapping them in warnings, made the product less useful without making it safer. Each tip still carries its own "Keep in mind" line from its source.
**Effect:** The build rejects a `safety` field. The crisis-line notice on the "I feel stressed or low" moment stays: it is a resource, not a caution.

### D-011 · A server, and data off the device · 2026-10-23
**Decision:** Supersedes D-008. Wellwise runs on a small Node server with a SQLite database. Each browser gets an account (a private cookie) that holds settings, the journey and linked services, so integrations can deliver tips when the app is closed. Accounts can be joined across devices with a one-time code, exported, and deleted.
**Why:** Real moments (calendar, WhatsApp, agents, email, near-you alerts) arrive when the app is not open. They need somewhere to land.
**Effect:** The single HTML file still works on its own with keyword matching and a local daily tip; online features switch on when it is served by the server. No analytics or trackers.

### D-012 · Retrieval, not data entry · 2026-10-23
**Decision:** Moments come from integrations, links, photos, documents and barcodes. People do not fill in forms about their day. Simulated moment lists (sample products, scan labels, agent scenarios) are removed.
**Why:** The product promise is a tip at the right moment, without effort.
**Effect:** One intake pipeline (`server/intake.js`) serves share, scan, photos, documents, WhatsApp, email and agents. Quick check-in taps stay as the one-tap fallback.

### D-013 · Claude reads, but only into known events · 2026-10-23
**Decision:** Photos, PDFs and text that keywords cannot place go to Claude, which may only answer with event keys that already exist in the library (a JSON-schema enum). Matching to a tip stays rule-based.
**Why:** Keeps D-002: Wellwise never invents a health link, even when a model reads the input.

### D-014 · Near you replaces the daily insight · 2026-10-23
**Decision:** When live air or weather near the person brings a tip, Discover shows it in place of the daily insight. When nothing stands out, or location is off, the daily insight shows. Never both.
**Why:** Two hero tips compete. A live, local tip is the better one when it exists.

### D-015 · Familiarity labels · 2026-10-23
**Decision:** Every tip is `common` (widely known) or `lesser-known`. Common tips show a "Well known" badge and a note that they are repeated because they do a lot of good and link to other tips. Discover's "Keep exploring" lists lesser-known tips first. Explore can filter by either.
**Why:** People notice when an app tells them what they already know. Saying so, and showing the bigger picture, keeps trust. New content goes mainly into lesser-known areas: products and materials, ingredients, clothing, the inner body, eyes and ears, sexual and reproductive health, and mental wellbeing.

### D-016 · Admin tools leave the app · 2026-10-23
**Decision:** Adding tips, reach reports, feedback numbers and test tools move to a separate admin console (`/admin`, behind `WELLWISE_ADMIN_TOKEN`). The "Prototype tools", "Add tips" and "How your feedback helps" sample-data page are removed from the app.
**Why:** These are operator jobs, not user features.

### D-017 · Keep the demo sponsor slots and the health details panel · 2026-10-23
**Decision:** The six labelled demo sponsor slots stay on their tips, to show the future ad format (D-006). The "Health details · Coming soon" panel stays in Settings.
**Why:** Both show where the product is going. Removing them was not agreed.

### D-018 · Assistants connect by signing in · 2026-10-23
**Decision:** AI assistants connect to Wellwise with one address (`/mcp`) and a sign-in approval, using OAuth 2.1 with PKCE and dynamic client registration, as MCP clients expect. Personal keys stay for agents people run themselves.
**Why:** Copying keys into settings is too much friction for most people.
**Effect:** People see and disconnect connected assistants in Moments → Your agent. Assistants get the same three tools as keys do.

### D-019 · Everyone on their own clock · 2026-10-23
**Decision:** Scheduled tips (daily, weekly, near you) and calendar times follow each person's time zone, sent from their browser.
**Why:** Testers and users live in different time zones from the server.

### D-020 · Four places, bottom menu on phones · 2026-10-23
**Decision:** The menu has four places: Discover, Moments, Explore and Journey. Inbox and Settings are icons at the top right, and the inbox icon shows how many tips are new. On phones (700 px wide or less) the four places sit in a fixed bottom menu; computers keep them at the top. Page titles have no small label above them; tip pages keep their category.
**Why:** On phones, six options in a scrolling top bar hid Inbox and Settings. A bottom menu with four places is what people expect from an app.
