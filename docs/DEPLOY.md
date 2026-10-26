# Run and deploy

## Run it locally

```bash
python3 scripts/build.py
npm install
cp .env.example .env      # then fill in what you have
npm start                 # http://localhost:8787, admin console at /admin
```

Node 22.9 or newer is needed (for the built-in SQLite and `--env-file-if-exists`).

Near you, links, barcodes, calendars, agents and the admin console work with no keys at all. Photos and documents need `ANTHROPIC_API_KEY`. WhatsApp and email need their accounts below.

## Host it on Railway

The repository has a `Dockerfile` and `railway.json`, so Railway builds and starts Wellwise with no build settings. It checks `/api/health` before each release goes live.

1. Push `main` to GitHub.
2. Sign in at railway.com with GitHub. Choose **New Project → Deploy from GitHub repo**, and pick the Wellwise repository.
3. Open the service. Under **Settings → Networking**, choose **Generate Domain**. Copy the address, for example `https://wellwise-production.up.railway.app`.
4. Add a volume to the service (any mount path; `/data` is fine). Wellwise finds it through Railway's `RAILWAY_VOLUME_MOUNT_PATH` and keeps accounts, journeys and notification sign-ups there. Without it, every redeploy wipes them: `/api/health` then reports `"storage":"temporary"`, the admin console shows Storage in red, and the server log warns at start.
5. Under **Variables**, add:
   - `WELLWISE_PUBLIC_URL`: the address from step 3
   - `WELLWISE_ADMIN_TOKEN`: a long random string, for `/admin`
   - `WELLWISE_SECRET`: another long random string
   - `ANTHROPIC_API_KEY`: your key, for photos and documents
   - WhatsApp and email settings, when you have them (below)

   Do not add `WELLWISE_DB` on Railway. A path like `./data/wellwise.db` points inside the server, not at the volume, and is wiped on every redeploy.
6. Railway redeploys. Open the address on your phone. Every push to `main` deploys again.

Share the address with testers. Each tester's browser gets its own account automatically.

Notifications need no setup: the server makes its own key pair the first time it starts and keeps it on the volume. To manage the keys yourself, set `WELLWISE_VAPID_PUBLIC` and `WELLWISE_VAPID_PRIVATE`.

## Host it elsewhere

Any Docker host with a persistent disk works. Build the `Dockerfile`, mount a volume at `/data`, set the variables above, and serve over https. Camera, location and the share menu need https.

GitHub Pages (the existing workflow) still publishes `dist/` as a static site. That copy runs offline-only: keyword matching and a local daily tip, without accounts or integrations.

## Sign-in

Signing in is optional. It gives a person the same Wellwise on every device, and makes sure assistants (Muse, Claude, ChatGPT) connect to their own Wellwise, even when the assistant opens the sign-in page in its own browser. When someone signs in on a browser that already has an unsigned Wellwise, its tips, assistant connections and notification sign-ups are merged into their account.

**Email codes (Resend):**
1. Create an account at resend.com and an API key. Set `RESEND_API_KEY`.
2. Add and verify your domain in Resend (a few DNS records), then set `WELLWISE_EMAIL_FROM`, for example `Wellwise <hello@your-domain.com>`.
3. Until a domain is verified, Resend's test sender (`onboarding@resend.dev`) only delivers to the email address of your Resend account, so you can try it yourself but testers will not get codes.

**WhatsApp:** turns on with WhatsApp (below). People send `SIGNIN 123456` to Wellwise's number and the page signs them in.

## WhatsApp

1. In Meta for Developers, create an app with the WhatsApp product and add a phone number.
2. Set `WHATSAPP_TOKEN` (a permanent system-user token), `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_DISPLAY_NUMBER`.
3. Set the webhook callback to `<public url>/webhooks/whatsapp`, choose a `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`. Set `WHATSAPP_APP_SECRET` so signatures are checked.
4. To send tips more than 24 hours after someone last wrote, create a utility template with three body parameters (title, action, link) and set `WHATSAPP_TEMPLATE` to its name.

People link their number from Moments → WhatsApp: the app shows a code, they send `LINK 123456`, and from then on anything they send gets a tip back.

## Email

Use an inbound email service that posts JSON (Postmark's inbound webhook format works as is). Point a domain's MX at it, set `WELLWISE_INBOUND_DOMAIN`, and set the webhook to `<public url>/webhooks/email?secret=<WELLWISE_INBOUND_SECRET>`. Each person gets their own address from Moments → Email.

## Agents

**Assistants with connectors (Claude, ChatGPT and others):** people paste `<public url>/mcp` into their assistant as a custom connector. The assistant registers itself, opens a Wellwise approval page, and gets a token when the person chooses Allow (OAuth 2.1 with PKCE and dynamic client registration). If the approval page opens in a browser that has not used Wellwise, it asks for the 6-digit code from Settings → Your data → Use Wellwise on another device. People can disconnect an assistant in Moments → Your agent.

**Agents you run yourself:** people create a key in Moments → Your agent. Agents then call:

- REST: `POST /api/agent/v1/moments` with `{"text"|"url"|"event"|"image", "agent": "Name"}` and `Authorization: Bearer wwk_…`
- MCP (streamable HTTP, JSON responses): `POST /mcp` with the same key. Tools: `wellwise_find_tip`, `wellwise_send_moment`, `wellwise_journey`.

## Outside services

| Service | Used for | Key |
|---|---|---|
| Open-Meteo forecast and air-quality APIs | Near you | None |
| BigDataCloud reverse geocode (client) | Place name and country | None |
| Open Food / Beauty / Products Facts | Barcodes | None |
| Anthropic API (`claude-opus-5-5`, low effort, server-side fallback on) | Photos, PDFs, hard text | `ANTHROPIC_API_KEY` |
| WhatsApp Business Cloud API | Messages in and out | See above |
| Your inbound email provider | Forwarded emails | See above |
