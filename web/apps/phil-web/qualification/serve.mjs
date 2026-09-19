import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createServer } from "node:http";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = await build({
  entryPoints: [resolve(app, "qualification/physical.mjs")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: ["safari17", "chrome120"],
  alias: {
    ethers: resolve(app, "node_modules/ethers/lib.esm/index.js"),
    "@noble/curves/p256": resolve(
      app,
      "node_modules/@noble/curves/esm/p256.js",
    ),
  },
  define: { __PHIL_LOCAL_PREVIEW__: "true" },
});
const files = {
  "/": await readFile(resolve(app, "qualification/index.html")),
  "/physical.js": result.outputFiles[0].contents,
  "/style.css": await readFile(resolve(app, "public/style.css")),
};
createServer((req, res) => {
  const data = files[req.url];
  if (req.headers.host !== "localhost:4180" || req.method !== "GET" || !data) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": req.url.endsWith(".js")
      ? "text/javascript"
      : req.url.endsWith(".css")
        ? "text/css"
        : "text/html",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; worker-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  res.end(data);
}).listen(4180, "127.0.0.1", () =>
  console.log("Local physical test: http://localhost:4180"),
);
