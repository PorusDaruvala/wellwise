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
