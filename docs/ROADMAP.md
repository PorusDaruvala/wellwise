# Roadmap

Each item says what it is and why it matters. Items are ordered within each stage.

## Now: trust and content

| # | Item | Why |
|---|---|---|
| N1 | **Clinical review of the 35 higher-risk tips** ("check" and "clinician" classes). Record the reviewer's role and date in `review`. | Trust is the core asset. These tips carry the most risk. |
| N2 | **Firm up the 7 weaker sources:** ww-021, 036, 049, 063, 073, 119, 131. | Their sources fit the tip less closely than the rest. |
| N3 | **Native review of the Hindi text and the regional notes.** | Machine-quality copy erodes trust in a key market. |
| N4 | **Moments for the 20 tips that no moment can reach.** The build lists them as warnings. | Unreachable tips only show in the library. |
| N5 | **Clinical review of the remaining tips,** category by category. | Turns the "draft" evidence grades into reviewed ones. |
| N6 | **Translate more tips into Hindi,** starting with those most often triggered in India. | Reach beyond English readers. |

## Next: make moments real

| # | Item | Why |
|---|---|---|
| X1 | **Installable app (PWA)** with offline support. | A home-screen icon and a reason to return. |
| X2 | **Real air-quality and heat data** from a public API, by region only. | The most frequent and least invasive moment, especially in India. |
| X3 | **"Share to Wellwise"** from shopping apps, through the Web Share Target API. | Real purchase moments with no partner needed. |
| X4 | **Camera barcode scan** through the BarcodeDetector API, with a product lookup. | Real in-store moments. |
| X5 | **WhatsApp channel** through the WhatsApp Business API. | Where many target users already are. |
| X6 | **Real reminders** for the 7- and 30-day check-ins. | Habit formation needs the follow-up to arrive. |

## Later: scale and business

| # | Item | Why |
|---|---|---|
| L1 | **Accounts and sync** (optional), with a privacy review. | One journey across devices. |
| L2 | **Agent API.** Expose tips, safety rules and the journey as an API or MCP server. | The "agent-ready" half of the positioning. |
| L3 | **Consented, aggregate feedback** to tune rankings. | The learning loop shown on "How your feedback helps". |
| L4 | **Health details** (conditions, medicines, allergies) to filter unsafe tips, after a medical-data and legal review. | Better safety, but high regulatory weight. |
| L5 | **Ads system** with the topic-only targeting and sponsor firewall from D-006. | One revenue path. |
| L6 | **Editorial tools:** a review queue, source-link checker and pack preview. | Keeps quality up as the library grows. |

## Technical debt

- The pack checks exist twice: in `scripts/build.py` and in `validatePack()` in the app. Keep them in step, or generate one from the other.
- `src/template.html` is one large file. Split it into modules at build time if it grows much more.
- Add an automatic source-link checker to CI, run weekly.
- Run an accessibility audit (WCAG 2.2 AA).
