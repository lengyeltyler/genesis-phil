# Genesis Web completion scope

Canonical visual reference: Desktop Build 93, engineering commit `c559066f4a98859c1b940a2761e8524914ac6f8e`. Web retains its exact stylesheet prefix and logo bytes; browser layout rules only accommodate navigation, responsive display and browser custody controls.

| Genesis flow | Web parity |
| --- | --- |
| Logo, colors, type, panels, artwork hierarchy | Build-93 assets and CSS retained |
| Account, address, copy and QR | Same derived Genesis account; address copy and independent balance added |
| Backup state | Existing encrypted export, verify and fresh-browser restore retained |
| Reroll, Roll 10, Roll 100, Keep, Undo, expand and traits | Existing shared generation and selection unchanged |
| Rolls | Existing owner-approved session generated-Phil count retained; load/undo adds none. Build 93 had batch progress but no cumulative counter |
| Wallet and EntryPoint balances | Imports the existing Desktop independent balance reader directly; refresh does not depend on bundler or mint eligibility |
| Funding | Read-only inline mint gas estimate, availability/shortfall and 30-second expiry; review performs fresh checks |
| Mint review and approval | Same shared MINT_PHIL construction, exact recipe/name/account/fees; existing passkey and once-only submission |
| Pending and confirmed state | Existing durable journal and reconciliation; confirmed transaction link added |
| Ownership and transfer | Existing two-provider ownership and transfer retained |
| ETH withdrawal | Build 93 supports it. Web now uses the existing shared padded-fee custom/max withdrawal preparation, authorization, state checks and exact receipt reconciliation, before or after account deployment |
| History and Tutorial | Existing content and video unchanged |

Platform differences remain intentional: browser WebAuthn PRF wrapping instead of Mac-protected storage; browser backup format remains distinct; no native Mac credential/provider-key storage is exposed to a web page. Web uses the same existing default dRPC/PublicNode/Candide providers with its restricted CSP. No new custody architecture, generic calldata path, contracts, analytics or admission system is introduced.

The execution layer checks the release-bound launch policy before passkey approval and again before submission. Initial deployment was closed and a designated funded, backup-verified account was prepared for acceptance. The owner subsequently waived an additional mint. The current gate is public on the same artifact; no new acceptance transaction was submitted. This supersedes the original acceptance plan without claiming receipt-based proof for this exact release. [Current release identity](../../LIVE-RELEASE.json).
