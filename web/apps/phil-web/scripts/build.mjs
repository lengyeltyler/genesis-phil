import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
const app = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = resolve(app, "../..");
const output = resolve(
  process.env.PHIL_WEB_OUTPUT ||
    "./.web-build",
);
if (output === root || output.startsWith(app + "/src") || output === app)
  throw Error("Output must be a separate build directory.");
const preview = process.argv.includes("--preview"),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  sri = (b) => "sha384-" + createHash("sha384").update(b).digest("base64");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: root },
)
  .toString()
  .split("\0")
  .filter(
    (x) =>
      x &&
      (x.startsWith("apps/phil-web/") ||
        x.startsWith("genesis/") ||
        x === "apps/philcore-desktop/production/candidate-public-config.json"),
  )
  .sort();
const sources = {};
for (const file of files)
  sources[file] = sha(await readFile(resolve(root, file)));
const sourceDigest = sha(JSON.stringify(sources));
const catalog = await readFile(
    resolve(root, "genesis/optimization/.generated/catalog.bin"),
  ),
  manifest = await readFile(
    resolve(root, "genesis/optimization/evidence/optimized-manifest.json"),
  );
const config = JSON.parse(
  await readFile(
    resolve(
      root,
      "apps/philcore-desktop/production/candidate-public-config.json",
    ),
  ),
);
if (
  sha(catalog) !==
    "0a75a6f8f2c851b14a92dd363bab09aa7a1c987705c69e6badc71f16dde050b5" ||
  JSON.parse(manifest).runtimeCommitment !== config.catalogCommitment
)
  throw Error(
    "Unqualified artwork catalog. Run the existing Body2 catalog compiler.",
  );
const result = await build({
  entryPoints: [resolve(app, "src/app.mjs")],
  bundle: true,
  write: false,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["safari17", "chrome120"],
  metafile: true,
  legalComments: "inline",
  inject: [resolve(app, "src/buffer.mjs")],
  alias: {
    "@noble/curves/p256": resolve(
      app,
      "node_modules/@noble/curves/esm/p256.js",
    ),
    "node:crypto": resolve(app, "src/browser-crypto.mjs"),
    ethers: resolve(app, "node_modules/ethers/lib.esm/index.js"),
  },
  define: {
    __PHIL_LOCAL_PREVIEW__: String(preview),
    __PHIL_SOURCE_DIGEST__: JSON.stringify(sourceDigest),
    __PHIL_COMMIT__: JSON.stringify(commit),
    __PHIL_CATALOG_SHA__: JSON.stringify(sha(catalog)),
    __PHIL_MANIFEST_SHA__: JSON.stringify(sha(manifest)),
  },
  logLevel: "warning",
});
if (
  Object.keys(result.metafile.inputs).some((name) =>
    /(?:^|\/)phil-web\/(?:qualification|test)\//.test(name),
  )
)
  throw Error("Test-only code must not enter the production bundle.");
const js = result.outputFiles[0].contents,
  css = await readFile(resolve(app, "public/style.css")),
  jsName = "app." + sha(js) + ".js",
  cssName = "style." + sha(css) + ".css";
const dist = resolve(output, "dist");
await mkdir(dist, { recursive: true });
let html = await readFile(resolve(app, "public/index.html"), "utf8");
html = html
  .replaceAll("__JS__", "/" + jsName)
  .replaceAll("__CSS__", "/" + cssName)
  .replaceAll("__JS_SRI__", sri(js))
  .replaceAll("__CSS_SRI__", sri(css));
const assets = {
  [jsName]: js,
  [cssName]: css,
  "index.html": Buffer.from(html),
  "catalog.bin": catalog,
  "catalog-manifest.json": manifest,
  "phil-logo.png": await readFile(resolve(app, "public/phil-logo.png")),
};
const hashes = {};
for (const [name, bytes] of Object.entries(assets)) {
  await writeFile(resolve(dist, name), bytes);
  hashes[name] = sha(bytes);
}
// Prevent stale files from silently entering a new deployment: output must be empty or same build.
for (const file of await readdir(dist))
  if (!Object.hasOwn(assets, file) && file !== "release.json")
    throw Error(
      "Build output contains an older release. Choose a fresh PHIL_WEB_OUTPUT directory.",
    );
const worker = await readFile(resolve(app, "hosting/worker.mjs"));
const wrangler = JSON.parse(
  await readFile(resolve(app, "hosting/wrangler.template.json")),
);
if (preview) wrangler.routes = [];
const release = {
  deployment: {
    workerSHA256: sha(worker),
    configurationSHA256: sha(JSON.stringify(wrangler)),
  },
  worktreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  format: "phil-web-release-v1",
  commit,
  tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  toolchain: {
    node: process.version,
    npmLockfileVersion: JSON.parse(
      await readFile(resolve(app, "package-lock.json")),
    ).lockfileVersion,
  },
  sourceDigest,
  preview,
  mainnetEnabled: !preview,
  catalogCommitment: config.catalogCommitment,
  configurationSHA256: sha(
    await readFile(
      resolve(
        root,
        "apps/philcore-desktop/production/candidate-public-config.json",
      ),
    ),
  ),
  assets: hashes,
  sources,
};
const bytes = Buffer.from(JSON.stringify(release, null, 2) + "\n");
await writeFile(resolve(dist, "release.json"), bytes);
await copyFile(
  resolve(app, "hosting/worker.mjs"),
  resolve(output, "worker.mjs"),
);
wrangler.vars.PHIL_RELEASE_ID = commit + ":" + sha(bytes);
await writeFile(
  resolve(output, "wrangler.json"),
  JSON.stringify(wrangler, null, 2) + "\n",
);
await writeFile(
  resolve(output, "bundle-inputs.json"),
  JSON.stringify(result.metafile, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      output,
      commit,
      sourceDigest,
      releaseId: wrangler.vars.PHIL_RELEASE_ID,
      preview,
      mainnetEnabled: !preview,
      bytes: js.length,
    },
    null,
    2,
  ),
);
