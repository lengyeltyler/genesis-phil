# Verify the official download

[Back to download](../README.md)

Download only from [this release](https://github.com/lengyeltyler/genesis-phil/releases/tag/v0.3.0-build86). The installer is **Phil-0.3.0-86-macOS-arm64.dmg**, not the automatic source-code archives.

- Version: **0.3.0, Build 86**
- Developer ID publisher: **Tyler Lengyel (B342738S82)**
- Bundle identifier: `com.philcore.desktop`
- Size: **132,160,450 bytes**
- SHA-256:

```text
c961b2067698343b867cb675573ee980ea56dd3ec4ee49599e88bb596a8f47f6
```

The app and DMG have passed Apple notarization, stapling and Gatekeeper assessment. These checks establish package identity and Apple acceptance; they do not establish completed Mainnet mint proof or support on every macOS version.

Optional checksum check in Terminal:

```sh
shasum -a 256 "$HOME/Downloads/Phil-0.3.0-86-macOS-arm64.dmg"
```

The output must match the digest above. A browser may append a number to duplicate downloads; choose the exact downloaded filename. Ordinary installation does not require Terminal. Never run commands that disable Gatekeeper or remove quarantine.

[Machine-readable release manifest](../release-manifest.json) · [Checksums](../SHA256SUMS.txt)

The release also provides exact Solidity standard JSON input and corresponding contract sources in **Phil-Genesis-contract-sources-build86.zip**, with compiler settings, deployment addresses and license notices. That optional archive is for inspection, not installation. The private engineering repository and its history are not part of this download repository.
