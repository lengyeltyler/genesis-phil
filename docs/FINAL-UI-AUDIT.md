# Final Phil UI and release audit

Scope: remove the Genesis-open announcements, replace nonsemantic purple accents with exact **#C9E3FF**, and use the owner's follow-up heading **Phils-Story** in History. Story and Timeline tabs are unchanged. No other features or runtime changes.

## Results and evidence boundaries

| Check | Result |
| --- | --- |
| Genesis announcement removal | PASS — Web markup, startup announcement, guide announcement, listener and unused selectors removed; no separate dApp or Desktop announcement exists |
| Exact light-blue accents | PASS — Desktop and Web; see [complete value and selector map](FINAL-COLOR-MAP.json) |
| Logo / Rolls / Build-93 hierarchy | PASS — logos byte-identical, Rolls retained, both layouts visually inspected in Chrome |
| Desktop package/source correspondence | PASS — all 633 inventory entries, 311 files/links; exact resources, Electron and normalized native helper compared |
| Developer ID / Hardened Runtime / notarization / staples / Gatekeeper | PASS — app and DMG |
| Web public asset / release / Worker integrity | PASS — all seven hosted files match the frozen release; Worker unchanged |
| HTTPS / CSP / headers / isolation | PASS — live HTTPS; strict CSP, worker-src none, frame-ancestors none, no new third-party scripts, no testnet/debug mode |
| History / Timeline | PASS — Phils-Story, unchanged Story/Timeline controls and 161 posts |
| Tutorial | PASS — native Chrome playback advanced to 12 seconds; same-origin byte ranges return 206 |
| Balance / funding / withdrawal controls | PASS — live account balance and fresh unsigned funding estimate; withdrawal controls rendered; execution code unchanged |
| Account / passkey / backup / mint controller | PASS — focused regression tests and exact source-equivalence review; no repeated device/backup ceremony |
| Mainnet minting | ENABLED — release-bound public gate; no additional transaction performed for this UI audit |
| Unexpected functional / security-sensitive diff | NONE |

Desktop visual comparison used its exact final production HTML/CSS/renderer with an isolated mocked IPC fixture, not an owner account or transaction. Package verification separately checked the official signed application. Real account creation, passkey/backup ceremonies and a new end-to-end Mainnet mint were not repeated. Prior owner-reported mints are not represented as a transaction test of this exact release.

## Exact release identity

- Desktop: **0.3.0 Build 96**, package revision `build93-light-blue`.
- Desktop engineering HEAD: `776be1735a3bcb457d7bf02e1e5a44b1cad6eed9`.
- Desktop engineering tree: `80c90c52238c934d704b7b6382fb740f8c79f40c`.
- DMG SHA-256: `9575bd6696f9c15f56ecd3e49511564068b78c0d4aa36e3c74422f3e8401f908` (132867632 bytes).
- Developer ID: Tyler Lengyel (`B342738S82`); bundle `com.philcore.desktop`.
- App notarization: `e2afd8b6-7278-404f-a2aa-15e4666ab4e9`, Accepted.
- DMG notarization: `8316f210-9a18-4a16-834f-7582fa99d31f`, Accepted.
- Web engineering HEAD: `564df2262b7b637aafa3c44bb050794e1656ed36`.
- Web engineering tree: `e42c9d6a12e8016200ed9caacfaef8242fe91b55`.
- Web build SHA-256: `3aa231c091f838f802c217a0022f8bdff8625430abb7bba013113244f45224bc`.
- Web release-manifest SHA-256: `a144387db6c9fdec2c0a746df7903949c6f190337f7e4ea3bda2d7ddb29a9b77`.
- Worker SHA-256: `0f7d3df679b9151599e5f3670ce9c1562f2245de1abe228a19f1ff6e5e0ba4a4`.
- Public branch: `main`; immutable source tags: `v0.3.0-build96-source`, `phil-final-blue-ui-2026-09-17`; installer release: `v0.3.0-build96`. Resolve the tags for the exact public snapshot commit. The exported subset has distinct Git identity from each engineering worktree.

Web build hash is SHA-256 of compact JSON mapping sorted distribution filenames (including release.json) to SHA-256, followed by LF. [Live metadata](../web/LIVE-RELEASE.json), [Desktop verification](../desktop/verification-manifest.json), [installer manifest](../release-manifest.json), [checksums](../SHA256SUMS).

## Exact engineering changes

| File | Classification |
| --- | --- |
| Desktop `apps/philcore-desktop/production/ui/style.css` | UI / STYLE ONLY |
| Desktop `apps/philcore-desktop/production/release-version.json` | RELEASE/PACKAGING — 95 to 96 |
| Web `apps/phil-web/public/style.css` | UI / STYLE ONLY; DEAD-CODE CLEANUP — two unused banner selectors |
| Web `apps/phil-web/public/index.html` | UI / STYLE ONLY; DEAD-CODE CLEANUP — announcement markup removed and Phils-Story heading |
| Web `apps/phil-web/src/app.mjs` | DEAD-CODE CLEANUP; UI / STYLE ONLY — announcement writes/listener removed; initial loading status cleared; all policy checks retained |
| Web `apps/phil-web/test/welcome.test.mjs` | RELEASE/PACKAGING — expected guide assertion updated for removed announcement |

No changes to identity creation, custody, Keychain/safeStorage, backups, restore, account derivation, passkeys, MINT_PHIL, TRANSFER_PHIL, WITHDRAW_ETH, provider/bundler configuration, contract bindings, artwork generation, recipe binding, one-mint-per-account rules, journals or ambiguous-submission handling. Source diff is exhaustively constrained to the files above.

## Colors

[FINAL-COLOR-MAP.json](FINAL-COLOR-MAP.json) enumerates every previous value, replacement, occurrence count, exact selector, declaration and line in both public stylesheets. Pale text/primary/selected/focus accents use #C9E3FF. Background/border tints use the same RGB with alpha; formerly violet neutral backgrounds/text become neutral grays. Errors, warnings, expiry and disabled opacity retain their original values. Canonical logo and artwork colors are not modified.

## Focused tests

**74 unique tests passed, zero final failures:** 60 Web/UI checks and 14 Desktop-verifier tests. The 11 overlapping UI/content tests passed again after the final heading edit. The original banner-dependent guide assertion failed once during cleanup and was updated to assert announcement absence. Public Web reconstruction reproduces the exact assets, Worker and manifest. Desktop full source-to-DMG comparison passed separately. No broad Sepolia/custody campaign or new Mainnet mint.

Public HTTP checks returned 200 for tylerlengyel.com and phil.tylerlengyel.com; the marketing Launch Phil link targets the functioning Phil origin. The Web gate is public, and all served asset hashes equal the frozen release.

## Public snapshot changes

| File | Classification |
| --- | --- |
| `README.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `SHA256SUMS` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `SHA256SUMS.txt` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/BUILDING.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/ORIGINAL-SOURCE-MAP.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/README.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/SOURCE-FILES.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/VERIFYING.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/apps/philcore-desktop/production/release-version.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/apps/philcore-desktop/production/ui/style.css` | UI / STYLE ONLY |
| `desktop/package-inventory.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `desktop/verification-manifest.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `docs/CONTRACTS.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `docs/FINAL-COLOR-MAP.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `docs/FINAL-UI-AUDIT.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `docs/GETTING-STARTED.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `docs/PRIVACY-AND-LIMITATIONS.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `docs/TROUBLESHOOTING.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `docs/VERIFY-DOWNLOAD.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `release-manifest.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `release-status.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `web/LIVE-RELEASE.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `web/ORIGINAL-SOURCE-MAP.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `web/README.md` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `web/apps/phil-web/public/index.html` | UI / STYLE ONLY; DEAD-CODE CLEANUP |
| `web/apps/phil-web/public/style.css` | UI / STYLE ONLY |
| `web/apps/phil-web/src/app.mjs` | DEAD-CODE CLEANUP; UI / STYLE ONLY |
| `web/apps/phil-web/test/welcome.test.mjs` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |
| `web/reference-release.json` | RELEASE/PACKAGING (source evidence, documentation or test expectation) |

## Remaining findings

- Critical: none.
- High: none.
- Medium: none identified in this bounded change.
- Low: none identified in this bounded change.
- Informational: credential-free ad-hoc self-build startup remains unqualified under macOS Team-ID library validation; the official signed installer passed package and Apple checks. Verification does not constitute a new broad product/security qualification. The original tutorial is historical footage and is not a screenshot of Build 96; current source/docs identify the new UI. Historical tags, releases and archived manifests are preserved.

No optional improvements were implemented.
