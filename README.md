# OpenSlot WebMCP demo

OpenSlot is a small reference implementation for making appointment booking available to compatible AI agents through WebMCP. The public demo is a simulated dental practice: patients see a conventional booking page, while compatible agents can discover appointment tools in the background.

Live demo: https://openslot-webmcp-demo.faizmohammed178.workers.dev/

## What is included

- `/` — simulated Bright Smile Dental patient website
- `/business` — simulated practice-owner setup page
- `/sdk.js` — embeddable WebMCP registration script
- Mock appointment search, hold, and confirmation
- Hosted-calendar and existing-calendar integration choices
- Simulated phone-callback queue (no real calls are placed)

The business setup page demonstrates the intended integration model: a practice owner registers the business, chooses a calendar connection, and adds one script to the booking page. The practice can continue owning its booking configuration while the service handles the agent-facing tools and distribution boundary.

## WebMCP tools

The script registers these tools when the host browser exposes `document.modelContext.registerTool`:

- `get_dental_services`
- `search_dental_appointment_slots`
- `hold_dental_appointment_slot`
- `confirm_dental_appointment`

The data and callback are intentionally simulated for a demo. Do not use this project with real patient information, production calendars, or real telephony without adding authentication, authorization, tenant isolation, audit logging, privacy controls, and provider-specific adapters.

## Run locally

```sh
npx wrangler dev
```

Then open `http://localhost:8787/` or `http://localhost:8787/business`.

## Deploy

```sh
npx wrangler deploy
```

Cloudflare Workers serves both the Worker API and the static files in `public/`.

## License

MIT. See [LICENSE](LICENSE).
