# Phil Web

Browser-native Genesis client, isolated from the marketing website and Desktop custody. Production origin: **https://phil.tylerlengyel.com**. Production artifacts support Mainnet, with official-client minting initially closed by an explicit release-bound rollout policy. Preview builds remain disabled. No live contracts are changed.

The full compatibility, custody, testing and owner-action report is in `../../docs/PHIL_WEB_IMPLEMENTATION.md`; hosting findings are in `../../docs/PHIL_WEB_HOSTING_AUDIT.md`.

User-facing Genesis parity is documented in [PARITY.md](PARITY.md). Wallet/EntryPoint balances and custom/max ETH withdrawal reuse the existing Desktop/shared production logic. Browser custody and backup formats are unchanged. Read `/release-status.json` for the current release-bound public minting state.

## Local build

Use the repository's pinned Node 26.0.0. On the owner's Mac all builds remain under `/Volumes/PhilsHome/PhilDev/Builds`. No production identities, Keychain or live journals are used.

From repository root:

```sh
npm ci --ignore-scripts --prefix apps/phil-web
node genesis/body2-correction/compile.cjs
PHIL_WEB_OUTPUT=/Volumes/PhilsHome/PhilDev/Builds/phil-web-review node apps/phil-web/scripts/build.mjs --preview
PHIL_WEB_OUTPUT=/Volumes/PhilsHome/PhilDev/Builds/phil-web-review node apps/phil-web/scripts/preview.mjs
```

Open `http://localhost:4173`. A preview has a different WebAuthn RP identity and cannot be used as the production origin. Never fund test/preview accounts. Every build needs a fresh output directory. To produce production-origin artifacts, omit `--preview`. The initial deployment still leaves Mainnet minting closed.

The catalog compiler requires Python 3, ethers and the existing repository toolchain; it reconstructs the already approved catalog, writes generated outputs and re-emits the unchanged art commitment. The browser bundler uses only the app lockfile dependencies, with explicit aliases for shared protocol imports. There is no Electron/native code or private operator configuration in the browser bundle.

## Tests and verification

```sh
node --test apps/phil-web/test/*.test.mjs
node apps/phil-web/scripts/verify-build.mjs /absolute/build/directory
```

Local genuine ERC-4337 contract qualification additionally uses the repository Hardhat dependencies and compiled Genesis artifacts:

```sh
HARDHAT_CONFIG=hardhat.genesis-domain.config.cjs node -e "require('hardhat').run('compile')"
HARDHAT_CONFIG=hardhat.genesis-domain.config.cjs node apps/phil-web/test/local-contract.cjs
```

This local EVM uses chain ID 1 solely to test the existing domain binding. It is not a Mainnet fork and does not contact a public chain. Passkey wrapping uses synthetic fixtures in this test. Real WebAuthn assertion verification is tested separately with signed P-256 fixtures; physical authenticator qualification remains required.

`node apps/phil-web/scripts/audit-public.mjs` is an explicit read-only network qualification command. It checks public Mainnet state and requests an unsigned gas estimate. It cannot submit or sign. It writes a nonsecret report to the owner's external Operations directory.

## Separate deployment pipeline

After the exact source is committed and reviewed, build without `--preview`, then:

```sh
npm ci --ignore-scripts --prefix apps/phil-web/hosting
PHIL_WEB_OUTPUT=/absolute/production/build node apps/phil-web/scripts/deploy.mjs
```

The script refuses preview, dirty, mismatched-source and tampered builds. Wrangler is separately pinned to 4.134.0. It requires authorized Cloudflare account access to the existing zone. It is never invoked by the marketing site pipeline. No deployment, credential lookup, login or hosted CI is performed by the build/tests.

The Custom Domain route is `phil.tylerlengyel.com`, Worker `phil-web`. Cloudflare manages its DNS and HTTPS certificate: do not invent an A record or CNAME. `workers.dev`, preview URLs and Worker observability are disabled. Owner review of shared zone injection/logging rules remains necessary.

## Public verification and update limits

`release.json` lists source hashes, source commit, dirty-candidate status, dependency lockfiles, exact asset hashes, worker/configuration hashes, configuration and catalog identities, and the compiled Mainnet capability (preview builds remain disabled). The separately fetched release status records the current rollout stage. JS/CSS filenames are content-addressed and the HTML binds them with SHA-384 SRI. The running app checks the manifest against compiled release identity and rejects mixed releases. The Worker emits `X-Phil-Release`. The verifier checks all assets, SRI and hosting policy.

To independently verify a release, obtain the published exact source commit, run the pinned build with the same preview mode, compare `release.json` and every listed asset, and run `verify-build.mjs`. A candidate based on an older commit plus uncommitted changes is not an immutable public source release. It must be committed, rebuilt and published before production approval.

There is no service worker, remote code, analytics or key-holding backend. CSP restricts RPC connections to the three explicit public endpoints. Code can still change on a future visit if the publisher or hosting account is compromised; SRI and a same-origin manifest do not solve that trust problem. New releases retain vault/journal schemas and fail closed on unknown formats. Rollback must restore an exact previously reviewed artifact and may not bypass unresolved approval holds.

## Frozen Mainnet rollout

Build once from clean source and deploy closed. After focused qualification, use the same output directory with `scripts/set-launch-stage.mjs acceptance <lowercase-public-account>` to permit the one owner acceptance account. The script checks the frozen source and every hosted asset first. It changes only Worker environment bindings using `--no-bundle`; static files, release manifest and Worker code stay identical. This temporary rollout control is not a person/device/IP mint quota or an on-chain restriction. The Worker stores no identities, keys, journals or admission ledger. Contracts enforce one successful mint per valid Genesis account.

After exactly one confirmed owner-approved Mainnet mint, record JSON evidence with `releaseId`, `chainId: 1`, `mintCount: 1`, `transactionHash`, and true values for `receiptSuccess`, `ownershipVerified`, `recipeVerified`, `oneMintStateVerified`, `journalVerified`. Set `PHIL_WEB_ACCEPTANCE_EVIDENCE` to that report and run `scripts/set-launch-stage.mjs public` with the same `PHIL_WEB_OUTPUT`. The public-account exception is removed. Do not rebuild between acceptance and public activation. `closed` pauses the official client without modifying assets. Every policy read is uncached, release-bound and fail-closed, and policy is refreshed before approval and submission.

## Build 93 presentation

The exact branding-1 Build 93 logo and stylesheet are reused; browser layout additions follow the canonical typography, colors and artwork layout. Browser-specific passkey/backup controls remain isolated from Desktop code. The owner-defined session counter increments once per generated recipe/name pair, including each batch item; loading, keeping and undo do not increment it. Counts reset on page reload, while selected public artwork remains locally saved. The canonical generator, probabilities, recipe encoding and authorization are unchanged.
