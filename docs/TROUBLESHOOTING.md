# Troubleshooting

[Back to download](../README.md)

| What you see | What to do |
|---|---|
| “Provider unavailable or rate-limited” | Wait, then refresh manually. The default public providers have shared limits. Do not fund or sign based on an expired quote. Restarting is usually unnecessary. |
| “Mainnet advanced during verification” | Refresh the review manually. Build 88 tolerates ordinary block advances, but genuinely stale or changed state can still stop a review. Preserve your selected Phil. Old-collection identities require a separate migration; do not blindly overwrite them. |
| Phil locked or logged out | Unlock with your Phil passphrase. Build 88 has no fixed 15-minute browsing timeout. Manual lock, Mac sleep/lock and quitting still end the session. Check your kept selection before continuing. |
| Nothing appears to happen after Mint | Look for the review or native Mac confirmation prompt. Check the progress message and **My minted Phil → Check pending submission** before doing anything again. |
| A transaction may have been submitted | Check the saved pending submission. Do not mint again or create a replacement identity as a retry. A failed transaction can still consume network fees. |
| Private mint window / ineligible | General minting opens September 17, 2026 at 03:45:35 UTC. Early access requires a separate approved-wallet registration. Ordinary users can wait for public access. |
| Funding has not appeared | Verify your sending transaction confirmed on Ethereum Mainnet and the destination equals your personal Genesis account. Refresh **Account & funding**. Do not send more simply because a provider read failed. |
| Name already taken | Reroll the name while keeping the artwork. Previewing does not reserve a name. |
| Artwork recipe unavailable | Your choice is not an on-chain reservation. Phil will stop rather than substitute different artwork. Choose another Phil only if you want to. |
| Mac says this version is incompatible | Confirm the Mac uses Apple Silicon. There is no Intel, Windows or Linux build. Earlier macOS versions are not yet physically qualified. |
| macOS blocks the download as damaged or unverified | Stop. Re-download from this repository and verify the checksum and publisher. Do not disable Gatekeeper, run quarantine-removal commands or use a repackaged installer. |
| An older Phil identity is already installed | Keep the old identity and verified backup. Build 88 has a new collection binding; Build 85–87 state requires preservation and a separately planned fresh-account setup. Do not delete Application Support or Keychain entries. |
| Backup verification fails | Keep the existing identity and backup intact. Check that you selected the intended file and entered its original passphrase. Do not create replacement state or fund until backup readiness is verified. |

When asking for help, share the app build, macOS version, Mac chip type and the exact non-secret error. Public transaction hashes can help if you are comfortable linking your activity. Never share passphrases, backups, private keys or identity storage. GitHub issues are public.
