# Privacy and release limits

Phil is an Ethereum Mainnet application with real network fees. It is not a general-purpose wallet. Its protected Mac policy supports Phils minting, NFT transfer and ETH withdrawal, each with fresh Mac confirmation.

Default services include dRPC, PublicNode and the public Candide bundler. They can see IP addresses, requests and account activity, may share underlying infrastructure, and can be unavailable or rate-limited. Independent reads are required; disagreement stops the operation. Optional Alchemy/Infura credentials remain subject to those providers' quotas and billing.

Encrypted identity and protected authority material remain on the Mac. The backup contains both authority roles under the same passphrase; it is not independent-device or independent-secret recovery. Keep a verified backup and its passphrase separately. Phil cannot recover a lost passphrase or loss of both copies. Mac security still matters.

Ethereum transactions, account activity and minted token metadata are public. Generated previews stay local until used in an on-chain operation. Saved artwork preferences are separate from the identity backup. Each generated Phil pairs its artwork with a name; complete minted names are unique within this collection, but preview names can repeat and are not reserved.

One mint per Genesis account is permanent. Transfers and reserved grants do not reset eligibility. Mint price is zero, but network fees apply. Withdraw all reserves the maximum network fee and sends the remainder; a small gas refund may remain. No asset value is promised. ERC-2981 supplies 3.69% royalty information; marketplace payment is not guaranteed.

Build 93 preserves the Build 92 deployment and account binding. Build 91 and earlier collection bindings do not transfer. There is no fixed 15-minute browsing timeout, but Mac lock/sleep, manual lock and quitting still lock Phil. Fresh confirmation and short-lived, single-use signing grants remain required.

The owner selected Build 93 as final and confirmed the Mac mini mint, transfer and withdrawal. The separate MacBook Pro test remains pending. macOS 12 is the build target, not evidence of physical testing on every older OS. The current release supports Apple Silicon Macs only.
