# Build 97 remediation and release evidence

The September 18 audit confirmed two Medium client availability/state-machine defects, one Low client-hardening issue, and one informational public-reconstruction gap. Build 97 fixes all four without changing contracts or Mainnet state.

| Finding | Released result |
| --- | --- |
| WEB-001 | Monotonic signed/submission/submitted states, atomic retired archive, conservative provider/bundler reconciliation; ambiguous delivery remains held |
| DESKTOP-001 | Secure journal parser and transition model, exact acknowledgement, safe retirement proof and atomic archive rotation |
| ACCOUNT-001 | Complete deployed-account identity validation before rebuilding without `initCode` |
| WEB-002 | Desktop account wrapper included and hashed in the public Web reconstruction surface |

Qualification: **239 passed, 0 failed**. Web 64/64; Desktop 43/43; Genesis state/UI 52/52; contracts, authorization, integration and launch 22/22; Body2 40/40; account adversarial 12/12; renderer/codec 5/5; frozen Mainnet fork 1/1; verifier negatives 14/14.

The frozen Mainnet check used block 26008490, hash `0xba54e9a2bbc8ee368661aab74ffc0db184d4833f11a4fc58ebdc974654529f9e`. Six deployed runtime identities, total minted 3, maximum supply 369, and the published sample account bindings matched. Mutation was disabled.

App notarization submission `7c987b30-853e-4620-b172-5814cad08070` and DMG submission `39afc5c1-a5e1-4b12-86d6-10662bff24dd` were accepted. Mounted read-only package inventory matched the canonical app. DMG SHA-256 `488092e87ef343bbaf288211a6638e4217ab57906323e10a6df4010a8dd0fb77`.

The controlled build/test dependency set retains accepted Low build-host exposure under trusted inputs. Production dependency audit is zero and the shipped package scan found zero secrets, fixtures, private paths, or affected build/test packages. Unresolved Critical/High/Medium findings: **0**.
