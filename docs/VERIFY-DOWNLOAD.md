# Verify the official download

[Back to download](../README.md)

Use the [Build 96 release](https://github.com/lengyeltyler/genesis-phil/releases/tag/v0.3.0-build96). Download **Phil-0.3.0-96-macOS-arm64.dmg**, not the automatic source-code archives.

- Version: **0.3.0, Build 96**
- Developer ID publisher: **Tyler Lengyel (B342738S82)**
- Bundle identifier: `com.philcore.desktop`
- Size: **132,867,632 bytes**
- SHA-256:

```text
9575bd6696f9c15f56ecd3e49511564068b78c0d4aa36e3c74422f3e8401f908
```

The app and DMG passed Apple notarization, stapling and Gatekeeper assessment. These establish package identity and Apple acceptance, not support on every macOS version.

Optional Terminal check:

```sh
shasum -a 256 "$HOME/Downloads/Phil-0.3.0-96-macOS-arm64.dmg"
```

The digest must match. Ordinary installation does not require Terminal. Never disable Gatekeeper or remove quarantine.

[Build-time release manifest](../release-manifest.json) · [Checksums](../SHA256SUMS.txt) · [Current release status](../release-status.json)

Build 96 changes only the Desktop accent stylesheet and release number from Build 95. The canonical logo, account storage, contracts, artwork and execution remain unchanged. Existing Build 92–95 users can quit Phil and replace the application while retaining their identity and verified backup.

Use [Desktop source verification](../desktop/VERIFYING.md) for a complete reconstruction and package comparison. The new `v0.3.0-build96-source` tag contains the exact current source snapshot. Historical tags remain untouched.
