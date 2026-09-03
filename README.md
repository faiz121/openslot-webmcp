# OpenSlot WebMCP demo

OpenSlot is a small reference implementation for making appointment booking available to compatible AI agents through WebMCP. The public demo is a simulated dental practice: patients see a conventional booking page, while compatible agents can discover appointment tools in the background.

Live demo: https://openslot-webmcp-demo.faizmohammed178.workers.dev/

## What is included

- `/` — simulated Bright Smile Dental patient website
- `/business` — simulated practice-owner setup page
- `/sdk.js` — embeddable WebMCP registration script
- D1-backed business registration and generated business IDs
- Mock appointment search, hold, and confirmation
- Hosted-calendar and existing-calendar integration choices
- Simulated phone-callback request, polling, dummy options, and confirmation (no real calls are placed)

The business setup page explains the intended integration model: a practice owner registers the business, chooses a calendar connection, saves the setup to D1, and receives a generated business ID for the website script. The practice can continue owning its booking configuration while the service handles the agent-facing tools and distribution boundary.

## WebMCP tools

The script registers these tools when the host browser exposes `document.modelContext.registerTool`:

- `get_dental_services`
- `search_dental_appointment_slots`
- `hold_dental_appointment_slot`
- `confirm_dental_appointment`
- `request_dental_callback`
- `poll_dental_callback_status`
- `confirm_dental_callback_time`

The calendar adapters and telephony integration are intentionally simulated for a demo. Callback requests return dummy appointment options, and confirmation only changes the demo request state. Do not use this project with real patient information, production calendars, or real telephony without adding authentication, authorization, tenant isolation, audit logging, privacy controls, and provider-specific adapters.

## Run locally

```sh
npx wrangler dev
```

Then open `http://localhost:8787/` or `http://localhost:8787/business`.

## Deploy

```sh
npx wrangler deploy
```

Apply the D1 migration before the first production deploy:

```sh
npx wrangler d1 migrations apply openslot-webmcp --remote
```

Cloudflare Workers serves both the Worker API and the static files in `public/`; D1 stores businesses and callback request state.

## License

MIT. See [LICENSE](LICENSE).
