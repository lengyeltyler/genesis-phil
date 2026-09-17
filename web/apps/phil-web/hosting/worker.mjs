// This host has no account keys, RPC forwarding, analytics, or application logs.
// Its asset binding must contain only the separately built Phil Web release.
export const PRODUCTION_ORIGIN = "https://phil.tylerlengyel.com";

export const CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "img-src 'self' data:",
  "font-src 'none'",
  "media-src 'self'",
  "connect-src 'self' https://eth.drpc.org https://ethereum.publicnode.com https://api.candide.dev/public/v3/1",
  "worker-src 'none'",
  "frame-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

function secured(response, releaseId) {
  const headers = new Headers(response.headers);
  for (const name of [...headers.keys()]) {
    if (
      name.startsWith("access-control-") ||
      [
        "set-cookie",
        "report-to",
        "reporting-endpoints",
        "nel",
        "server",
        "x-powered-by",
        "service-worker-allowed",
      ].includes(name)
    )
      headers.delete(name);
  }
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cache-Control", "no-store, no-transform");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  if (releaseId) headers.set("X-Phil-Release", releaseId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const message = (text, status, headers = {}) =>
  new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });

export const TUTORIAL_KEY = "phil-genesis-tutorial.0721231f121ffc9d3425c79b61fe9e99924b6cffa0f67c94ef3a0000b5288062.mp4";
export const TUTORIAL_BYTES = 459107204;
export function videoRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { offset: start, length: end - start + 1 };
}
async function tutorial(request, env, releaseId) {
  if (!env.TUTORIAL?.head || !env.TUTORIAL?.get) return secured(message("Tutorial unavailable.", 503), releaseId);
  const meta = await env.TUTORIAL.head(TUTORIAL_KEY);
  if (!meta || meta.size !== TUTORIAL_BYTES) return secured(message("Tutorial unavailable.", 503), releaseId);
  const headers = new Headers({"Content-Type":"video/mp4", "Accept-Ranges":"bytes", "ETag":meta.httpEtag,
    "Content-Disposition":"inline; filename=\"Phil Genesis Tutorial.mp4\""});
  let range;
  const rangeHeader = request.method === "GET" && request.headers.get("Range");
  if (rangeHeader && (!request.headers.has("If-Range") || request.headers.get("If-Range") === meta.httpEtag)) {
    range = videoRange(rangeHeader, meta.size);
    if (!range) return secured(new Response(null, {status:416, headers:{"Content-Range":`bytes */${meta.size}`}}), releaseId);
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`);
  }
  headers.set("Content-Length", String(range?.length ?? meta.size));
  const object = request.method === "HEAD" ? null : await env.TUTORIAL.get(TUTORIAL_KEY, {
    onlyIf: {etagMatches: meta.etag}, ...(range ? {range} : {})
  });
  if (request.method !== "HEAD" && (!object || !("body" in object))) return secured(message("Tutorial unavailable.", 503), releaseId);
  const response = secured(new Response(object?.body ?? null, {status:range ? 206 : 200, headers}), releaseId);
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable, no-transform");
  return response;
}

export default {
  async fetch(request, env) {
    let releaseId;
    try {
      const url = new URL(request.url);
      if (
        url.hostname !== "phil.tylerlengyel.com" ||
        url.port ||
        !["http:", "https:"].includes(url.protocol)
      )
        return secured(message("Unknown origin.", 421));
      if (!["GET", "HEAD"].includes(request.method))
        return secured(
          message("Method not allowed.", 405, { Allow: "GET, HEAD" }),
        );
      if (url.protocol === "http:") {
        url.protocol = "https:";
        return secured(
          new Response(null, { status: 308, headers: { Location: url.href } }),
        );
      }
      // No permissive preview domain, client-selected endpoint, or implicit release.
      if (
        !/^[a-f0-9]{40}:[a-f0-9]{64}$/.test(env.PHIL_RELEASE_ID ?? "") ||
        !env.ASSETS?.fetch
      )
        return secured(message("Phil Web is not released.", 503));
      releaseId = env.PHIL_RELEASE_ID;
      if (request.headers.has("Service-Worker"))
        return secured(
          message("Service workers are disabled.", 403),
          releaseId,
        );
      if (url.pathname === "/release-status.json") {
        const requested = env.PHIL_MINT_STAGE;
        const validAccount = /^0x[0-9a-f]{40}$/.test(
          env.PHIL_ACCEPTANCE_ACCOUNT || "",
        );
        const stage =
          requested === "public"
            ? "public"
            : requested === "acceptance" && validAccount
              ? "acceptance"
              : "closed";
        return secured(
          new Response(
            JSON.stringify({
              releaseId,
              stage,
              acceptanceAccount:
                stage === "acceptance" ? env.PHIL_ACCEPTANCE_ACCOUNT : null,
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
          releaseId,
        );
      }
      if (url.pathname.startsWith("/media/")) {
        if (url.pathname !== "/media/" + TUTORIAL_KEY) return secured(message("Not found.", 404), releaseId);
        return await tutorial(request, env, releaseId);
      }
      // An assets request cannot use cookies or credentials inherited from the apex.
      const clean = new Request(url, {
        method: request.method,
        headers: { Accept: request.headers.get("Accept") || "*/*" },
      });
      const asset = await env.ASSETS.fetch(clean);
      if (asset.status >= 300 && asset.status < 400) {
        const target = new URL(asset.headers.get("Location") || "", url);
        if (target.origin !== PRODUCTION_ORIGIN)
          return secured(message("Invalid asset redirect.", 502), releaseId);
      }
      return secured(asset, releaseId);
    } catch {
      // Never serialize request URLs, credentials, upstream errors, or stack traces.
      return secured(
        message("Phil Web is temporarily unavailable.", 503),
        releaseId,
      );
    }
  },
};
