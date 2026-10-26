# Changelog

## 4.0.0 · 2026-10-23

### Product
- Real moments, no data entry. A Node server with SQLite adds accounts, sync across devices, and delivery when the app is closed.
- Near you: live air quality, heat, UV, rain, humidity and pollen from Open-Meteo, with the region set automatically. It replaces the daily insight when it has a tip, and never shows beside it.
- Share: paste a link (the page is read), an order email or text, or add a photo or document. Wellwise is installable and appears in the phone's share menu.
- Scan: live barcode scanning with the camera, or a photo, looked up in Open Food, Beauty and Products Facts.
- Calendar: connect an .ics feed. Flights, appointments, blood tests, packed meeting days and late nights bring a tip the day before.
- WhatsApp: link a number with a code, send links, photos, documents or a few words, and get a tip back. Tips can also be sent to WhatsApp.
- Your agent: a personal key for a REST API and an MCP server, so any agent can send moments.
- Email: a personal address for forwarding order confirmations, bookings and results.
- One tap, one more useful tip: ten options, and the tip shows in place.
- Explore has a region filter again (my region, region-specific, all, or one country) and a lesser-known / well-known filter.
- Every tip is labelled "Well known" or "Lesser known". Well-known tips say why they are repeated.
- No safety classes, "Check first" tags or clinician notices. One medical disclaimer in the footer. Medicine and test tips can come from moments.
- Adding tips, stats and test tools moved to an admin console at /admin. "Prototype tools" and the sample-data feedback page are gone. The demo sponsor slots and the Health details panel stay.

### Content
- 48 new sourced tips (ww-204 to ww-251), mostly lesser known, in five new categories: Clothing & textiles, Ingredients & labels, Gut, kidneys & metabolism, Eyes, ears & teeth, and Sexual & reproductive health; plus mental wellbeing (including Tele MANAS, 988 and NHS Talking Therapies), lead in cookware and kajal, mercury in skin creams, air fresheners and laundry pods.
- 21 new moments and 27 new products. Every live tip (251 of 251) can now come from a moment, up from 173.
- Moments have keywords, so text, calendar entries, messages and documents can find them.
- The sample pack is merged.
- Travel tips ww-059, ww-191 and ww-196 moved into Travel health.

### Later the same day
- Hosting on Railway: `Dockerfile` and `railway.json`, with steps in `docs/DEPLOY.md`.
- Barcode scanning works on every browser, including iPhone, through a bundled open-source reader.
- Daily, weekly and near-you tips arrive at the person's own local time. Calendar times use each event's time zone.
- Connect Claude, ChatGPT or another assistant with one address and a sign-in. Connected assistants can be disconnected.
- Calendar: "Connect Google Calendar" and "Connect Outlook" shown as coming soon.
- The Health details panel now says what it will do: bring the tips that matter most to you.
- Fixed: assistants such as Claude could not find the connector sign-in when the public address was set without https://.
- Menu: four places (Discover, Moments, Explore, Journey). Inbox (with a count of new tips) and Settings are icons at the top right. On phones the four places sit in a bottom menu.
- Removed the small label above each page title. Tip pages keep their category.
- Notifications: one tap on Discover turns them on. The daily tip, calendar and near-you tips then arrive on the phone by themselves, at the person's local time. On iPhone, Wellwise explains the Home Screen step first. Settings has an on/off switch for each device. PNG app icons for home screens and notifications.
- iPhone: step-by-step Home Screen instructions with the real Safari icons (iOS 26 and older), and separate steps for Chrome, Edge and Firefox on iPhone. Shown on Discover and in Settings.
- Connecting an assistant (Claude, ChatGPT, Muse and others) no longer dead-ends for people new to Wellwise: the approval page starts their Wellwise with one tap. People who already use Wellwise can still bring their journey with a code.
- Moments → Your agent lists Muse, ChatGPT and Dots, Claude, Instinct and other assistants, each with its own steps. Instinct, which has no connectors, points to the calendar (and email, where set up).
- Assistants are told plainly to tell Wellwise after every booking, order, purchase or appointment, with examples, and to show the tip briefly. Tools that only read are labelled as such.
- Fixed: notifications stopped after a redeploy when no Railway volume was attached. Wellwise now stores data on the attached volume wherever it is mounted, reports temporary storage in /api/health, the admin console and the log, and each phone quietly re-registers for notifications whenever Wellwise opens (signing up again if the server's key changed).
- Muse shows two ways to connect: sign in, or a Wellwise key pasted into Muse's secure prompt, with a one-tap button to create the key.
- One tip per event: when an agent, the calendar and a forwarded email report the same trip or purchase, only the first sends a tip. The same tip is not sent twice within 30 days, or a tip for the same kind of moment within 7 days, from these sources.
- 21 more sourced tips (ww-252 to ww-272) in four more categories: Ageing & older adults, Children & parenting, Work & screen life, and Travel health, with new moments for older parents, children, night shifts and high-altitude trips.


## 3.0.0 · 2026-10-23

### Product
- Consumer-first. A new Moments page has five sources that need no agent: weather and air, share a product, scan, calendar and quick check-in. The agent is an option in Settings.
- Journey check-ins at 7 and 30 days, a weekly recap, and "What you now know".
- Safety classes. Clinician-only tips never fire from a moment.
- Labelled, topic-only sponsor slot on 6 tips, with a sponsor standard and firewall.
- Hindi preview (main labels and 11 tips) and a WhatsApp preview channel.
- Diet and surprise level now change rankings.

### Content
- Every tip has a tip-level source, found by search on 2026-10-23.
- Fixed broken and wrong tags. Removed the repeated "impact" sentence.
- Added a per-tip evidence grade (editorial draft) and review status.
- Rewrote all links between tips, each with a specific reason.
- Regional notes are now specific, or left out.
- Tips a moment can reach rose from 87 to 173.
- Sample pack: ww-201 to ww-203.

### Platform
- Content separated from code. Tip packs, a build script with checks, and in-app pack import.
- Live content update when hosted.
- Headless test suite and GitHub Pages deployment.

### Fixes
- No double save from a moment. Correct library count. No state change during render. Honest share behaviour when the app is not hosted. All user-facing copy speaks to the user.

## 2.0.0
- Original prototype: 200 tips, agent simulator, journey, learning lab. Kept in `legacy/`.
