# Verify the official download

[Back to download](../README.md)

Use the [Build 93 release](https://github.com/lengyeltyler/genesis-phil/releases/tag/v0.3.0-build93). Download **Phil-0.3.0-93-macOS-arm64.dmg**, not the automatic source-code archives.

- Version: **0.3.0, Build 93**
- Developer ID publisher: **Tyler Lengyel (B342738S82)**
- Bundle identifier: `com.philcore.desktop`
- Size: **132,867,684 bytes**
- SHA-256:

```text
fd6307fceb1259eeded60f80fe4e5e2d9f4925eca26efab1b82d433221b582b7
```

The app and DMG passed Apple notarization, stapling and Gatekeeper assessment. These establish package identity and Apple acceptance, not support on every macOS version.

Optional Terminal check:

```sh
shasum -a 256 "$HOME/Downloads/Phil-0.3.0-93-macOS-arm64.dmg"
```

The digest must match. Ordinary installation does not require Terminal. Never disable Gatekeeper or remove quarantine.

[Build-time release manifest](../release-manifest.json) · [Checksums](../SHA256SUMS.txt) · [Current release status](../release-status.json)

This is the owner-authorized branding revision of Build 93, with the new Phil icon. Version 0.3.0 and build number 93 are unchanged, but the installer has been re-signed and notarized and has a new checksum. The preceding installer digest is recorded in the manifest. Contracts, account configuration, artwork and execution code are unchanged. Existing Build 92/93 users can quit Phil and replace the app while preserving their identity and backup.

[Verified contract sources](CONTRACTS.md) are available through Etherscan and Sourcify. The historical Build-93 release tag's automatic source archive contains old download documentation, not its engineering checkout. Current `main` also contains the Build-95 source/input export and the exact live Web source, with their separately recorded identities.
