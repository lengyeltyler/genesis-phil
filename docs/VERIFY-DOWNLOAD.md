# Verify the official Build 97 download

[Back to download](../README.md)

Download **Phil-0.3.0-97-macOS-arm64.dmg** from the [Build 97 release](https://github.com/lengyeltyler/genesis-phil/releases/tag/v0.3.0-build97), not the automatic source-code archives.

- Version: **0.3.0, Build 97**
- Publisher: **Tyler Lengyel (B342738S82)**
- Bundle identifier: `com.philcore.desktop`
- Size: **132,732,714 bytes**
- SHA-256: `488092e87ef343bbaf288211a6638e4217ab57906323e10a6df4010a8dd0fb77`

The app and DMG passed Apple notarization, stapling, recursive signature verification and Gatekeeper. Never disable Gatekeeper or remove quarantine.

Optional Terminal check:

```sh
shasum -a 256 "$HOME/Downloads/Phil-0.3.0-97-macOS-arm64.dmg"
```

Use [Desktop source verification](../desktop/VERIFYING.md) for the complete source-to-package comparison. `v0.3.0-build97-source` contains the exact current public snapshot. Historical tags remain untouched.
