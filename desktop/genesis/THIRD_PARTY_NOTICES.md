# Genesis source and dependency notices

Phil-owned new code follows the repository MIT license except the account/factory sources that declare GPL-3.0 and link the account-abstraction core. Preserve each source's SPDX header. The ERC-4337 package's npm metadata says MIT, but its BaseAccount and EntryPoint source headers are GPL-3.0; do not replace those source-level terms with the package label. Full GPL text is retained in `LICENSES/Account-Abstraction-GPL-3.0.txt` and `LICENSES/GPL-3.0-only.txt` in the review package.

Dependencies verified from the installed package manifests:

| Dependency | Version | Role |
|---|---:|---|
| @account-abstraction/contracts | 0.7.0 | Account core/interfaces and EntryPoint test/dependency code; source-level GPL terms apply where declared |
| @openzeppelin/contracts | 5.6.1 | ERC-721, ECDSA and hashing utilities; MIT |
| ethers | 6.17.0 | ABI, hashing and local chain interaction; MIT |
| @noble/curves | 1.2.0 | P-256 verification and synthetic test signatures; MIT |
| hardhat | 2.28.4 | Local development EVM; MIT |
| @nomicfoundation/hardhat-ethers | 3.0.8 | Local test integration; MIT |
| solc | 0.8.27 | Solidity compilation; package metadata MIT; compiler distribution retains upstream notices |

The review package installs these development dependencies separately; it does not bundle their installed binaries or silently relicense them. The production builder inventories every bundled JavaScript dependency with its exact version and license text, and includes the Electron MIT license and Chromium notices. The exact package audit and artifact record remain separate distribution gates.

The 503 Philenator SVG assets retain their separate owner/source provenance in the copied `SOURCE.json`, source manifest and `docs/reference/ASSET_RIGHTS.md`. The source-code MIT license does not itself grant unspecified rights in artwork or branding. No samplePhil contract, royalty system or marketplace implementation was copied. An unused exploratory Solady Base64 copy was removed; it is not a candidate dependency.

The final Genesis representation contains 896 owner-approved traits: 652 original final-source derivatives plus 244 named color variants. Its full master hash, canonical per-trait hashes, outline provenance and named-variant derivation records are supplied in the final public-source package; these supersede the earlier 503-asset count for final-art reconstruction. Art and branding retain their separate rights status.
