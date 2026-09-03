# OpenSlot submission package

Prepared September 3, 2026. This copy describes the current prototype and separates the intended integration paths from working functionality. The [readiness findings](submission-review.md) record the separate-origin SDK test and the remaining prototype limits.

## Project name

OpenSlot

## Tagline

Help businesses adopt WebMCP with one script, so customers and their agents can get things done on the websites they already use.

## Project description

### Why we built OpenSlot

A business can have a perfectly good website and still be difficult for an AI agent to use. A customer might ask for an appointment, but the agent still has to work through forms, guess how a booking page works, or tell the customer to call the office.

WebMCP gives websites a way to offer clear, structured actions to agents. But the next question is adoption: how does a small business put that into practice without building and maintaining its own agent integration?

OpenSlot is our answer to that question: a shared service and a drop-in script, built around the website the business already has.

### What OpenSlot does

The business registers with OpenSlot, enters its services, chooses its preferred appointment setup, and receives a script to add to its website. In a compatible browser, that script exposes WebMCP tools the customer's agent can discover and use. The site can continue looking and working like a normal business website.

Our demo makes this concrete with Bright Smile Dental, a fictional business. The agent can list services, search sample appointment times, hold a selected slot, and complete a dummy confirmation. It can also request a simulated phone callback, check the request's status, and confirm one of the returned dummy options.

Dentistry is the example, not the product boundary. We want the same onboarding pattern to work for salons, repair shops, fitness studios, and other businesses where customers need to arrange a service.

### Start simple, add more when needed

The intended setup supports different starting points. A business without online scheduling could use an OpenSlot-hosted calendar and define its availability. A business with an existing calendar or booking system could connect a supported integration and keep using that system. Businesses could also opt into a phone workflow for requests that still need a conversation.

The script is the small part the business installs; the shared service would handle those connections behind it. Businesses would not need to build a separate MCP server or redesign their website to get started.

Those integration paths are a roadmap, not a claim that the demo can access private calendars or place calls. Today, registration saves the choices, while scheduling and phone results use sample data.

### Why WebMCP matters here

WebMCP lets the business expose the actions it understands instead of making an agent reverse-engineer its interface. The person can ask for help, compare the returned options, choose a time, and ask the agent to carry out the next step using explicit functions and returned IDs.

This gives the human and agent different roles: the person makes the decision; the agent handles the repetitive steps. Our intended interaction asks for approval before confirmation, although the prototype does not yet enforce approval on the server.

The opportunity is bigger than one booking flow. If businesses can adopt WebMCP through a familiar setup-and-script process, more of the everyday web can become useful to people working with agents.

### How we built it

OpenSlot uses a JavaScript SDK that registers seven tools through `document.modelContext.registerTool`. Each tool defines its inputs and calls the shared backend when executed. A Cloudflare Worker serves the SDK, registration page, sample business website, and API. Cloudflare D1 stores business profiles and simulated callback state.

The business ID connects the snippet to the registered profile. Ordinary appointment slots, holds, and confirmations use in-memory demo state. The source code, setup instructions, and MIT license are public.

### What is real, and what is simulated

Business registration, generated IDs, WebMCP registration, backend requests, and stored callback state are implemented. The hosted example exercises the SDK and API on the same domain.

All availability and booking results are simulated. No external calendar is connected, no real call is placed, and no real appointment is booked. The deployed SDK's full dummy workflow was tested from a separate website origin. The demo uses a permissive cross-origin policy; phone opt-in is a saved preference rather than an enforced permission, and production authentication and durable booking guarantees are not implemented.

### What's next

Our next step is to make the tools business-neutral and connect one real scheduling path. Then we can add other supported systems and optional telephony, with verified business ownership, origin restrictions, approval checks, durable booking state, and reliable retries in place before handling real customers.

The aim stays simple: make adding WebMCP practical for the businesses people already use.

## Built with

JavaScript, HTML, CSS, WebMCP, Cloudflare Workers, Cloudflare D1, SQL, Wrangler.

The demo does not include a connected calendar API, telephony SDK, or model API. The compatible browser provides the agent environment.

## Links

- Live demo: https://openslot-webmcp-demo.faizmohammed178.workers.dev/
- Business setup: https://openslot-webmcp-demo.faizmohammed178.workers.dev/business
- Source: https://github.com/faiz121/openslot-webmcp
- License: https://github.com/faiz121/openslot-webmcp/blob/main/LICENSE
- Video: **ADD THE PUBLIC YOUTUBE URL AFTER UPLOAD.**

## Testing instructions

No login or API key is required. Use fictional information only; all appointments and phone results are simulated.

### 1. Open the business website with WebMCP enabled

Open https://openslot-webmcp-demo.faizmohammed178.workers.dev/ in ChatGPT's in-app browser. Alternatively, use Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled and restart the browser, following the challenge instructions. A normal browser can display the page without discovering agent tools.

The page is a simulated dental website. The agent tools are available through WebMCP, not a visible chatbot widget. The browser's agent interface is where you inspect tool activity and returned results.

### 2. Search, choose, and confirm a dummy appointment

Suggested prompt:

> This is a simulated business. List its services, then find Cleaning appointments in the demo week of September 8, 2026. Show me the returned options before taking any action.

Choose one of the returned times. Ask the agent to hold that slot, then explicitly approve a dummy confirmation using `Demo Customer` and `demo@example.com`. The agent should use the returned `slotId` and `holdId`, not invent IDs. Complete the confirmation within the five-minute hold.

Expected tool order:

1. `get_dental_services()`
2. `search_dental_appointment_slots({ service: "Cleaning", dateRange: "2026-09" })`
3. `hold_dental_appointment_slot({ slotId: "<returned slot ID>" })`
4. `confirm_dental_appointment({ holdId: "<returned hold ID>", name: "Demo Customer", email: "demo@example.com" })`

The result is a dummy appointment, not an external booking. Sample availability is shared by visitors to that business within a Worker instance and may be depleted; search again rather than reusing an old ID. Memory state can also reset or differ across instances.

### 3. Follow a simulated phone request

Suggested prompt:

> Request a simulated callback for a New patient exam. Poll the returned request ID and show me the dummy appointment options. Do not confirm a time until I choose one.

The first response already contains dummy options and `status: "dummy-options-ready"`. Pass its `requestId` as the `callbackId` input to `poll_dental_callback_status`. After selecting an option, call `confirm_dental_callback_time` with that same ID and the returned `slotId`.

Expected final status: `dummy-appointment-confirmed`, with a message that no real appointment was booked. Polling reads stored D1 state; it does not wait for a phone provider. If there are no matching dummy options, stop rather than invent a time.

### 4. Inspect the business onboarding flow

Open https://openslot-webmcp-demo.faizmohammed178.workers.dev/business. Use a fictional business name and phone number. Keep at least one supported sample service: `Cleaning`, `New patient exam`, or `Emergency consultation`.

Save the setup. The page should show a generated `biz-…` ID and a script containing that ID. The calendar selection and callback preference are saved, but neither connects an external service.

Optional second-business check: open `/api/business?businessId=<generated ID>` on the demo host and verify that it returns the new profile. Opening the Bright Smile homepage still uses Bright Smile's ID; it does not automatically switch to the new business. Testing a new ID with the SDK requires embedding its snippet on another page; the cross-origin SDK path is supported by the demo but still uses public, unauthenticated data.

### Important demo limits

- Sample dates are fixed at September 8–11, 2026, not a live calendar. Use those dates even if judging occurs later.
- Services outside the fixed sample set return no results. For example, a newly configured “Whitening” service does not gain availability automatically.
- Regular bookings are in memory; callback records and business profiles are stored in D1.
- Do not use real customer/patient data. Do not click a telephone link expecting the backend simulation; an ordinary `tel:` link opens the device's calling app.
- Callback opt-in, authentication, consent enforcement, concurrent booking guarantees, and external integrations are not production-ready.

## Optional images and captions

These are useful supporting images, not substitutes for the required functioning video:

1. Business setup and generated snippet — “Register the business and get a script for its existing website.”
2. Bright Smile website beside genuine browser tool activity — “The ordinary website stays in place; a compatible agent uses structured WebMCP functions.”
3. Real versus simulated summary — “Registration and WebMCP are implemented. Calendar and phone connections are simulated.”

Only show actual tool execution as execution. Label an animation or illustrative log as an illustration.

## Final submission checklist

- [ ] Keep the cross-origin test evidence and the security distinction: browser access works, but verified origins and authorization are future production controls.
- [ ] Publish the reviewed README and documentation to the public repository.
- [ ] Add the final public YouTube URL. Verify the video is **under three minutes**, plays without signing in, and includes clear audio and a functioning demo explaining WebMCP.
- [ ] Ensure narration, UI, description, and README make the same real-versus-simulated claims.
- [ ] Check the final video for material you do not have permission to use.
- [ ] Confirm all links work while signed out and finish any required Devpost profile/team fields.
- [ ] If asked about prior work, describe it accurately and identify new challenge-period work; do not infer eligibility only from a repository creation date.
- [ ] Submit through Devpost and verify the submitted status, not just a saved draft.
- [ ] Keep the judged version available free through September 21, 2026, 5:00 p.m. PT. Follow the organizer's instruction not to change the submission, repository, video, or live site after the deadline during judging; use a fork for later development.

The organizer [extended the deadline](https://webmcp.devpost.com/updates) to **September 4, 2026 at 1:00 a.m. PT**. The older date remains in parts of the rules/FAQ. Requirements checked against the [overview](https://webmcp.devpost.com/), [rules](https://webmcp.devpost.com/rules), and [resources](https://webmcp.devpost.com/resources) on September 3.
