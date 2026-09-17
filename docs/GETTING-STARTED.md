# Install and mint with Phil — Build 96

[Back to download](../README.md)

Use an Apple Silicon Mac. Build 96 targets macOS 12 or later; physical testing on every older macOS version has not been completed. The Desktop installer targets Apple Silicon macOS. The separate browser application is available at [Phil Web](https://phil.tylerlengyel.com); its passkey and backup flows differ from Desktop.

## Install or update

1. Download [Phil-0.3.0-96-macOS-arm64.dmg](https://github.com/lengyeltyler/genesis-phil/releases/download/v0.3.0-build96/Phil-0.3.0-96-macOS-arm64.dmg).
2. Open the DMG, drag **Phil** into **Applications**, and open it from Applications. Do not bypass Gatekeeper. [Verify the download](VERIFY-DOWNLOAD.md) if needed.
3. Build 92–95 users can quit Phil and replace the application while retaining the same identity and verified backup. Build 91 and earlier identities belong to different collections: preserve their app, complete state and backups before a separately planned fresh setup. Do not overwrite identity storage to force an upgrade.

## Create your account

1. Create an identity with a strong passphrase meeting the app's displayed requirements. Choose **Protected Mac — Genesis actions only**. A phone-required identity cannot use this policy as a substitute for phone approval.
2. In **Recovery & backup**, save an encrypted backup to a new filename and approve the Mac confirmation. Open and verify the saved backup with its original passphrase. Funding requires verified backup readiness. Keep the backup and passphrase separately.
3. Open **Account & funding** to see your personal Genesis address and balance. Preparing the address is free; the account is deployed with your first mint.
4. Refresh the fee and funding estimate. Mint price is **0 ETH**, but Ethereum fees apply. Copy your own account address and send the displayed shortfall in ETH on **Ethereum Mainnet only**. Wait for confirmation and refresh the balance. Do not copy a funding amount from someone else's transaction.

Default public providers and the bundler are configured automatically; no developer account is needed. Public services can be rate-limited or unavailable. Optional advanced provider credentials may have separate quotas or charges.

Public minting opens September 16, 2026 at **9:36 PM America/Denver** (September 17 at 03:36 UTC). Early access before that time requires separate registration by an approved early wallet. After opening, ordinary minting does not require project registration while general allocation remains available. Do not fund for a mint when the app reports you are ineligible.

## Choose and mint

1. In **Discover**, use **Reroll** for one new Phil or **Roll 10 / Roll 100** for a batch. Rerolling is local and free. Artwork and the generated `Phil-…` name stay together; there is no separate name reroll.
2. A single reroll can be undone. A batch keeps only the last Phil; intermediate results cannot be recovered. The arrows on the artwork enlarge the image.
3. Choose **Keep this Phil** to protect the selection. It stays saved through locking and reopening. Saved choices are not part of the encrypted identity backup and do not reserve artwork or names on chain.
4. Choose **Mint this Phil**. Review the exact artwork, name, network, collection, recipient and maximum network fee. Refresh an expired estimate. If the name or artwork is unavailable, the app stops rather than substituting another choice.
5. Approve the protected Mac confirmation. Cancellation denies the operation. Follow progress through approval, submission and Ethereum confirmation. If submission is uncertain, use **My minted Phil → Check pending submission**; do not submit again blindly.
6. Verify ownership and artwork in **My minted Phil**. Use **Download PNG** to save a profile-picture copy. Tokens are numbered **#0–#368**. Complete minted names are unique; previews can repeat.

There are 336 general and 33 reserved slots. Early mints consume general slots. The deployer can grant an individual reserved mint after public opening. One mint per account is permanent, including after transfer. A reserved grant does not override that limit.

## Transfer and withdraw

- **Transfer Phil:** enter the intended Ethereum recipient, review it and the fee, then approve fresh Mac confirmation. A receiving contract must support ERC-721 receipt. Refresh ownership after confirmation.
- **Withdraw ETH:** enter your recipient and keep **Withdraw all — gas deducted automatically** selected. The app calculates the withdrawable amount after reserving the maximum network fee. Review and approve on the Mac. A small unused gas refund may remain. Optional custom amounts accept `.001` or `0.001`; you do not need to enter 18 decimal places.
- Each operation has its own fee. Wait for confirmation and check pending attempts before trying again.

## MacBook Pro test

Create a **distinct identity/account** on the MacBook for a second mint. Restoring the already-minted Mini account restores that same account and does not permit another mint. Save and verify the new backup, check eligibility, fund from the current estimate, mint, inspect the PNG, transfer, then test withdrawal. The Mac mini mint, transfer and withdrawal have been owner-confirmed; this separate MacBook test remains pending.

Phil has no fixed 15-minute browsing timeout. Manual lock, Mac sleep/lock and quitting end the session. Unlock to continue; your kept choice remains saved. Every transaction still needs fresh protected Mac confirmation.

No Terminal, Xcode, Node or Git is required for normal use. See [troubleshooting](TROUBLESHOOTING.md) and [privacy and limitations](PRIVACY-AND-LIMITATIONS.md).
