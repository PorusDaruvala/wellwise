# Product brief

## The idea in one line

The right health insight at the right moment, from a source people and AI agents can trust.

## The problem

Good health advice is everywhere, but it arrives at the wrong time. A tip about pan heat matters most on the day you buy the pan. A tip about air quality matters most on a smoggy morning. Feeds and newsletters cannot know that.

## What Wellwise does

1. **It notices a moment.** The moment can be weather or air quality, a product you share or scan, a calendar event, a one-tap check-in, or an event from a personal AI agent.
2. **It picks one tip that fits.** Matching is exact and rule-based. If no tip fits well, Wellwise shows nothing. It never invents a health link.
3. **It keeps a journey.** The journey records what you learned, tried and kept, wherever the tip came from. Check-ins at 7 and 30 days help a tip become a habit.

## Who it is for

- **First:** adults who want small, practical health changes, in India, the UK and the US. Most of them do not use a personal AI agent yet.
- **Later:** people whose AI agents shop, book and plan for them. Wellwise becomes the health layer those agents call.

## Positioning

**Consumer-first, context-aware, agent-ready.** The app stands on its own today. The agent link is an option, not the foundation. See decision D-001 in `DECISIONS.md`.

## What makes it defensible

- **Trust.** Every tip has its own source, an evidence grade, a familiarity label and, later, a named clinical reviewer. Trust is costly to build and easy to lose, so it is hard to copy.
- **Neutrality.** One agent platform cannot credibly hold a user's record across rival agents. An independent service can.
- **History.** A user's journey, and consented feedback on which tips help in which moments, build up over time. A new competitor starts with none.

## Current state

| Area | State |
|---|---|
| Library | 251 tips across 15 categories; 204 lesser known, 47 well known. Every tip has a tip-level source. |
| Links between tips | 105, each with a written reason. |
| Moments | 51 moments and 64 products. Every live tip can come from a moment. |
| Sources of moments | Live air and weather near you, links, photos, documents, barcodes, calendars, WhatsApp, email and AI agents (REST and MCP). |
| Languages | English. Hindi preview: main labels and 11 tips. |
| Channels | In the app and WhatsApp. |
| Data | An account per browser on the Wellwise server, joinable across devices, exportable and deletable. |
| Review | No tip is clinically reviewed yet. |

## How it could make money

These options can combine. None is built beyond a demo slot.

1. **Advertising at scale.** Ads match the tip's topic only, never the user's profile. A firewall keeps sponsors away from which tip appears and what it says. Each tip sets a sponsor standard (for example, "only validated cuffs"). See D-006.
2. **Licensing to AI agents.** Agents pay to call a reviewed, auditable guidance layer and to reduce their own liability for health output.
3. **Narrow retail verticals.** Point-of-purchase safety for cookware, cleaners, supplements and water filters, paid by retailers or makers.
4. **Employers and insurers.** Only once Wellwise can show real, measured behaviour change.

## Main risks

| Risk | What we do about it |
|---|---|
| Agent platforms build their own health tips | Win on trust and neutrality, which cost more to copy than to license. |
| Health-advice regulation as scope grows | Tight sourcing, a clear medical disclaimer, and clinical review of the library (N1). |
| Purchase-triggered tips feel judgmental | Opt-in moments. Friendly wording ("Something useful about your new pan"). |
| Ads damage trust | Topic-only targeting, a sponsor firewall, clear labels. |
| Retention | The journey, check-ins and weekly recap give a reason to return. |
| Trust at scale | Per-tip sources now. Named clinical review next. |

## What to prove next

1. People find a moment-triggered tip more useful than a random one. Test this with real users.
2. At least one partner (an agent, a retailer or a WhatsApp channel) will send real moments.
3. A clinician can review tips at a pace that keeps up with the library.
4. One revenue path works at small scale.
