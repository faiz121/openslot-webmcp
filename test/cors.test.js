import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

test("API preflight permits the SDK's cross-origin JSON requests", async () => {
  const response = await worker.fetch(new Request("https://openslot.test/api/slots", {
    method: "OPTIONS",
    headers: {
      origin: "https://business.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type"
    }
  }), {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
  assert.equal(response.headers.get("access-control-allow-headers"), "content-type");
});

test("API JSON responses retain cross-origin headers", async () => {
  const response = await worker.fetch(new Request("https://openslot.test/api/state"), {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-allow-headers"), "content-type");
});
