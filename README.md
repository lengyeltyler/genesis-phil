# Phil Genesis

369 fully on-chain Phils on Ethereum Mainnet. Find a Phil, review the exact action, and approve it with your account's protected authority. Mint price is 0 ETH; Ethereum network fees apply. Each valid Genesis account can mint once. This is not a one-person or one-device limit.

- **[Launch Phil Web](https://phil.tylerlengyel.com)** — isolated browser application, with History, the complete 161-post Timeline, and the original Genesis Tutorial. **Ethereum Mainnet minting is open.** Create and verify your backup, check the balance/funding estimate, then review and approve your selected Phil. Wallet balance and ETH withdrawal controls are available.
- **[Download Desktop 0.3.0, Build 93](https://github.com/lengyeltyler/genesis-phil/releases/download/v0.3.0-build93/Phil-0.3.0-93-macOS-arm64.dmg)** — Apple Silicon macOS, Developer ID signed and notarized.
- [Desktop source and verification](desktop/README.md) · [Build](desktop/BUILDING.md) · [Verify the installer](desktop/VERIFYING.md)
- [Web source and exact release reconstruction](web/README.md)
- [Release manifest](release-manifest.json) · [Checksums](SHA256SUMS) · [Release status](release-status.json)

## Build 95

Build 95 source and verification material are public, but its installer release remains a draft after GitHub upload failures. Build 93 remains the available installer. This does not block the independent Web release.

Build 95 restores the Build-93 visual system while retaining Build 94's functional/security source. The only functional addition is the owner-requested session Rolls counter. No changes to identity, custody, Keychain, backup/restore, signing, account derivation, contract bindings, provider/bundler configuration, art generation, recipe binding, Wings, journals or ambiguous-submission handling. See the [exact five-file review](docs/BUILD95-CHANGES.md).

Engineering source: `e3911123f5d6f5b093f52ea08f60526238a8029e`, tree `e100b5198a185a3aec00774f17cb06f761ce6304`. The public export is a source subset plus verification tools, with every original file mapped by hash and Git blob; it has a different repository commit/tree. [Public source tag](https://github.com/lengyeltyler/genesis-phil/tree/v0.3.0-build95-source).

Installer SHA-256: `3c088ac24248ae3f7812ae8f3723282e6f536f80fedfede236164c96f7ebb4cf`.

Publisher: **Developer ID Application: Tyler Lengyel (B342738S82)**. Hardened Runtime, Apple notarization, stapling and Gatekeeper verified. Full source-to-package reconstruction and comparison passed, including Electron and the native helper. Credential-free self-build startup remains unqualified because of macOS Team-ID library validation; the official signed installer is the supported runnable application. No protection was disabled to make a local copy launch.

## Mainnet contracts

- Genesis NFT: [`0x9732f84c54407cd846b3e987594417bcfa30644e`](https://etherscan.io/address/0x9732f84c54407cd846b3e987594417bcfa30644e)
- Factory: [`0xa3c263c4a0d0dc07b6ea7a8414bd245d98d347f0`](https://etherscan.io/address/0xa3c263c4a0d0dc07b6ea7a8414bd245d98d347f0)
- [Exact configuration and remaining addresses](desktop/apps/philcore-desktop/production/candidate-public-config.json)

This release does not modify or redeploy contracts. Browser passkeys unlock a separate Ethereum signing key; Web encrypted backups and Desktop backups are not interchangeable. Classical cryptography underlies the current authorization path. Post-quantum security and one-human uniqueness are research goals, not current product guarantees.

## Historical releases and source tags

Build 93 and Build 94 artifacts remain unchanged. The historical public `v0.3.0-build93` tag points to commit `67b0b7c58943c5446019b34f173255b7dfa4846b`, also used by Build 88. Its source archive contains old download documentation, not the Build-93 application source. That tag has not been moved. Use the new Build-95 source tag and file maps for current verification.

The separate [P.C. repository](https://github.com/lengyeltyler/P.C.) is the historical controlled Sepolia beta, not this Genesis Mainnet Web release. Earlier Phil art and proof experiments remain historical projects.

Source licenses and third-party notices remain in each snapshot. Artwork/branding rights are described in [ASSET_RIGHTS.md](desktop/docs/reference/ASSET_RIGHTS.md).
