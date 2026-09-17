# Phil Genesis

369 fully on-chain Phils on Ethereum Mainnet. Find a Phil, review the exact action, and approve it with your account's protected authority. Mint price is 0 ETH; Ethereum network fees apply. Each valid Genesis account can mint once. This is not a one-person or one-device limit.

- **[Launch Phil Web](https://phil.tylerlengyel.com)** — Ethereum Mainnet, with account balance, funding estimates, withdrawal, History, Timeline and Tutorial.
- **[Download Desktop 0.3.0, Build 96](https://github.com/lengyeltyler/genesis-phil/releases/download/v0.3.0-build96/Phil-0.3.0-96-macOS-arm64.dmg)** — Apple Silicon macOS, Developer ID signed, notarized and stapled.
- [Verify the installer](docs/VERIFY-DOWNLOAD.md) · [Desktop source and verification](desktop/README.md)
- [Web source and reconstruction](web/README.md) · [Final source tag](https://github.com/lengyeltyler/genesis-phil/tree/phil-final-blue-ui-2026-09-17) · [Web release identity](web/LIVE-RELEASE.json)
- [Release manifest](release-manifest.json) · [Checksums](SHA256SUMS) · [Release status](release-status.json)

## Final UI release

Desktop Build 96 and Web preserve the Build-93 visual hierarchy and canonical logo, use the exact #C9E3FF light-blue accent, and retain Rolls. Web's Genesis-open announcements are removed. History is headed **Phils-Story**; Story and Timeline controls are unchanged. Warning/error colors stay distinct.

Desktop engineering source: `776be1735a3bcb457d7bf02e1e5a44b1cad6eed9`, tree `80c90c52238c934d704b7b6382fb740f8c79f40c`. Its only changes from Build 95 are the stylesheet and build number. Web changes are limited to accents, announcement removal/dead code, one matching UI test, and the owner-requested History heading. No custody, account derivation, backup, passkey, provider/bundler, contract, artwork, recipe, transaction authorization or journal logic changed. [Exact UI audit](docs/FINAL-UI-AUDIT.md).

Installer SHA-256: `9575bd6696f9c15f56ecd3e49511564068b78c0d4aa36e3c74422f3e8401f908`. Publisher: **Developer ID Application: Tyler Lengyel (B342738S82)**. Complete public-source-to-package comparison, Hardened Runtime, signatures, notarization, staples and Gatekeeper passed. Credential-free self-build startup remains unqualified because of macOS Team-ID library validation; use the official signed installer for normal operation. No protection was disabled.

## Mainnet contracts

- Genesis NFT: [`0x9732f84c54407cd846b3e987594417bcfa30644e`](https://etherscan.io/address/0x9732f84c54407cd846b3e987594417bcfa30644e)
- Factory: [`0xa3c263c4a0d0dc07b6ea7a8414bd245d98d347f0`](https://etherscan.io/address/0xa3c263c4a0d0dc07b6ea7a8414bd245d98d347f0)
- [Exact configuration and remaining addresses](desktop/apps/philcore-desktop/production/candidate-public-config.json)

This release does not modify or redeploy contracts. Browser passkeys unlock a separate Ethereum signing key; Web encrypted backups and Desktop backups are not interchangeable. Classical cryptography underlies the current authorization path. Post-quantum security and one-human uniqueness are research goals, not current product guarantees.

The root manifests and checksums describe Build 96 and the final live Web release. No additional Mainnet transaction was performed for this UI audit, as instructed by the owner. Automated flow regressions and source equivalence do not constitute a new end-to-end Mainnet mint.

## Historical releases and source tags

The historical `phil-web-completion-2026-09-17` tag remains at `ee5c853a61868d06e92c4984b5faa5f8aaed97d3`, recording the pre-public state. The historical `phil-web-mainnet-live-2026-09-17` tag records the preceding public release. The final blue UI is identified by `phil-final-blue-ui-2026-09-17` and `v0.3.0-build96-source`. Build 95 remains a historical draft with no installer asset.

Build 93 and Build 94 artifacts remain unchanged. The historical public `v0.3.0-build93` tag points to commit `67b0b7c58943c5446019b34f173255b7dfa4846b`, also used by Build 88. Its source archive contains old download documentation, not the Build-93 application source. That tag has not been moved. Use the Build-96 source tag and file maps for current verification.

The separate [P.C. repository](https://github.com/lengyeltyler/P.C.) is the historical controlled Sepolia beta, not this Genesis Mainnet Web release. Earlier Phil art and proof experiments remain historical projects.

Source licenses and third-party notices remain in each snapshot. Artwork/branding rights are described in [ASSET_RIGHTS.md](desktop/docs/reference/ASSET_RIGHTS.md).
