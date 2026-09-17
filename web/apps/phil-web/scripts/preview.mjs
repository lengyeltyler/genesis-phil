import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CSP } from "../hosting/worker.mjs";
const root = resolve(
  process.env.PHIL_WEB_OUTPUT ||
    "./.web-build",
  "dist",
);
const release = JSON.parse(await readFile(resolve(root, "release.json")));
if (!release.preview) throw Error("Local preview requires a --preview build.");
createServer(async (req, res) => {
  try {
    if (
      req.headers.host !== "localhost:4173" ||
      !["GET", "HEAD"].includes(req.method)
    )
      throw Error("host");
    const url = new URL(req.url, "http://localhost:4173"),
      file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (file !== "release.json" && !Object.hasOwn(release.assets, file))
      throw Error("asset");
    const bytes = await readFile(resolve(root, file));
    res.writeHead(200, {
      "Content-Type": file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : file.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : file.endsWith(".css")
            ? "text/css; charset=utf-8"
            : file.endsWith(".png")
              ? "image/png"
              : file.endsWith(".json")
                ? "application/json"
                : "application/octet-stream",
      "Content-Security-Policy": CSP.replace("; upgrade-insecure-requests", ""),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end("Unavailable.");
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("Phil Web local preview: http://localhost:4173"),
);
