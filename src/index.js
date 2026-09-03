const BUSINESS_ID = "bright-smile-dental";

const defaultBusinessProfile = {
  id: BUSINESS_ID,
  name: "Bright Smile Dental",
  location: "284 Valencia Street, San Francisco, CA 94103",
  phone: "+1 (415) 555-0147",
  services: ["Cleaning", "New patient exam", "Emergency consultation"],
  integration: "hosted-calendar",
  callbackEnabled: true
};

let businessProfile = clone(defaultBusinessProfile);
let callbacks = new Map();

const initialSlots = [
  { id: "slot-cleaning-tue-1000", service: "Cleaning", date: "2026-09-08", time: "10:00 AM", duration: 60, status: "available" },
  { id: "slot-exam-wed-1430", service: "New patient exam", date: "2026-09-09", time: "2:30 PM", duration: 45, status: "available" },
  { id: "slot-emergency-thu-1600", service: "Emergency consultation", date: "2026-09-10", time: "4:00 PM", duration: 30, status: "available" },
  { id: "slot-cleaning-fri-0900", service: "Cleaning", date: "2026-09-11", time: "9:00 AM", duration: 60, status: "available" }
];

let slots = clone(initialSlots);
let holds = new Map();
let appointments = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...extraHeaders
    }
  });
}

function html() {
  return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function sdk() {
  return new Response(SDK, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

function businessFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    phone: row.phone,
    services: JSON.parse(row.services_json),
    integration: row.integration,
    callbackEnabled: Boolean(row.callback_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getBusiness(env, id = BUSINESS_ID) {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT * FROM businesses WHERE id = ?").bind(id).first();
    if (row) return businessFromRow(row);
    if (id !== BUSINESS_ID) return null;
    await saveBusiness(env, defaultBusinessProfile);
  }
  return clone(id === businessProfile.id ? businessProfile : defaultBusinessProfile);
}

async function saveBusiness(env, profile) {
  businessProfile = clone(profile);
  if (!env.DB) return businessProfile;
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO businesses (id, name, location, phone, services_json, integration, callback_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, location=excluded.location, phone=excluded.phone, services_json=excluded.services_json, integration=excluded.integration, callback_enabled=excluded.callback_enabled, updated_at=excluded.updated_at`)
    .bind(profile.id, profile.name, profile.location, profile.phone, JSON.stringify(profile.services), profile.integration, profile.callbackEnabled ? 1 : 0, now, now)
    .run();
  return { ...profile, createdAt: now, updatedAt: now };
}

async function saveCallback(env, callback) {
  callbacks.set(callback.id, clone(callback));
  if (env.DB) {
    await env.DB.prepare("INSERT INTO callbacks (id, business_id, status, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(callback.id, callback.businessId, callback.status, JSON.stringify(callback), callback.createdAt, callback.createdAt)
      .run();
  }
  return callback;
}

async function getCallback(env, id) {
  if (env.DB) {
    const row = await env.DB.prepare("SELECT payload_json FROM callbacks WHERE id = ?").bind(id).first();
    if (row) return JSON.parse(row.payload_json);
  }
  return callbacks.get(id) || null;
}

async function updateCallback(env, callback) {
  callbacks.set(callback.id, clone(callback));
  if (env.DB) {
    await env.DB.prepare("UPDATE callbacks SET status = ?, payload_json = ?, updated_at = ? WHERE id = ?")
      .bind(callback.status, JSON.stringify(callback), new Date().toISOString(), callback.id)
      .run();
  }
  return callback;
}

function availableSlots(service, dateRange) {
  const lowerService = String(service || "").toLowerCase();
  const lowerRange = String(dateRange || "").toLowerCase();
  return slots.filter((slot) => {
    const serviceMatches = !lowerService || slot.service.toLowerCase().includes(lowerService);
    const dateMatches = !lowerRange || lowerRange.includes("week") || slot.date.includes(lowerRange);
    return slot.status === "available" && serviceMatches && dateMatches;
  });
}

async function api(request, url, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*" } });

  if (url.pathname === "/api/business") {
    const requestedId = url.searchParams.get("businessId") || BUSINESS_ID;
    const business = await getBusiness(env, requestedId);
    return business ? json(business) : json({ error: "Business not found." }, 404);
  }

  if (url.pathname === "/api/business/register" && request.method === "POST") {
    const input = await body(request);
    const generatedId = `biz-${crypto.randomUUID().slice(0, 8)}`;
    const profile = {
      id: generatedId,
      name: input.name || "Unnamed practice",
      location: input.location || "Address to be added",
      phone: input.phone || "Phone to be added",
      services: Array.isArray(input.services) && input.services.length ? input.services : ["General appointment"],
      integration: input.integration || "hosted-calendar",
      callbackEnabled: input.callbackEnabled !== false
    };
    const business = await saveBusiness(env, profile);
    return json({ ok: true, business, next: "Add the generated business ID to the website script, then test the agent-facing tools." }, 201);
  }

  if (url.pathname === "/api/callback" && request.method === "POST") {
    const input = await body(request);
    const business = await getBusiness(env, input.businessId || BUSINESS_ID);
    if (!business) return json({ error: "Business not found." }, 404);
    const callback = {
      id: `callback-${crypto.randomUUID()}`,
      requestId: `request-${crypto.randomUUID().slice(0, 8)}`,
      businessId: business.id,
      business: business.name,
      phone: business.phone,
      requestedService: input.service || "General appointment",
      preferredTimes: input.preferredTimes || "Any available time",
      status: "dummy-options-ready",
      dummyAppointments: clone(initialSlots).slice(0, 2).map((slot) => ({ ...slot, source: "dummy-data" })),
      message: "Dummy data only: a production adapter would place the call through a telephony provider and return the office's real availability.",
      createdAt: new Date().toISOString()
    };
    await saveCallback(env, callback);
    return json(callback, 202);
  }

  const callbackMatch = url.pathname.match(/^\/api\/callback\/([^/]+)$/);
  if (callbackMatch && request.method === "GET") {
    const callback = await getCallback(env, callbackMatch[1]);
    return callback ? json(callback) : json({ error: "Callback request not found." }, 404);
  }

  const callbackConfirmMatch = url.pathname.match(/^\/api\/callback\/([^/]+)\/confirm$/);
  if (callbackConfirmMatch && request.method === "POST") {
    const callback = await getCallback(env, callbackConfirmMatch[1]);
    if (!callback) return json({ error: "Callback request not found." }, 404);
    const input = await body(request);
    const selected = callback.dummyAppointments.find((slot) => slot.id === input.slotId) || callback.dummyAppointments[0];
    callback.status = "dummy-appointment-confirmed";
    callback.confirmedAppointment = selected;
    callback.message = "Dummy confirmation only: no real appointment was booked.";
    await updateCallback(env, callback);
    return json(callback, 201);
  }

  if (url.pathname === "/api/slots" && request.method === "POST") {
    const input = await body(request);
    return json({ businessId: BUSINESS_ID, slots: availableSlots(input.service, input.dateRange), source: "mock-calendar" });
  }

  if (url.pathname === "/api/hold" && request.method === "POST") {
    const input = await body(request);
    const slot = slots.find((candidate) => candidate.id === input.slotId && candidate.status === "available");
    if (!slot) return json({ error: "That slot is no longer available." }, 409);
    const holdId = `hold-${crypto.randomUUID()}`;
    slot.status = "held";
    holds.set(holdId, { holdId, slotId: slot.id, expiresAt: Date.now() + 5 * 60 * 1000 });
    return json({ holdId, slot: clone(slot), expiresInSeconds: 300 });
  }

  if (url.pathname === "/api/confirm" && request.method === "POST") {
    const input = await body(request);
    const hold = holds.get(input.holdId);
    if (!hold || hold.expiresAt < Date.now()) return json({ error: "The hold is missing or expired." }, 409);
    const slot = slots.find((candidate) => candidate.id === hold.slotId && candidate.status === "held");
    if (!slot) return json({ error: "That slot cannot be confirmed." }, 409);
    slot.status = "confirmed";
    const appointment = { id: `appt-${crypto.randomUUID()}`, businessId: BUSINESS_ID, slot: clone(slot), patient: { name: input.name || "Demo Patient", email: input.email || "demo@example.com" }, status: "confirmed" };
    appointments.push(appointment);
    holds.delete(input.holdId);
    return json(appointment, 201);
  }

  if (url.pathname === "/api/state") return json({ businessId: BUSINESS_ID, slots: clone(slots), appointments: clone(appointments) });

  if (url.pathname === "/api/reset" && request.method === "POST") {
    slots = clone(initialSlots);
    holds = new Map();
    appointments = [];
    callbacks = new Map();
    businessProfile = clone(defaultBusinessProfile);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, url, env);
    if (url.pathname === "/sdk.js") return sdk();
    if (url.pathname === "/business") return businessPage();
    return html();
  }
};

function businessPage() {
  return new Response(BUSINESS_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
}

const BUSINESS_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Practice setup | OpenSlot</title>
  <style>
    :root { --navy:#153542; --blue:#0b668c; --pale:#f4f8f8; --line:#d8e3e4; --ink:#263c47; --muted:#6d7d82; --green:#147d67; --white:#fff; }
    * { box-sizing:border-box; } body { margin:0; background:var(--pale); color:var(--ink); font:15px/1.6 Arial, Helvetica, sans-serif; }
    .bar { background:var(--navy); color:#e8f2f2; font-size:12px; } .bar-inner, main { max-width:1020px; margin:auto; padding:0 24px; } .bar-inner { min-height:38px; display:flex; align-items:center; justify-content:space-between; gap:16px; } .bar a { color:#fff; }
    header { background:#fff; border-bottom:1px solid var(--line); } .head { max-width:1020px; margin:auto; padding:24px; display:flex; align-items:center; justify-content:space-between; gap:20px; } .brand { color:var(--navy); font-size:20px; font-weight:700; text-decoration:none; } .brand span { color:var(--blue); } .back { color:var(--blue); text-decoration:none; font-size:14px; }
    main { padding-top:46px; padding-bottom:70px; } .intro { max-width:670px; margin-bottom:28px; } h1 { margin:0 0 8px; color:var(--navy); font-size:34px; line-height:1.15; font-weight:700; letter-spacing:-.03em; } .intro p { margin:0; color:var(--muted); font-size:16px; }
    .layout { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr); gap:24px; align-items:start; } .card { background:#fff; border:1px solid var(--line); border-radius:5px; padding:26px; box-shadow:0 3px 12px rgba(21,53,66,.04); } h2 { margin:0 0 18px; color:var(--navy); font-size:21px; } h3 { margin:0 0 5px; color:var(--navy); font-size:16px; } label { display:block; margin:0 0 5px; color:var(--navy); font-size:13px; font-weight:700; } input, select { width:100%; height:42px; margin-bottom:16px; padding:0 12px; border:1px solid #c8d7d9; border-radius:3px; color:var(--ink); background:#fff; font:inherit; } .two { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .choices { display:grid; gap:10px; margin:5px 0 22px; } .choice { position:relative; display:flex; gap:12px; padding:14px; border:1px solid var(--line); border-radius:4px; cursor:pointer; } .choice:has(input:checked) { border-color:var(--blue); background:#f2fafb; } .choice input { width:17px; height:17px; margin:2px 0 0; accent-color:var(--blue); } .choice p { margin:0; color:var(--muted); font-size:13px; line-height:1.4; }
    button { border:0; border-radius:3px; padding:12px 18px; background:var(--blue); color:#fff; cursor:pointer; font:700 14px Arial, sans-serif; } button:hover { background:#084e6b; } button.secondary { background:#e8f2f2; color:var(--blue); } .status { min-height:24px; margin-top:14px; color:var(--green); font-weight:700; } .small { color:var(--muted); font-size:13px; }
    .side-card { margin-bottom:18px; } .side-card p { margin:0 0 14px; color:var(--muted); font-size:14px; } .snippet { overflow:auto; padding:14px; border-radius:3px; background:#203943; color:#e4f3f3; font:12px/1.6 Consolas, monospace; white-space:pre-wrap; word-break:break-word; } .snippet .punct { color:#9fb8bd; } .snippet .tag { color:#f3b36f; } .snippet .attr { color:#7dd4c5; } .snippet .value { color:#f3dc8b; } .snippet .placeholder { color:#f39a91; } .rule { border:0; border-top:1px solid var(--line); margin:22px 0; } .pill { display:inline-block; margin-bottom:11px; padding:3px 8px; border-radius:12px; background:#e3f2ee; color:var(--green); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    @media (max-width:760px) { .layout { grid-template-columns:1fr; } .head { padding-top:18px; padding-bottom:18px; } h1 { font-size:29px; } .two { grid-template-columns:1fr; gap:0; } }
  </style>
</head>
<body>
  <div class="bar"><div class="bar-inner"><span>Simulated practice setup · OpenSlot</span><a href="/">View patient booking page</a></div></div>
  <header><div class="head"><a class="brand" href="/">Open<span>Slot</span></a><a class="back" href="/">Back to Bright Smile Dental</a></div></header>
  <main>
    <div class="intro"><h1>Set up appointment access for your practice</h1><p>Connect the schedule your team already uses, or start with a hosted calendar. OpenSlot gives patients a simple way to find and request an appointment.</p></div>
    <div class="layout">
      <section class="card">
        <h2>Practice details</h2>
        <form id="setup-form">
          <label for="name">Practice name</label><input id="name" name="name" value="Bright Smile Dental" required />
          <label for="location">Address</label><input id="location" name="location" value="284 Valencia Street, San Francisco, CA 94103" required />
          <div class="two"><div><label for="phone">Main phone</label><input id="phone" name="phone" value="+1 (415) 555-0147" required /></div><div><label for="services">Services</label><input id="services" name="services" value="Cleaning, New patient exam, Emergency consultation" required /></div></div>
          <h2 style="margin-top:8px">Appointment connection</h2>
          <div class="choices">
            <label class="choice"><input type="radio" name="integration" value="hosted-calendar" checked /><span><strong>Use an OpenSlot-hosted calendar</strong><p>For practices without online scheduling. In this demo, availability is sample data. A real hosted calendar would be configured with working hours, services, provider availability, holidays, and blocked times.</p></span></label>
            <label class="choice"><input type="radio" name="integration" value="existing-calendar" /><span><strong>Connect an existing calendar</strong><p>Simulated setup for a future calendar adapter such as a practice-management system or Google Calendar.</p></span></label>
          </div>
          <label class="choice"><input id="callbackEnabled" type="checkbox" checked /><span><strong>Offer phone callbacks</strong><p>Patients can ask the practice to call them when online booking is not enough. The demo queues a simulated callback.</p></span></label>
          <button type="submit">Save practice setup</button><div id="setup-status" class="status" role="status"></div>
        </form>
      </section>
      <aside>
        <section class="card side-card"><span class="pill">After saving</span><h2>Add one script</h2><p>Saving creates a business ID and stores the setup in D1. Copy the generated snippet into the practice's booking page. The page still looks like a normal dental website; compatible agents discover the tools in the background.</p><div id="snippet" class="snippet"><span class="punct">&lt;</span><span class="tag">script</span> <span class="attr">src</span><span class="punct">=</span><span class="value">"https://openslot-webmcp-demo.faizmohammed178.workers.dev/sdk.js"</span>
  <span class="attr">data-business-id</span><span class="punct">=</span><span class="placeholder">"your-business-id"</span><span class="punct">&gt;&lt;/</span><span class="tag">script</span><span class="punct">&gt;</span></div><p id="business-id" class="small">Your business ID will appear here after setup.</p></section>
        <section class="card side-card"><span class="pill">Test only</span><h2>Phone callback</h2><p>The demo returns dummy appointment options, lets an agent poll the request, and accepts a dummy confirmation. No real call is placed.</p><button id="callback" class="secondary" type="button">Queue a sample callback</button><div id="callback-status" class="status" role="status"></div><button id="poll-callback" class="secondary" type="button" hidden>Poll callback status</button><button id="confirm-callback" class="secondary" type="button" hidden>Confirm first dummy time</button></section>
        <section class="card"><h2>Next step</h2><p class="small">For this demo, the hosted calendar returns sample availability. In production, the practice would configure its schedule here, or authorize an existing calendar adapter. Telephony would also be connected only after the practice verifies ownership and grants access.</p><a class="back" href="/">Open the patient page →</a></section>
      </aside>
    </div>
  </main>
  <script>
    const form = document.getElementById('setup-form');
    const setupStatus = document.getElementById('setup-status');
    let registeredBusinessId = 'bright-smile-dental';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const result = await fetch('/api/business/register', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ name:data.get('name'), location:data.get('location'), phone:data.get('phone'), services:String(data.get('services')).split(',').map((item) => item.trim()).filter(Boolean), integration:data.get('integration'), callbackEnabled:document.getElementById('callbackEnabled').checked }) }).then((response) => response.json());
      setupStatus.textContent = result.ok ? 'Practice setup saved. Your business ID and install snippet are ready.' : 'Please review the details and try again.';
      if (result.ok) {
        const id = result.business.id;
        registeredBusinessId = id;
        document.getElementById('snippet').innerHTML = '<span class="punct">&lt;</span><span class="tag">script</span> <span class="attr">src</span><span class="punct">=</span><span class="value">"https://openslot-webmcp-demo.faizmohammed178.workers.dev/sdk.js"</span>\\n  <span class="attr">data-business-id</span><span class="punct">=</span><span class="value">"' + id + '"</span><span class="punct">&gt;&lt;/</span><span class="tag">script</span><span class="punct">&gt;</span>';
        document.getElementById('business-id').textContent = 'Business ID: ' + id + ' · Stored in Cloudflare D1.';
      }
    });
    let callbackRequest;
    document.getElementById('callback').addEventListener('click', async () => {
      callbackRequest = await fetch('/api/callback', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ businessId:registeredBusinessId, service:'New patient exam', preferredTimes:'Weekday mornings' }) }).then((response) => response.json());
      document.getElementById('callback-status').textContent = callbackRequest.status === 'dummy-options-ready' ? 'Dummy options ready. Request ID: ' + callbackRequest.requestId : 'Unable to queue sample callback.';
      document.getElementById('poll-callback').hidden = false;
      document.getElementById('confirm-callback').hidden = false;
    });
    document.getElementById('poll-callback').addEventListener('click', async () => {
      const result = await fetch('/api/callback/' + callbackRequest.id).then((response) => response.json());
      document.getElementById('callback-status').textContent = 'Polled status: ' + result.status + ' · ' + result.dummyAppointments.length + ' dummy times available.';
    });
    document.getElementById('confirm-callback').addEventListener('click', async () => {
      const result = await fetch('/api/callback/' + callbackRequest.id + '/confirm', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ slotId:callbackRequest.dummyAppointments[0].id }) }).then((response) => response.json());
      document.getElementById('callback-status').textContent = result.status === 'dummy-appointment-confirmed' ? 'Dummy time confirmed — no real appointment was booked.' : 'Unable to confirm sample time.';
    });
  </script>
</body>
</html>`;

const SDK = String.raw`(() => {
  const currentScript = document.currentScript;
  const businessId = currentScript?.dataset.businessId || "bright-smile-dental";
  const apiBase = currentScript?.dataset.apiBase || new URL(currentScript?.src || location.href).origin;

  async function call(path, payload = {}) {
    const response = await fetch(apiBase + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, businessId })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Appointment service error");
    return result;
  }

  function show(message, kind = "agent") {
    const output = document.querySelector("[data-agent-output]");
    if (output) {
      output.textContent = typeof message === "string" ? message : JSON.stringify(message, null, 2);
      output.dataset.kind = kind;
    }
  }

  function register() {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;

    modelContext.registerTool({
      name: "get_dental_services",
      title: "List dental services",
      description: "List the services offered by Bright Smile Dental.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const result = await fetch(apiBase + "/api/business").then((response) => response.json());
        show(result.services.join(" • "));
        return result;
      }
    });

    modelContext.registerTool({
      name: "search_dental_appointment_slots",
      title: "Search appointment slots",
      description: "Find available appointment times at Bright Smile Dental.",
      inputSchema: {
        type: "object",
        properties: { service: { type: "string", description: "The dental service needed" }, dateRange: { type: "string", description: "A date or natural-language range such as this week" } },
        required: ["service"]
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const result = await call("/api/slots", input);
        show(result.slots.length ? result.slots : "No matching appointments found.");
        return result;
      }
    });

    modelContext.registerTool({
      name: "hold_dental_appointment_slot",
      title: "Hold an appointment slot",
      description: "Temporarily hold a selected dental appointment slot while the patient reviews it.",
      inputSchema: { type: "object", properties: { slotId: { type: "string" } }, required: ["slotId"] },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        const result = await call("/api/hold", input);
        show("Held " + result.slot.service + " on " + result.slot.date + " at " + result.slot.time + " for five minutes.");
        return result;
      }
    });

    modelContext.registerTool({
      name: "confirm_dental_appointment",
      title: "Confirm a dental appointment",
      description: "Confirm a held dental appointment after the user has explicitly approved it.",
      inputSchema: { type: "object", properties: { holdId: { type: "string" }, name: { type: "string" }, email: { type: "string", format: "email" } }, required: ["holdId", "name", "email"] },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        const result = await call("/api/confirm", input);
        show("Confirmed for " + result.patient.name + ": " + result.slot.service + " on " + result.slot.date + " at " + result.slot.time + ".");
        return result;
      }
    });

    modelContext.registerTool({
      name: "request_dental_callback",
      title: "Request a callback from the dental office",
      description: "Request a phone callback and receive dummy appointment options for this demo. No real call is placed.",
      inputSchema: { type: "object", properties: { service: { type: "string" }, preferredTimes: { type: "string" } }, required: ["service"] },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        const result = await call("/api/callback", input);
        show("Dummy callback options are ready. Request ID: " + result.requestId);
        return result;
      }
    });

    modelContext.registerTool({
      name: "poll_dental_callback_status",
      title: "Poll callback status",
      description: "Check the status of a previously requested dental callback using its callback ID.",
      inputSchema: { type: "object", properties: { callbackId: { type: "string" } }, required: ["callbackId"] },
      annotations: { readOnlyHint: true },
      execute: async ({ callbackId }) => {
        const result = await fetch(apiBase + "/api/callback/" + encodeURIComponent(callbackId)).then((response) => response.json());
        show(result);
        return result;
      }
    });

    modelContext.registerTool({
      name: "confirm_dental_callback_time",
      title: "Confirm a callback appointment time",
      description: "Confirm one of the dummy appointment options returned by a callback request. No real appointment is booked in this demo.",
      inputSchema: { type: "object", properties: { callbackId: { type: "string" }, slotId: { type: "string" } }, required: ["callbackId", "slotId"] },
      annotations: { readOnlyHint: false },
      execute: async ({ callbackId, slotId }) => {
        const response = await fetch(apiBase + "/api/callback/" + encodeURIComponent(callbackId) + "/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slotId, businessId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Callback confirmation error");
        show("Dummy appointment time confirmed; no real appointment was booked.");
        return result;
      }
    });

    document.documentElement.dataset.openslotTools = "ready";
    window.OpenSlot = { businessId, apiBase, toolsRegistered: true };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", register, { once: true });
  else register();
})();`;

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bright Smile Dental | San Francisco Dentist</title>
  <style>
    :root { --blue:#0b668c; --blue-dark:#074765; --light:#edf7f9; --ink:#263c47; --muted:#667980; --line:#d7e3e5; --orange:#ef8b43; --white:#fff; }
    * { box-sizing:border-box; } body { margin:0; background:var(--white); color:var(--ink); font:15px/1.6 Arial, Helvetica, sans-serif; }
    .topbar { background:var(--blue-dark); color:#d8edf1; font-size:12px; } .topbar-inner, .nav-inner, main { max-width:1180px; margin:auto; padding-left:25px; padding-right:25px; } .topbar-inner { min-height:34px; display:flex; align-items:center; justify-content:space-between; gap:18px; } .topbar a { color:inherit; text-decoration:none; }
    header { background:white; border-bottom:1px solid var(--line); } .nav-inner { min-height:82px; display:flex; align-items:center; justify-content:space-between; gap:28px; } .brand { display:flex; align-items:center; gap:10px; color:var(--blue-dark); text-decoration:none; font-size:20px; font-weight:700; letter-spacing:-.02em; white-space:nowrap; } .brand-mark { width:32px; height:32px; border:2px solid var(--blue); border-radius:50%; display:grid; place-items:center; color:var(--blue); font-weight:700; }
    nav { display:flex; align-items:center; gap:26px; } nav a { color:#4d626a; text-decoration:none; font-size:14px; } nav a:hover { color:var(--blue); } .nav-cta, .hero-cta { background:var(--orange); color:white !important; padding:11px 17px; border-radius:3px; font-weight:700; text-decoration:none; }
    main { padding-top:0; padding-bottom:70px; } .hero { margin:0 -25px; padding:62px 25px 66px; background:var(--light); border-bottom:1px solid var(--line); } .hero-inner { max-width:1180px; margin:auto; display:grid; grid-template-columns:1.1fr .9fr; align-items:center; gap:62px; } .eyebrow { color:var(--blue); font-size:12px; font-weight:700; letter-spacing:.11em; text-transform:uppercase; } h1 { margin:12px 0 17px; color:var(--blue-dark); font-family:Georgia, 'Times New Roman', serif; font-size:clamp(39px,5vw,63px); font-weight:400; line-height:1.04; letter-spacing:-.035em; } .hero-copy { max-width:570px; color:#536b73; font-size:17px; } .hero-actions { display:flex; align-items:center; gap:20px; flex-wrap:wrap; margin-top:26px; } .hero-cta { display:inline-block; } .phone-link { color:var(--blue-dark); font-weight:700; text-decoration:none; }
    .hero-panel { background:white; border-top:5px solid var(--orange); padding:27px 29px; box-shadow:0 8px 24px rgba(7,71,101,.08); } .hero-panel h2 { margin:0 0 6px; color:var(--blue-dark); font-family:Georgia, serif; font-weight:400; font-size:27px; } .hero-panel p { margin:0 0 20px; color:var(--muted); } .hero-panel ul { margin:0; padding:0; list-style:none; } .hero-panel li { padding:10px 0; border-top:1px solid var(--line); color:#4d626a; } .hero-panel li::before { content:'✓'; color:var(--orange); font-weight:bold; margin-right:10px; }
    .intro { padding:56px 0 38px; text-align:center; } .intro h2 { margin:0 0 10px; color:var(--blue-dark); font-family:Georgia, serif; font-size:34px; font-weight:400; } .intro p { max-width:650px; margin:0 auto; color:var(--muted); font-size:16px; }
    .services { display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--line); border-bottom:1px solid var(--line); } .service { min-height:145px; padding:25px 22px; border-right:1px solid var(--line); } .service:last-child { border-right:0; } .service h3 { margin:0 0 7px; color:var(--blue); font-size:17px; font-weight:700; } .service p { margin:0; color:var(--muted); font-size:14px; }
    .appointments { margin-top:58px; display:grid; grid-template-columns:.8fr 1.2fr; border:1px solid var(--line); } .appointment-copy { padding:31px; background:var(--blue-dark); color:white; } .appointment-copy h2 { margin:0 0 13px; font-family:Georgia, serif; font-size:31px; font-weight:400; line-height:1.1; } .appointment-copy p { color:#cbe1e5; } .appointment-copy .contact { margin-top:25px; line-height:1.9; } .appointment-copy a { color:white; } .appointment-list { padding:30px; } .appointment-list h2 { margin:0; color:var(--blue-dark); font-family:Georgia, serif; font-size:28px; font-weight:400; } .week { margin:4px 0 15px; color:var(--muted); font-size:13px; } .slot { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:16px 0; border-top:1px solid var(--line); } .slot b { color:var(--blue-dark); } .slot small { color:var(--muted); } button { font:inherit; cursor:pointer; } .slot button { border:1px solid var(--blue); border-radius:3px; background:white; color:var(--blue); padding:8px 12px; font-weight:700; white-space:nowrap; } .slot button:hover { background:var(--blue); color:white; } .slot button:disabled { border-color:var(--line); background:#f4f7f7; color:var(--muted); cursor:default; }
    footer { border-top:1px solid var(--line); padding:25px; color:#718188; text-align:center; font-size:13px; } .demo-label { display:block; margin-top:8px; color:#a0abad; font-size:11px; }
    @media (max-width:780px) { .topbar-inner { justify-content:center; } .topbar-inner span { display:none; } nav { display:none; } .nav-inner { min-height:68px; } .hero { padding-top:43px; padding-bottom:43px; } .hero-inner, .appointments { grid-template-columns:1fr; gap:28px; } .hero-panel { max-width:560px; } .services { grid-template-columns:repeat(2,1fr); } .service:nth-child(2) { border-right:0; } .service:nth-child(-n+2) { border-bottom:1px solid var(--line); } }
    @media (max-width:480px) { .nav-cta { padding:9px 11px; font-size:12px; } .brand { font-size:17px; } .hero-inner { gap:31px; } h1 { font-size:43px; } .hero-actions { align-items:flex-start; flex-direction:column; gap:14px; } .services { grid-template-columns:1fr; } .service { border-right:0 !important; border-bottom:1px solid var(--line); } .service:last-child { border-bottom:0; } .slot { align-items:flex-start; flex-direction:column; gap:10px; } .appointment-copy, .appointment-list { padding:25px; } }
  </style>
</head>
<body>
  <div class="topbar"><div class="topbar-inner"><span>Simulated dentist page · For demonstration only</span><a href="tel:+14155550147">Call us today: (415) 555-0147</a></div></div>
  <header><div class="nav-inner"><a class="brand" href="#top"><span class="brand-mark">B</span><span>Bright Smile Dental</span></a><nav><a href="#care">Our Services</a><a href="#about">About Our Office</a><a href="#new-patients">New Patients</a><a href="#contact">Contact</a><a class="nav-cta" href="#appointments">Schedule an Appointment</a></nav><a class="nav-cta" href="#appointments">Schedule</a></div></header>
  <main id="top">
    <section class="hero"><div class="hero-inner"><div><div class="eyebrow">San Francisco family dentistry</div><h1>We treat people,<br>not just teeth.</h1><p class="hero-copy">Bright Smile Dental provides thoughtful general, cosmetic, and restorative dentistry in a comfortable, welcoming office. Our team takes the time to listen and make sure you understand your care.</p><div class="hero-actions"><a class="hero-cta" href="#appointments">Request an appointment</a><a class="phone-link" href="tel:+14155550147">(415) 555-0147</a></div></div><aside class="hero-panel"><h2>Welcome to our office</h2><p>Personalized care for you and your family.</p><ul><li>New patients welcome</li><li>Most insurance plans accepted</li><li>Comfortable, judgment-free care</li><li>Same-week appointments available</li></ul></aside></div></section>
    <section class="intro" id="about"><h2>Care that feels personal</h2><p>From preventive visits to restorative treatment, we offer the care you need in one familiar office.</p></section>
    <section class="services" id="care"><article class="service"><h3>General Dentistry</h3><p>Exams, cleanings, fillings, and ongoing preventive care.</p></article><article class="service"><h3>Cosmetic Dentistry</h3><p>Whitening and smile enhancements designed around you.</p></article><article class="service"><h3>Restorative Care</h3><p>Crowns, bridges, implants, and comfortable treatment plans.</p></article><article class="service"><h3>Emergency Visits</h3><p>Call us when you need timely help with dental pain.</p></article></section>
    <section class="appointments" id="appointments"><div class="appointment-copy" id="new-patients"><h2>Ready to feel good about your next visit?</h2><p>Tell us what you need and our front desk will help you find a convenient time.</p><div class="contact"><a href="tel:+14155550147">(415) 555-0147</a><br>284 Valencia Street<br>San Francisco, CA 94103<br>Monday–Friday, 8 AM–5 PM</div></div><div class="appointment-list"><h2>Request an appointment</h2><div class="week">Showing availability for the week of September 8, 2026</div><div id="slots"><div class="slot"><div><b>Dental cleaning</b><br><small>Tuesday, September 8 · 10:00 AM · 60 min</small></div><button data-slot="slot-cleaning-tue-1000">Select time</button></div><div class="slot"><div><b>New patient exam</b><br><small>Wednesday, September 9 · 2:30 PM · 45 min</small></div><button data-slot="slot-exam-wed-1430">Select time</button></div><div class="slot"><div><b>Emergency consultation</b><br><small>Thursday, September 10 · 4:00 PM · 30 min</small></div><button data-slot="slot-emergency-thu-1600">Select time</button></div></div></div></section>
  </main>
  <footer id="contact">Bright Smile Dental · 284 Valencia Street, San Francisco · (415) 555-0147<span class="demo-label">Simulated dentist page · For demonstration only</span></footer>
  <script src="/sdk.js" data-business-id="bright-smile-dental"></script>
  <script>
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-slot]"); if (!button) return;
      try { const response = await fetch("/api/hold", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slotId: button.dataset.slot }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); button.textContent = "Selected"; button.disabled = true; } catch (error) { button.textContent = "Unavailable"; button.disabled = true; }
    });
  </script>
</body>
</html>`;
