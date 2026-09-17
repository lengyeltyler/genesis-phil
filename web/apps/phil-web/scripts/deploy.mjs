// Separate manual deployment pipeline. Never invoked by the build or marketing CI.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { verifyBuild } from "./verify-build.mjs";
const app = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = resolve(app, "../.."),
  output = process.env.PHIL_WEB_OUTPUT;
if (!output)
  throw Error("Set PHIL_WEB_OUTPUT to the reviewed production build.");
const { release, releaseId } = await verifyBuild(output);
if (release.worktreeDirty)
  throw Error("Release was built from uncommitted changes.");
if (release.preview) throw Error("Preview builds cannot be deployed.");
if (
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
)
  throw Error("Commit and review the exact source before deployment.");
if (
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim() !== release.commit
)
  throw Error("Release commit mismatch.");
for (const [file, hash] of Object.entries(release.sources))
  if (
    createHash("sha256")
      .update(await readFile(resolve(root, file)))
      .digest("hex") !== hash
  )
    throw Error("Release source mismatch.");
console.log(
  "Deploying Phil Web release with public minting initially closed " +
    releaseId +
    " to phil.tylerlengyel.com",
);
execFileSync(
  process.execPath,
  [
    resolve(app, "hosting/node_modules/wrangler/bin/wrangler.js"),
    "deploy",
    "--no-bundle",
    "--config",
    resolve(output, "wrangler.json"),
  ],
  {
    cwd: output,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
