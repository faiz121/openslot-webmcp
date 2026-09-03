# Submission-readiness review — September 3, 2026

Scope: source and documentation review, public repository metadata, deployed SDK comparison, HTTP checks, and a complete dummy workflow through the deployed SDK from a separate browser origin. A synthetic business and dummy appointment/callback state were created; no external calendar, phone call, or real appointment was involved. No new production architecture was deployed.

## What is already present

- The public GitHub repository is accessible, uses `main`, and has a detected MIT license.
- The deployed SDK matches the local source and contains seven WebMCP registrations.
- The deployed business endpoint returns the expected Bright Smile profile.
- D1-backed business and callback records, service-filtered sample availability, and the hold/confirmation workflow are present in the source. Source inspection is not a new end-to-end execution result.

## Resolved: cross-origin JSON requests

### Original failure

The SDK sends JSON POST requests to its own hosting origin. On a different business domain, the browser first asks the API whether `content-type` is allowed.

A read-only OPTIONS request to the live `/api/slots` endpoint with an external Origin, requested method POST, and requested header `content-type` returned HTTP 204 with `Access-Control-Allow-Origin: *`, but no `Access-Control-Allow-Headers`. The OPTIONS handler also omits `Access-Control-Allow-Methods`. The hosted same-origin demo does not exercise this boundary.

An isolated browser page at `http://127.0.0.1:8798` then attempted the same JSON search request as the SDK. The browser rejected it: `Request header field content-type is not allowed by Access-Control-Allow-Headers in preflight response.` This confirms a browser failure, not merely a suspected source issue. It was a direct fetch check, not native WebMCP tool execution.

### Fix and verification

The Worker now returns the same explicit demo CORS headers for preflight and JSON responses: origin `*`, methods `GET,POST,OPTIONS`, and header `content-type`. Two regression tests cover those headers. After a dry-run bundle check, the fix was deployed as Cloudflare Worker version `267686a2-6638-4cfb-b725-ca48a1da65c2`.

An independent page at `http://127.0.0.1:8799` loaded the deployed `/sdk.js` from the Worker origin. The page supplied a small `document.modelContext.registerTool` capture shim so it could execute the **real registered SDK handlers** without pretending to be a native agent environment. The test then completed:

1. cross-origin synthetic business registration (`201`);
2. all seven SDK tool registrations;
3. business-scoped service lookup and Cleaning slot search;
4. dummy slot hold and appointment confirmation;
5. dummy callback request, same-ID polling, and dummy-time confirmation; and
6. explicit messages that no real call or booking occurred.

This verifies the drop-in network path and the SDK's execute functions. It does not by itself verify native WebMCP discovery; that remains a separate supported-browser test. Production must validate registered origins and authorize actions separately. A wildcard demo CORS policy is not tenant security. See [MDN's preflight explanation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## Claims corrected in the documentation

| Previous implication | More accurate statement |
| --- | --- |
| Dental appointment product | WebMCP adoption through a reusable script, demonstrated with a fictional dental business. |
| Both calendar choices connect working providers | They store preferences; both still return sample data. |
| Phone opt-in controls tool access | The preference is saved but not enforced by registration or execution of the tools. |
| Service implements a trusted consent boundary | The tool description requests approval; the API has no server-side consent/auth checks. |
| A business ID establishes secure tenant isolation | It routes demo data and is public; authenticated isolation is not implemented. |
| Current booking flow calls a calendar adapter | It changes module-level in-memory demo state. |
| Directory and provider infrastructure are deployed | They are possible future work, not current components. |
| Idempotency and durable booking can wait for scale | They are prerequisites before real customer bookings. |

## Other implementation gaps to retain or fix explicitly

- **Business identity in tool metadata:** names remain dental-specific and some descriptions mention Bright Smile even for another registered ID. Generalize metadata before claiming business-neutral installation.
- **Phone preference:** registration stores `callbackEnabled`; the SDK and callback endpoint do not gate on it. Real phone service must also define who calls whom, verify the number, and enforce permissions and consent.
- **Invalid callback option:** when dummy options exist, callback confirmation falls back to the first option if the supplied `slotId` is unknown. The 409 guard only covers an empty option list. The documentation therefore says to use a returned option and does not claim arbitrary invalid selections are rejected.
- **Direct hold requests:** the hold endpoint checks slot availability but does not repeat the configured-service filter used by search. A caller bypassing search could request a template slot for an unconfigured service. Search filtering is not authorization.
- **Public mutable state:** callbacks are retrieved by ID without ownership checks; reset/state endpoints and registration are public. They are suitable only for synthetic demo data.
- **Memory and retries:** normal holds/appointments are not persistent or shared across instances. No idempotency keys or cross-instance concurrency guarantee exists.
- **Local setup:** D1 migrations were missing from the old quick start. Instructions now apply local migrations and explain that the generated snippet otherwise points at the public demo.

## What changed in this task

This work adds an adoption-first README, separate current/proposed architecture, submission copy, exact testing instructions, this readiness review, a shared preflight response, and two CORS regression tests. The database schema, deployment configuration, video work, and unrelated local changes were left untouched.

The architecture review narrows the production proposal to a small shared service with durable booking coordination and provider adapters. It does not introduce a Durable Object, calendar connector, telephony provider, or new backend service into the challenge build.

Validation: all four Mermaid diagrams parsed and rendered in a browser; ten local file links resolved; Markdown fences balanced; `git diff --check`, source syntax, two CORS tests, and the Wrangler dry run passed. The Worker was deployed and the SDK's complete synthetic workflow passed from a second browser origin. A fresh native-agent session and complete automated booking suite were not run in this task.
