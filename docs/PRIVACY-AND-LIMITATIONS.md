# Privacy and release limits

Phil is an experimental Ethereum Mainnet application. It is not a general-purpose wallet. The Desktop policy exposes Genesis mint and NFT transfer, with a fresh protected Mac confirmation for each operation. It has no general ETH withdrawal action.

The default network services are dRPC, PublicNode and the public Candide bundler. They can see IP addresses, requests and account activity, may share underlying infrastructure, and can be unavailable or rate-limited. Both independent reads are required; the app stops on disagreement. No developer account or embedded project billing key is needed. Advanced users may configure their own supported Alchemy/Infura credentials; those services' limits and billing apply.

Your encrypted identity and protected authority material remain on the Mac. The backup contains both authority roles under the same passphrase; it is not independent-device recovery. Keep a verified backup and the passphrase separately. Phil cannot recover a lost passphrase or both lost copies. Your Mac's security still matters.

Ethereum transactions, account activity and token metadata are public. A preview stays local until used in an on-chain operation. Saved artwork preferences are separate from the identity backup. The same recipe-bound name can occur more than once; token numbers distinguish minted tokens.

One mint per Genesis account is permanent. Transfers do not reset eligibility. Reserved grants do not bypass that rule. Mint price is zero, but Ethereum and bundler network fees apply. No asset value is promised. ERC-2981 provides 3.69% royalty information; marketplace payment is not guaranteed.

Build 87 tolerates ordinary block advances during verification and removes the fixed browsing timeout. It keeps the same production configuration, contract semantics, artwork and identity binding as Builds 85–86. Fresh native Mac confirmation and short-lived, single-use signing grants remain required. macOS 12 is a build target, not evidence of real-device testing on every supported OS. The replacement collection's first owner mint and second-Mac proof remain pending at preparation. This download is a preview, not a launch announcement.
