# Roadmap

Each item says what it is and why it matters. Items are ordered within each stage.

## Now: trust and content

| # | Item | Why |
|---|---|---|
| N1 | **Clinical review of the medicine, test and results tips** (Supplements & medication, Prevention & tests, Gut, kidneys & metabolism, Sexual & reproductive health). Record the reviewer's role and date in `review`. | Trust is the core asset. These tips matter most. |
| N2 | **Firm up the 7 weaker sources:** ww-021, 036, 049, 063, 073, 119, 131. | Their sources fit the tip less closely than the rest. |
| N3 | **Native review of the Hindi text and the regional notes.** | Machine-quality copy erodes trust in a key market. |
| N4 | **More lesser-known tips**, aiming for 15 to 20 in each of the five new categories. | They are the least known and most useful. |
| N5 | **Clinical review of the remaining tips,** category by category. | Turns the "draft" evidence grades into reviewed ones. |
| N6 | **Translate more tips into Hindi,** starting with those most often triggered in India. | Reach beyond English readers. |

## Next: make moments real

| # | Item | Why |
|---|---|---|
Done in 4.0: installable app with share target, live air and weather, barcode and photo scan, link and document reading, calendar feeds, WhatsApp in and out, email forwarding, agent API and MCP, scheduled check-ins.

| # | Item | Why |
|---|---|---|
| X2 | **Google and Microsoft calendar sign-in** (OAuth) as well as .ics links. | Easier than finding a secret address. |
| X3 | **Barcode reading on the server** for browsers without BarcodeDetector. | Photos of barcodes without needing Claude. |
| X4 | **Shop integrations** (order emails parsed per retailer, or partner APIs). | Purchases arrive with no forwarding. |
| X5 | **Time zones and recurring events** in calendar feeds. | More accurate calendar moments. |
| X6 | **Email sign-in** to recover an account without the original device. | Device codes need two devices. |

## Later: scale and business

| # | Item | Why |
|---|---|---|
| L1 | **Accounts and sync** (optional), with a privacy review. | One journey across devices. |
| L2 | **Agent API hardening.** OAuth for agents, per-agent keys and scopes, rate tiers. | The "agent-ready" half of the positioning. |
| L3 | **Consented, aggregate feedback** to tune rankings. | The learning loop shown on "How your feedback helps". |
| L4 | **Health details** (conditions, medicines, allergies), read from documents and prescriptions people share, to rank tips for them, after a medical-data and legal review. | More relevant tips, but high regulatory weight. |
| L5 | **Ads system** with the topic-only targeting and sponsor firewall from D-006. | One revenue path. |
| L6 | **Editorial tools in /admin:** a review queue, source-link checker and pack preview. | Keeps quality up as the library grows. |

## Technical debt

- The pack checks exist twice: in `scripts/build.py` and in `validatePack()` in the app. Keep them in step, or generate one from the other.
- `src/template.html` is one large file. Split it into modules at build time if it grows much more.
- Add an automatic source-link checker to CI, run weekly.
- Run an accessibility audit (WCAG 2.2 AA).
