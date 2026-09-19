# Phil Genesis

369 fully on-chain Phils on Ethereum Mainnet. Find a Phil, review the exact action, and approve it with your account's protected authority. Mint price is 0 ETH; Ethereum network fees apply. Each valid Genesis account can mint once.

- **[Launch Phil Web](https://phil.tylerlengyel.com)** — Ethereum Mainnet with balance, funding estimates, withdrawal, History, Timeline and Tutorial.
- **[Download Desktop 0.3.0, Build 97](https://github.com/lengyeltyler/genesis-phil/releases/download/v0.3.0-build97/Phil-0.3.0-97-macOS-arm64.dmg)** — Apple Silicon macOS, Developer ID signed, notarized and stapled.
- [Verify the installer](docs/VERIFY-DOWNLOAD.md) · [Desktop source and verification](desktop/README.md)
- [Web source and reconstruction](web/README.md) · [Build 97 remediation evidence](docs/BUILD97-REMEDIATION.md)
- [Release manifest](release-manifest.json) · [Checksums](SHA256SUMS) · [Release status](release-status.json)

## Build 97 security remediation

Build 97 fixes the confirmed Web and Desktop availability/state-machine defects found in the September 18 deep audit. A definitely unsubmitted operation can be retired safely; an ambiguous provider delivery remains held. Concurrent deterministic account deployment is accepted only after the complete intended identity is validated. These changes preserve fail-closed and exactly-once authorization.

Desktop source `afbf28a60e2591bb1bf306f333c1a39a6cd80378`, tree `64b43fc7be826e978e833420f51cf6cd13a99952`. Web source `a4b24164bb65b242650a64bb0b76795e1bd84a83`, tree `28a0d26f1610fad3703e41eec6a387f765549223`. The qualification passed 239/239 checks; the independent public verifier passed complete source-to-package comparison and 14 tamper-rejection tests.

Installer SHA-256: `488092e87ef343bbaf288211a6638e4217ab57906323e10a6df4010a8dd0fb77`. Publisher: **Developer ID Application: Tyler Lengyel (B342738S82)**. App and DMG notarization, staples, Hardened Runtime, recursive signatures and Gatekeeper passed. Credential-free self-build startup remains unqualified under macOS Team-ID library validation; use the official signed installer for normal operation. No protection was disabled.

## Mainnet contracts

- Genesis NFT: [`0x9732f84c54407cd846b3e987594417bcfa30644e`](https://etherscan.io/address/0x9732f84c54407cd846b3e987594417bcfa30644e)
- Factory: [`0xa3c263c4a0d0dc07b6ea7a8414bd245d98d347f0`](https://etherscan.io/address/0xa3c263c4a0d0dc07b6ea7a8414bd245d98d347f0)
- [Exact configuration and remaining addresses](desktop/apps/philcore-desktop/production/candidate-public-config.json)

This release does not modify or redeploy contracts and performs no Mainnet transaction or additional mint. Browser passkeys unlock a separate Ethereum signing key; Web encrypted backups and Desktop backups are not interchangeable. Classical cryptography underlies the current authorization path. Post-quantum security and one-human uniqueness remain research goals.

## Historical releases and source tags

Build 96 remains immutable at `v0.3.0-build96` and `v0.3.0-build96-source`; `phil-final-blue-ui-2026-09-17` and `phil-story-opening-2026-09-17` retain their historical UI/content evidence. Build 95 remains a historical draft without a published installer. The old public `v0.3.0-build93` tag remains untouched and predates the current source-verification package.

Build 97 is identified by `v0.3.0-build97`, `v0.3.0-build97-source`, and `phil-remediation-live-2026-09-19`. Source licenses and third-party notices remain in each snapshot. Artwork and branding rights are described in [ASSET_RIGHTS.md](desktop/docs/reference/ASSET_RIGHTS.md).
