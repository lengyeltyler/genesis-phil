# Verify the retained Build 95 package

**Build 95 installer is not publicly available.** Its upload failed. Public users can download and [verify Build 93](../docs/VERIFY-DOWNLOAD.md). The following Build-95 procedure applies only when the exact retained Build-95 DMG is already available; it cannot verify a Build-93 DMG against Build-95 source.

Follow [BUILDING.md](BUILDING.md) through dependency installation and Electron setup. Historical successful verification used the internal signed/notarized artifact. Source and verification material are public; this does not imply installer distribution.

## Canonical complete check

```sh
npm run verify:release -- --dmg "$HOME/Downloads/Phil-0.3.0-95-macOS-arm64.dmg"
npm run test:verifier
```

The first command checks source/lock/inventory bindings, reconstructs the catalog, seven contract artifacts, bundled JavaScript, static resources and native helper, and assembles a local application if absent. It mounts the supplied DMG read-only, compares the **entire** application inventory and source/upstream-derived package, checks all nested code plus outer publisher/team/entitlements, validates staples and Gatekeeper, then detaches it in a finally block. It never changes the supplied DMG or signs the official app. Outputs are local `.reconstructed/` evidence.

Required independent results:

- `PASS — DMG identity`
- `PASS — reproducible source-derived contents`
- `PASS — complete source-to-package comparison (including upstream Electron and native helper)`
- `PASS — publisher/signature identity`
- `PASS — Apple notarization`

The result JSON lists every permitted signing difference. Missing files, unexplained extras, changed executable content, symlink targets, modes or resources fail. A missing toolchain or unavailable Apple check is a failure, never a partial PASS. The tool stops if an existing Git checkout is dirty or an available source tag resolves to another HEAD. For source archives without Git, the frozen per-file manifest is used; match the archive checksum to the public release independently.

## Individual Apple and download checks

These checks alone do not establish source correspondence:

```sh
shasum -a 256 "$HOME/Downloads/Phil-0.3.0-95-macOS-arm64.dmg"
codesign --verify --strict "$HOME/Downloads/Phil-0.3.0-95-macOS-arm64.dmg"
xcrun stapler validate "$HOME/Downloads/Phil-0.3.0-95-macOS-arm64.dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$HOME/Downloads/Phil-0.3.0-95-macOS-arm64.dmg"
```

Expected DMG SHA-256:

`3c088ac24248ae3f7812ae8f3723282e6f536f80fedfede236164c96f7ebb4cf`

Mount the DMG normally without launching the app, then use its mounted application path:

```sh
codesign --verify --deep --strict --verbose=2 "/Volumes/Phil 0.3.0 (95)/Phil.app"
codesign -d --verbose=4 "/Volumes/Phil 0.3.0 (95)/Phil.app"
codesign -d --entitlements :- "/Volumes/Phil 0.3.0 (95)/Phil.app"
xcrun stapler validate "/Volumes/Phil 0.3.0 (95)/Phil.app"
spctl --assess --type execute --verbose=2 "/Volumes/Phil 0.3.0 (95)/Phil.app"
```

Use the actual mount name if macOS appends a suffix. Expected authority: **Developer ID Application: Tyler Lengyel (B342738S82)**; TeamIdentifier **B342738S82**; bundle identifier **com.philcore.desktop**; Hardened Runtime enabled. The canonical verifier checks exact expected entitlements, not merely a textual claim of signing.

A matching hash identifies the exact retained artifact; a signature identifies its signer and sealed contents; notarization records Apple's acceptance. None alone proves source correspondence, absence of vulnerabilities or safety of a compromised operating system. The reconstruction/comparison supplies the separate source-to-package evidence, subject to the upstream toolchain trust explained in [REPRODUCIBILITY.md](REPRODUCIBILITY.md).
