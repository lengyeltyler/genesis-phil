import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const require = createRequire(import.meta.url),
  app = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = resolve(app, "../..");
test("browser-compiled artwork matches canonical SVG, name, traits and commitment across representative recipes", async () => {
  const result = await build({
    stdin: {
      contents: "export {createArtReader} from './genesis/production/art.cjs'",
      resolveDir: root,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    inject: [resolve(app, "src/buffer.mjs")],
    alias: {
      "node:crypto": resolve(app, "src/browser-crypto.mjs"),
      ethers: resolve(app, "node_modules/ethers/lib.esm/index.js"),
    },
  });
  const compiled = await import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].contents).toString("base64")
  );
  const input = {
    catalog: await readFile(
      resolve(root, "genesis/optimization/.generated/catalog.bin"),
    ),
    manifest: JSON.parse(
      await readFile(
        resolve(root, "genesis/optimization/evidence/optimized-manifest.json"),
      ),
    ),
  };
  const browser = compiled.createArtReader(input),
    canonical = require("../../../genesis/production/art.cjs").createArtReader(
      input,
    );
  for (const [recipe, name] of [
    [1n, 1n],
    [2n, 160n],
    [369n, 369n],
    [99999n, 160n],
    [123456789n, 2n],
  ])
    assert.deepEqual(
      browser.render(recipe, name),
      canonical.render(recipe, name),
    );
  const changed = { ...input, catalog: Buffer.from(input.catalog) };
  changed.catalog[100] ^= 1;
  assert.throws(() => compiled.createArtReader(changed), /ART_CHANGED/);
});
