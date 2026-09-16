# Verify the official download

[Back to download](../README.md)

Download only from [this release](https://github.com/lengyeltyler/genesis-phil/releases/tag/v0.3.0-build87). The installer is **Phil-0.3.0-87-macOS-arm64.dmg**, not the automatic source-code archives.

- Version: **0.3.0, Build 87**
- Developer ID publisher: **Tyler Lengyel (B342738S82)**
- Bundle identifier: `com.philcore.desktop`
- Size: **132,174,771 bytes**
- SHA-256:

```text
644fc147d1b04646060c5b94054b1a742a418ddffb6e5e6ed472a4ba252e67f5
```

The app and DMG have passed Apple notarization, stapling and Gatekeeper assessment. These checks establish package identity and Apple acceptance; they do not establish completed Mainnet mint proof or support on every macOS version.

Optional checksum check in Terminal:

```sh
shasum -a 256 "$HOME/Downloads/Phil-0.3.0-87-macOS-arm64.dmg"
```

The output must match the digest above. A browser may append a number to duplicate downloads; choose the exact downloaded filename. Ordinary installation does not require Terminal. Never run commands that disable Gatekeeper or remove quarantine.

[Machine-readable release manifest](../release-manifest.json) · [Checksums](../SHA256SUMS.txt)

The release also provides exact Solidity standard JSON input and corresponding contract sources in **Phil-Genesis-contract-sources-build86.zip**, with compiler settings, deployment addresses and license notices. That optional archive is for inspection, not installation. The private engineering repository and its history are not part of this download repository.

Build 87 reuses the exact Build 86 contract-source archive because the deployed contracts, artwork and configuration are unchanged. The Desktop changes fix verification across ordinary block advances and remove the fixed browsing timeout.
