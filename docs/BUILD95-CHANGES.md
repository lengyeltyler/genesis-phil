# Desktop Build 94 → Build 95 exact change review

Publication status: Build-95 source and verification inputs are public; the signed/notarized installer remains unpublished after upload failures. Build 93 remains the public download. [Archived Build-95 artifact evidence](historical-build95-release-manifest.json) retains its originally intended installer URL as provenance only.

Baseline HEAD `00f1d574799191e3d4dd0ec8ab0de5e3a1586b64`, tree `93f3e005b460a7811b61b87a46f68c81c858e230`.
Build 95 HEAD `e3911123f5d6f5b093f52ea08f60526238a8029e`, tree `e100b5198a185a3aec00774f17cb06f761ce6304`.

All paths below are under `apps/philcore-desktop/production/`.

| File | Classification | Exact change |
|---|---|---|
| `main.cjs` | VISUAL ONLY | BrowserWindow background `#17191c` → `#08080b`; no security-option changes. |
| `release-version.json` | RELEASE/PACKAGING ONLY | Build 94 → 95; version remains 0.3.0. |
| `ui/app.js` | FUNCTIONAL | Session Rolls counter: one per generated Phil, including batch events; undo/load add none. Removing exactly these three insertions reproduces Build 94 byte-for-byte. |
| `ui/index.html` | VISUAL ONLY | Accessible Rolls text. Removing this element reproduces Build 94 byte-for-byte. |
| `ui/style.css` | VISUAL ONLY | Exact Build-93 stylesheet restored. |

**EXPECTED CHANGES:** the five changes above. Canonical logo remains present and unchanged. Build-93 style/layout/color system restored; session Rolls shown.

**UNEXPECTED CHANGES:** none. No SECURITY-SENSITIVE or CONFIGURATION files changed. All other repository source is byte-identical to the accepted Build 94 baseline, covering identity creation, custody, safeStorage/Keychain, backup, restore/rebind, validator/signing, MINT_PHIL, TRANSFER_PHIL, account derivation, factory/NFT/EntryPoint bindings, RPC/bundler, one-mint rule, artwork/recipe/Wings, journal and submission ambiguity.

Package review: signed/notarized Build 95 independently reconstructed from this public source/input export; full package comparison, publisher identity and notarization checks passed. Fourteen verifier negative/positive tests passed. No broad qualification or new Desktop transaction was performed. The owner's installed application was not replaced.

Historical installer SHA-256:

- Build 93: `fd6307fceb1259eeded60f80fe4e5e2d9f4925eca26efab1b82d433221b582b7`
- Build 94: `0e5bf9c5780aedd9bbe61f07fd21c0f227fc9877e620461a449cb171566de3d1`
- Build 95: `3c088ac24248ae3f7812ae8f3723282e6f536f80fedfede236164c96f7ebb4cf`
