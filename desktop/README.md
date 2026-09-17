# Phils Build 95 — source and signed-artifact verification

**Installer status: unpublished.** The signed/notarized Build-95 artifact exists internally and its source/verification material is public, but the installer upload failed. [Build 93 is the available public installer](../docs/VERIFY-DOWNLOAD.md). A hash or successful internal package comparison is not a public download.

This source/input snapshot verifies **Phils 0.3.0, Build 95, package revision build93-visual-restoration**. It does not replace the released application, change contracts, or reset accounts.

- [BUILDING.md](BUILDING.md): locked dependencies, reconstruction, local assembly, ad-hoc signing and the unresolved local-startup limitation.
- [VERIFYING.md](VERIFYING.md): one-command comparison against the official DMG and Apple checks.
- [REPRODUCIBILITY.md](REPRODUCIBILITY.md): exact comparisons, narrow signing normalization and remaining upstream trust.
- [verification-manifest.json](verification-manifest.json): release, input, toolchain and inventory bindings.
- [ORIGINAL-SOURCE-MAP.json](ORIGINAL-SOURCE-MAP.json): every exported original file's SHA-256 and original Git blob ID.

## Immutable identities

Application engineering source: `e3911123f5d6f5b093f52ea08f60526238a8029e`, tree `e100b5198a185a3aec00774f17cb06f761ce6304`.

The original immutable application-source snapshot is tagged `v0.3.0-build95-source`. This documentation/metadata edition is tagged `phil-web-mainnet-live-2026-09-17`; Desktop application bytes and original source-map bindings are unchanged. Its new public snapshot commit is distinct from the original engineering commit because private history and unrelated files are intentionally excluded. Verification-tooling changes do not change product source. The public tag/commit, source-file manifest and original-file map identify the export precisely; this is not a claim that the subset has the original whole-repository tree ID.

The older public `v0.3.0-build93` tag remains historical: it points to a download-repository commit with Build 88 documentation. The new source tag transparently supersedes it for source verification. Do not use the old tag's source archive as Desktop source. Historical Build 93 and Build 94 DMGs remain unchanged.

DMG SHA-256: `3c088ac24248ae3f7812ae8f3723282e6f536f80fedfede236164c96f7ebb4cf`.

Configuration SHA-256: `ff96af7b927ec2520cc3288e819ba260fc89a4cb68a4cb2fe269e048056ccff7`.

Publisher: **Developer ID Application: Tyler Lengyel (B342738S82)**.

Source licenses, source SPDX headers, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `genesis/THIRD_PARTY_NOTICES.md`, `LICENSES/` and `docs/reference/ASSET_RIGHTS.md` retain their meanings. Publishing reconstruction inputs does not grant unspecified artwork/branding rights. Build tooling is MIT licensed; embedded third-party sources retain their own licenses.

This package is a verification workflow, not a security audit or guarantee against malicious toolchains. No owner credentials, RPC keys, private state or deployment journals are required. It performs no mint, transfer, withdrawal or deployment.
