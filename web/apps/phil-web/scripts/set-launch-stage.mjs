// Change only operational rollout bindings; never rebuild or edit the frozen artifact.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { verifyBuild } from "./verify-build.mjs";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(app, "../..");
const output = process.env.PHIL_WEB_OUTPUT;
const [stage, account = ""] = process.argv.slice(2);
if (!output || !["closed", "acceptance", "public"].includes(stage))
  throw Error(
    "Set PHIL_WEB_OUTPUT and specify closed, acceptance <account>, or public.",
  );
if (
  stage === "acceptance"
    ? !/^0x[0-9a-f]{40}$/.test(account) || /^0x0{40}$/.test(account)
    : account !== ""
)
  throw Error(
    "Only acceptance accepts a nonzero lowercase public account address.",
  );
const { release, releaseId } = await verifyBuild(output);
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (
  release.preview ||
  release.worktreeDirty ||
  git("status", "--porcelain") ||
  git("rev-parse", "HEAD") !== release.commit
)
  throw Error("The clean frozen production source is required.");
for (const [file, hash] of Object.entries(release.sources))
  if (
    createHash("sha256")
      .update(await readFile(resolve(root, file)))
      .digest("hex") !== hash
  )
    throw Error("Frozen source mismatch: " + file);
// Public activation requires the operator's recorded, receipt-backed acceptance of this exact release.
if (stage === "public") {
  if (!process.env.PHIL_WEB_ACCEPTANCE_EVIDENCE)
    throw Error("Receipt-backed acceptance evidence required.");
  const proof = JSON.parse(
    await readFile(process.env.PHIL_WEB_ACCEPTANCE_EVIDENCE),
  );
  if (
    proof.releaseId !== releaseId ||
    proof.chainId !== 1 ||
    proof.mintCount !== 1 ||
    !/^0x[0-9a-fA-F]{64}$/.test(proof.transactionHash) ||
    ![
      "receiptSuccess",
      "ownershipVerified",
      "recipeVerified",
      "oneMintStateVerified",
      "journalVerified",
    ].every((k) => proof[k] === true)
  )
    throw Error("Incomplete or mismatched Mainnet acceptance evidence.");
}
// Read-only hosted comparison prevents activating a different deployment by accident.
for (const [file, hash] of Object.entries(release.assets)) {
  const response = await fetch("https://phil.tylerlengyel.com/" + file, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (
    !response.ok ||
    response.headers.get("x-phil-release") !== releaseId ||
    createHash("sha256")
      .update(new Uint8Array(await response.arrayBuffer()))
      .digest("hex") !== hash
  )
    throw Error("Hosted artifact mismatch: " + file);
}
console.log(
  JSON.stringify({ releaseId, stage, acceptanceAccount: account || null }),
);
execFileSync(
  process.execPath,
  [
    resolve(app, "hosting/node_modules/wrangler/bin/wrangler.js"),
    "deploy",
    "--no-bundle",
    "--config",
    resolve(output, "wrangler.json"),
    "--var",
    "PHIL_RELEASE_ID:" + releaseId,
    "--var",
    "PHIL_MINT_STAGE:" + stage,
    "--var",
    "PHIL_ACCEPTANCE_ACCOUNT:" + account,
  ],
  {
    cwd: output,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
await verifyBuild(output);
