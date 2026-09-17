import test from "node:test";
import assert from "node:assert/strict";
import worker, { CSP, PRODUCTION_ORIGIN } from "../hosting/worker.mjs";

const release = "a".repeat(40) + ":" + "b".repeat(64);
function environment(
  fetch = async () =>
    new Response("<h1>Fixture</h1>", {
      headers: { "Content-Type": "text/html" },
    }),
) {
  return { PHIL_RELEASE_ID: release, ASSETS: { fetch } };
}
function request(path = "/", options) {
  return new Request(PRODUCTION_ORIGIN + path, options);
}
function secure(response) {
  assert.equal(response.headers.get("Content-Security-Policy"), CSP);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("Cache-Control"), "no-store, no-transform");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(
    response.headers.get("Cross-Origin-Opener-Policy"),
    "same-origin",
  );
  assert.equal(
    response.headers.get("Cross-Origin-Resource-Policy"),
    "same-origin",
  );
  assert.equal(
    response.headers.get("Cross-Origin-Embedder-Policy"),
    "require-corp",
  );
  assert.equal(
    response.headers.get("Strict-Transport-Security"),
    "max-age=31536000",
  );
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|https:\s|\*/);
}

test("assets receive origin policy and release identity; no inherited credentials", async () => {
  const response = await worker.fetch(
    request("/app.js", {
      headers: { Cookie: "marketing=secret", Authorization: "Bearer secret" },
    }),
    environment(async (upstream) => {
      assert.equal(upstream.headers.get("Cookie"), null);
      assert.equal(upstream.headers.get("Authorization"), null);
      return new Response("fixture", {
        headers: {
          "Content-Security-Policy": "default-src *",
          "Access-Control-Allow-Origin": "*",
          "Set-Cookie": "marketing=secret",
          "Service-Worker-Allowed": "/",
        },
      });
    }),
  );
  secure(response);
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.equal(response.headers.get("Service-Worker-Allowed"), null);
  assert.equal(response.headers.get("X-Phil-Release"), release);
});

test("missing release identity fails closed without requesting assets", async () => {
  const response = await worker.fetch(request(), {
    ASSETS: {
      fetch() {
        throw Error("must not run");
      },
    },
  });
  assert.equal(response.status, 503);
  secure(response);
});

test("marketing and provider preview origins cannot serve the application", async () => {
  for (const origin of [
    "https://tylerlengyel.com",
    "https://phil-web.example.workers.dev",
    "https://phil.tylerlengyel.com:444",
  ]) {
    const response = await worker.fetch(new Request(origin), environment());
    assert.equal(response.status, 421);
    secure(response);
  }
});

test("HTTP redirects only to the exact production HTTPS origin", async () => {
  const response = await worker.fetch(
    new Request("http://phil.tylerlengyel.com/path?example=1"),
    environment(),
  );
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    PRODUCTION_ORIGIN + "/path?example=1",
  );
  secure(response);
});

test("mutating methods and service-worker requests cannot reach assets", async () => {
  const env = environment(() => {
    throw Error("must not run");
  });
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await worker.fetch(request("/", { method }), env);
    assert.equal(response.status, 405);
    secure(response);
  }
  const response = await worker.fetch(
    request("/sw.js", { headers: { "Service-Worker": "script" } }),
    env,
  );
  assert.equal(response.status, 403);
  secure(response);
});

test("asset errors, absent paths, and redirect responses retain policy", async () => {
  for (const status of [404, 500, 302]) {
    const response = await worker.fetch(
      request(),
      environment(
        async () =>
          new Response(null, {
            status,
            headers: status === 302 ? { Location: "/next" } : {},
          }),
      ),
    );
    assert.equal(response.status, status);
    secure(response);
  }
  const crossOrigin = await worker.fetch(
    request(),
    environment(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://tylerlengyel.com" },
        }),
    ),
  );
  assert.equal(crossOrigin.status, 502);
  secure(crossOrigin);
  const failure = await worker.fetch(
    request(),
    environment(async () => {
      throw Error("secret provider URL");
    }),
  );
  assert.equal(failure.status, 503);
  secure(failure);
  assert.doesNotMatch(await failure.text(), /secret|provider/);
});

test("HEAD preserves status and policy", async () => {
  const response = await worker.fetch(
    request("/", { method: "HEAD" }),
    environment(async (r) => {
      assert.equal(r.method, "HEAD");
      return new Response(null, { status: 200 });
    }),
  );
  assert.equal(await response.text(), "");
  secure(response);
});
