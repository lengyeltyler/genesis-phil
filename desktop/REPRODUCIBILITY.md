# Reproducibility and trust model

This package does **not** claim that the final notarized DMG is byte-for-byte reproducible.

The model is:

public immutable snapshot → locked dependencies → deterministic/source-derived reconstruction → complete package comparison → independent Developer ID validation → notarization/stapling/Gatekeeper → frozen DMG hash.

## Exact comparisons

- Original application source exports retain the engineering commit's exact bytes and Git blob IDs. Verification-tooling files are separately identified by the tooling commit.
- Complete Solidity standard inputs and compiler version/settings reproduce creation/runtime templates for seven artifacts. Full inputs retain some historical unused source context required for their exact optimizer layout. The verifier checks each selected artifact's AST-resolved transitive source closure against the current exported source, while compiling the entire retained input. Unused context is not silently substituted.
- The current incremental Body2 compiler consumes the pinned accepted PG06 base catalog, base manifest, approved SVG-derived geometry and all 896 canonical traits. It checks 857 unchanged traits and reconstructs all traits in both forms. The base catalog is an explicit, hashed historical build input, not an undocumented local cache. This workflow does not repeat artwork qualification or reconstruct the owner's historical editor sessions.
- Current catalog, catalog manifest, bundled main and legal notices, preload, all UI/PNG files, icon, configuration, licenses, package metadata and plists must match.
- Every packaged file/link is inventoried; directories and POSIX modes are also recorded. No arbitrary added path or entire executable may be ignored.

## Native helper normalization: macho-signature-layout-v1

Compile the unchanged Swift source with the documented toolchain and flags. For both the local helper and official executable:

1. Require a thin 64-bit little-endian Mach-O with structurally valid load commands.
2. Require exactly one final `LC_CODE_SIGNATURE` payload and a consistent `__LINKEDIT` segment.
3. Exclude only the final signature blob.
4. Zero `LC_CODE_SIGNATURE.dataoff/datasize`, `__LINKEDIT.vmsize`, and `__LINKEDIT.filesize`, whose values reflect signature allocation.
5. Compare every remaining byte exactly.

The UUID, instructions, constants, symbols, string table, paths, SDK/linker commands and every other load command are **not** normalized. The helper's independently recompiled unsigned/ad-hoc form matched the official form with only these signature-related differences. A toolchain producing other differences fails; do not relabel those differences nondeterministic to obtain a PASS.

The same narrowly bounded comparison applies to re-signed upstream Electron Mach-O files. The official files must also match their full signed hashes and pass strict signatures. The source-built `release.json` must match except `helperSHA256`, which must equal the exact corresponding local helper; the official field must equal its exact signed helper. Neither value is ignored without validation.

## Apple packaging differences

`_CodeSignature` resources, `Contents/embedded.provisionprofile`, and the stapled notarization ticket at `Contents/CodeResources` have exact official inventory hashes and are validated through the signed app. They are not expected in the same form in a self-built/ad-hoc app. Developer ID CMS signatures, secure timestamps, Apple provisioning/signature resources and stapled notarization tickets cannot be recreated by a stranger with the owner's identity. DMG filesystem layout, timestamps, ordering, compression/container metadata and its signature/ticket are checked through the frozen whole-DMG hash rather than reproduced.

Filesystem creation/access times and extended attributes are not part of the content inventory. Native/app signatures and Gatekeeper are checked separately. The inventory covers the complete bundle namespace and modes, including directories; it is not just a list of source files.

## Inventory algorithm

`package-inventory.json` is a lexically sorted, depth-first walk using `lstat`, relative POSIX paths, and modes `st_mode & 0777`. Directory entries record type and mode. Regular files record type, mode, size and SHA-256. Symlinks record type, mode and their literal target, without following them during traversal. Resolution must remain inside the app and the link must match the expected target. Other file types are rejected. Root-directory metadata is excluded. The manifest hashes the exact UTF-8 inventory JSON bytes (two-space indentation, trailing LF); verification also compares the parsed records. The older internal 311 file/link entries are preserved in scope; explicit directory entries increase the total.

## Electron and dependency trust

Electron **41.10.3** is the official upstream darwin-arm64 distribution, not a local rebuild of Chromium, V8 or Electron. `setup:electron` verifies the exact ZIP SHA-256 pinned from upstream SHASUMS256; the lock pins the npm wrapper and the remaining dependency graph. Complete package comparison verifies the resulting Electron files against the released app, allowing only the same signing transformations and the explicit Phil plist/executable-name customization.

Remaining trust includes the public Git/release identity used to obtain this verifier, npm/SRI dependency inputs, Node/esbuild/solc/Python, Apple Swift/SDK/linker, upstream Electron, and the local OS/hardware. Publishing a verifier does not remove compiler supply-chain trust or constitute a formal third-party audit. Source archives and manifests should be obtained via the new immutable tag and independently published archive hashes.
