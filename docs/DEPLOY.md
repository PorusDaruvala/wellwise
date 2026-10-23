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

## Host it

Any host that runs a long-lived Node process with a persistent disk works (Render, Fly.io, Railway, a small VM). Steps:

1. Build: `python3 scripts/build.py && npm ci --omit=dev`
2. Start: `npm start`
3. Mount a persistent volume and set `WELLWISE_DB` to a file on it.
4. Set `WELLWISE_PUBLIC_URL` to the public https address, and `WELLWISE_ADMIN_TOKEN` to a long random string.
5. Serve over https. Camera, location and the share menu need it.

GitHub Pages (the existing workflow) still publishes `dist/` as a static site. That copy runs offline-only: keyword matching and a local daily tip, without accounts or integrations.

## WhatsApp

1. In Meta for Developers, create an app with the WhatsApp product and add a phone number.
2. Set `WHATSAPP_TOKEN` (a permanent system-user token), `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_DISPLAY_NUMBER`.
3. Set the webhook callback to `<public url>/webhooks/whatsapp`, choose a `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`. Set `WHATSAPP_APP_SECRET` so signatures are checked.
4. To send tips more than 24 hours after someone last wrote, create a utility template with three body parameters (title, action, link) and set `WHATSAPP_TEMPLATE` to its name.

People link their number from Moments → WhatsApp: the app shows a code, they send `LINK 123456`, and from then on anything they send gets a tip back.

## Email

Use an inbound email service that posts JSON (Postmark's inbound webhook format works as is). Point a domain's MX at it, set `WELLWISE_INBOUND_DOMAIN`, and set the webhook to `<public url>/webhooks/email?secret=<WELLWISE_INBOUND_SECRET>`. Each person gets their own address from Moments → Email.

## Agents

People create a key in Moments → Your agent. Agents then call:

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
