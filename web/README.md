# Phil Web — frozen History/Tutorial release

Production: https://phil.tylerlengyel.com

Engineering HEAD `d5b533ba7901f811c1345849bc65ccb5362138f2`.
The exact tree, source digest, assets, Worker and configuration are in [reference-release.json](reference-release.json). The public source export contains the browser bundle's complete source dependency set, tests, content, hosting code and pipeline. [ORIGINAL-SOURCE-MAP.json](ORIGINAL-SOURCE-MAP.json) records exact original hashes and sanitizations of owner-specific documentation/output paths. Runtime modules are unmodified.

The app lockfile and separate Wrangler lockfile are pinned. No Desktop runtime or private owner state is needed in the browser build. The supplied catalog is the exact published catalog; it can also be reconstructed using the Desktop export's art sources/compiler and compared byte-for-byte.

## Reproduce the hosted release

Use Node 26.0.0, then from this `web` directory:

```sh
npm ci --prefix apps/phil-web --ignore-scripts --no-audit --no-fund
PHIL_WEB_OUTPUT="$PWD/.web-build" node apps/phil-web/scripts/reconstruct-public.mjs
node apps/phil-web/scripts/verify-build.mjs "$PWD/.web-build"
```

The public reconstruction verifies the source-file map, retains the frozen engineering identity, and requires every produced asset, Worker and complete release manifest to match the reference. It was run from freshly installed public dependencies and passed exact comparison. The exported source is a subset, so the ordinary engineering build command would derive a different Git identity; use the reconstruction command above to verify this specific live release.

`release.json.mainnetEnabled` describes compiled capability, **not the live public gate**. Read https://phil.tylerlengyel.com/release-status.json for the current release-bound `closed`, account-specific `acceptance`, or `public` state. At initial publication this release is **closed**, pending one fresh-account owner acceptance. No mint was performed to qualify the content update.

## Content and hosting

The owner's complete story and 161 original timeline posts are preserved: 98 in 2024, 22 in 2025 and 41 in 2026. Content is rendered with text nodes; only exact HTTPS X source/photo links become clickable, with opener protection. No remote scripts or embeds. [Source provenance](apps/phil-web/content/README.md).

The exact original Tutorial MP4 is streamed through the same origin from private Cloudflare R2, with GET/HEAD and byte-range support. SHA-256 `0721231f121ffc9d3425c79b61fe9e99924b6cffa0f67c94ef3a0000b5288062`, 459107204 bytes, 447.830717 seconds, 1920×1080 H.264/AAC. Upload and complete read-back hash verified; live Chrome playback verified. The MP4 container/codecs support modern Chrome and Safari; Safari playback was not physically tested. The player uses native controls, no third-party player, and `preload="none"`.

50 focused Web tests passed. The content update changes no custody, passkey, vault, backup, restore, protocol, account derivation, art, recipe, execution, provider, bundler or journal module. CSP adds only same-origin media. The original security headers and service-worker prohibition remain enforced.

For development/deployment details, see [the application README](apps/phil-web/README.md). Production publication uses a separately pinned Wrangler pipeline; do not deploy an export or rebuild during acceptance. The owner acceptance/public gate transition must use the already-frozen qualified production output.
