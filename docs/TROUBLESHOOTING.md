# Troubleshooting — Build 93

[Back to download](../README.md)

| What you see | What to do |
|---|---|
| Provider unavailable or rate-limited | Wait, then refresh manually. Public providers have shared limits. Restarting is usually unnecessary. |
| Mainnet advanced during verification | Refresh the review. Ordinary block advances are tolerated, but stale or changed state can still stop a review. Your selected Phil remains saved. |
| Phil locked | Unlock with your Phil passphrase. There is no fixed 15-minute browsing timeout; manual lock, Mac sleep/lock and quitting still end the session. |
| Nothing appears to happen after Mint | Look for the review or native Mac prompt and check progress. Use **My minted Phil → Check pending submission** before trying again. |
| A transaction may have been submitted | Reconcile the pending attempt. Do not submit again or create another identity as a retry. Failed transactions can still cost gas. |
| Private mint window / ineligible | Public access opens September 16, 2026 at 9:36 PM Denver (September 17, 03:36 UTC). Before then, approved-wallet registration is required. After opening, supply and the lifetime mint limit still apply. |
| Funding has not appeared | Confirm the sending transaction succeeded on Ethereum Mainnet and the destination is your personal Genesis account. Refresh the account balance. A failed provider read is not a reason to send more. |
| Name or artwork already taken | Previews do not reserve either. The artwork and generated name stay paired; there is no separate name reroll. Choose another Phil only if you want to. |
| I cannot go back through a batch | Roll 10 and Roll 100 intentionally keep only the final result. Intermediate rolls cannot be recovered. Single rerolls have an undo option. |
| Withdraw asks for an amount | In Build 93, select **Withdraw all — gas deducted automatically** and enter the recipient. Custom amounts are optional and accept normal decimals. |
| A little ETH remains after Withdraw all | The app reserves the maximum fee; unused gas can be refunded after execution. Another withdrawal has its own fee and may not be worthwhile for a tiny remainder. |
| This Mac is incompatible | Use an Apple Silicon Mac with macOS 12 or later. There is no Intel, Windows, Linux, mobile or browser minting release. Earlier macOS versions have not all been physically tested. |
| macOS blocks the installer | Re-download from the official release and check its checksum and publisher. Do not disable Gatekeeper or remove quarantine. |
| Updating from Build 92 | Quit Phil and replace the app. Keep the existing identity and verified backup. |
| An identity from Build 91 or earlier is installed | Preserve its app, complete state and backup. It belongs to another collection and needs a separately planned fresh setup. Do not delete Application Support or Keychain entries. |
| Backup verification fails | Keep the existing identity and backup. Check the chosen file and original passphrase; do not fund until backup readiness is verified. |

When asking for help, share the app build, macOS version, chip type and exact non-secret error. Public transaction hashes may help if you are comfortable linking your activity. Never share passphrases, backups, private keys or identity storage. GitHub issues are public.
