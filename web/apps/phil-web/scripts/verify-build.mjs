import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
export async function verifyBuild(directory) {
  const root = resolve(directory),
    dist = resolve(root, "dist"),
    bytes = await readFile(resolve(dist, "release.json")),
    release = JSON.parse(bytes),
    sha = (x) => createHash("sha256").update(x).digest("hex");
  if (
    release.format !== "phil-web-release-v1" ||
    release.mainnetEnabled !== !release.preview ||
    sha(JSON.stringify(release.sources)) !== release.sourceDigest
  )
    throw Error("Invalid release manifest.");
  const files = await readdir(dist);
  if (
    files.sort().join("|") !==
    [...Object.keys(release.assets), "release.json"].sort().join("|")
  )
    throw Error("Unexpected release files.");
  for (const [file, hash] of Object.entries(release.assets)) {
    if (
      file.includes("/") ||
      file.includes("..") ||
      sha(await readFile(resolve(dist, file))) !== hash
    )
      throw Error("Asset mismatch: " + file);
  }
  const config = JSON.parse(await readFile(resolve(root, "wrangler.json")));
  if (config.vars.PHIL_RELEASE_ID !== release.commit + ":" + sha(bytes))
    throw Error("Hosting release binding mismatch.");
  if (
    sha(await readFile(resolve(root, "worker.mjs"))) !==
    release.deployment.workerSHA256
  )
    throw Error("Worker mismatch.");
  const deployment = structuredClone(config);
  deployment.vars.PHIL_RELEASE_ID = "UNRELEASED";
  if (
    sha(JSON.stringify(deployment)) !== release.deployment.configurationSHA256
  )
    throw Error("Deployment policy mismatch.");
  const html = await readFile(resolve(dist, "index.html"), "utf8");
  for (const name of Object.keys(release.assets).filter((x) =>
    /\.(js|css)$/.test(x),
  )) {
    const sri =
      "sha384-" +
      createHash("sha384")
        .update(await readFile(resolve(dist, name)))
        .digest("base64");
    if (!html.includes("/" + name) || !html.includes(sri))
      throw Error("Missing integrity binding.");
  }
  return { release, releaseId: config.vars.PHIL_RELEASE_ID };
}
if (process.argv[1]?.endsWith("verify-build.mjs")) {
  const result = await verifyBuild(
    process.argv[2] || process.env.PHIL_WEB_OUTPUT,
  );
  console.log(
    JSON.stringify(
      {
        releaseId: result.releaseId,
        assets: Object.keys(result.release.assets).length,
        preview: result.release.preview,
        sourceDigest: result.release.sourceDigest,
      },
      null,
      2,
    ),
  );
}
