# Build Phils 0.3.0 (95), build97-remediation

## Requirements

An Apple Silicon Mac; Node **26.0.0**, npm **11.12.1**, Python **3.9.6** (qualified version; standard library only), and Apple's command-line developer tools. Use the pinned Node distribution from nodejs.org and verify its official checksums. No owner signing certificate or Apple developer membership is needed for source reconstruction and local ad-hoc assembly.

The exact helper was compiled with Apple Swift **6.4**, `swiftlang-6.4.0.34.1`, `clang-2100.3.34.1`, SDK **27.0**, linker **27037.1**, targeting **arm64-apple-macos12.0**. The qualification uses Command Line Tools, not a required full Xcode installation. Apple toolchain availability and licensing remain Apple's responsibility. An arbitrary newer/older Xcode is not asserted equivalent: verification must fail if its normalized helper differs. The runtime deployment target is macOS 12.0; that does not mean this exact build toolchain runs on macOS 12.

Locked npm dependencies: Electron **41.10.3**, esbuild **0.25.12**, TypeScript **5.9.3**, ethers **6.17.0**, @noble/curves **1.2.0**, solc **0.8.27+commit.40a35a09.Emscripten.clang**. `package-lock.json` supplies transitive resolutions and registry integrity hashes. Python is recorded as tested, not enforced as a universal exact-output requirement.

## Clone and check the public snapshot

For the published source snapshot:

```sh
git clone --branch v0.3.0-build97-source --single-branch https://github.com/lengyeltyler/genesis-phil.git phils-build97-source
cd phils-build97-source/desktop
git rev-parse HEAD
git rev-parse HEAD^{tree}
git status --porcelain
node --version
npm --version
python3 --version
xcrun swiftc --version
xcrun --show-sdk-version
```

Match the public snapshot commit/tree to the separately published source-identity record. The original application source HEAD is recorded separately; the public export is a subset plus verification tooling, not the original whole Git tree.

## Install and reconstruct

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run setup:electron
npm run reconstruct
npm run build:local
```

Install scripts are disabled. The explicit Electron setup downloads only the official pinned arm64 ZIP and requires its recorded SHA-256 before extraction. No globally installed npm packages or privately prepared node_modules are required. A fresh checkout has no shared dependency symlinks. Reconstruction is offline after setup; Apple verification later may contact Apple.

Output is `.local-build/Phil.app`; deterministic reconstruction evidence is `.reconstructed/result.json`. Source files, lock and manifests are verified first. The Body2 compiler regenerates its derived catalog/report and commitment; outputs must match the frozen source/input bindings. Seven contract artifacts are reconstructed from the exact complete compiler inputs. No Hardhat cache or pre-existing ignored artifact directory is required.

Assembly does not call the historical owner-only `phil:build`/`phil:release` commands. It reuses the original production bundler, unchanged production resources and exact configuration; it does not require any special disk name or volume UUID. Deployment proposal credentials are unnecessary because the full frozen public configuration and complete compiler inputs are provided.

## Local ad-hoc assembly and startup limitation

Ad-hoc assembly is available without a private certificate:

```sh
npm run build:local -- --ad-hoc
```

For an app already assembled:

```sh
node -e "require('./genesis/release/public-source/build-local.cjs').adHoc(require('node:path').resolve('.local-build/Phil.app'))"
```

Ad-hoc signing uses `codesign --sign -` with Hardened Runtime and only Electron's JIT entitlement on application bundles. It updates the helper's exact local hash before sealing the outer app. Strict signature validation and source/package comparison pass for this local form. It does not confer the official publisher identity or notarization.

**Local startup is not qualified.** The isolated startup attempt was rejected by macOS's dynamic loader: the ad-hoc executable and Electron Framework do not have a trusted Team ID for Hardened Runtime library validation. Therefore this workflow currently supports reconstruction, assembly and comparison, **not a credential-free runnable production app**. Do not interpret successful `codesign --verify` as proof that macOS will launch it. This is an unresolved requirement of the proposed verification workflow, not a defect or mismatch in the signed distributed Build 97.

We have not disabled library validation, Hardened Runtime, Gatekeeper, quarantine, sandboxing or any product authentication/custody protection. We have not substituted a development entry point or changed `app.isPackaged` checks. The official signed app remains the supported runnable application. A future local-startup solution needs separate qualification while preserving those protections; neither an owner's certificate nor an unqualified alternative signer is part of this package.

Use a **separate macOS user account with fresh Phil state** for any future self-build startup qualification. The unchanged product uses `com.philcore.desktop` and its fixed production storage namespace. Do not overwrite an installed production app or mix its Keychain/identity records with a locally signed copy. No identity was created during the attempted startup, and owner state was denied by an OS-level filesystem sandbox.

To repeat assembly, use another fresh checkout; existing `.local-build/Phil.app` is deliberately not overwritten. No command here authorizes an on-chain transaction.
