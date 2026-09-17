# Current collection and verified sources

[Back to download](../README.md)

Build 93 uses the finalized Build 92 deployment on Ethereum Mainnet. Updating the withdrawal interface did not replace contracts.

| Contract | Address and source | Etherscan status |
|---|---|---|
| PhilGenesisDeployment | [`0xC136a0e84Fe018011e4e638E9df9794102B9ffBd`](https://etherscan.io/address/0xC136a0e84Fe018011e4e638E9df9794102B9ffBd#code) | Verified |
| PhilGenesisNFT | [`0x9732F84C54407cd846B3e987594417BcFA30644E`](https://etherscan.io/address/0x9732F84C54407cd846B3e987594417BcFA30644E#code) | Verified |
| PhilGenesisAccountFactoryV1 | [`0xa3C263C4A0d0dC07b6EA7A8414BD245d98D347F0`](https://etherscan.io/address/0xa3C263C4A0d0dC07b6EA7A8414BD245d98D347F0#code) | Verified |
| PhilGenesisMintAccess | [`0xe6e6953649335C245981AF185C632Fc871722Ae3`](https://etherscan.io/address/0xe6e6953649335C245981AF185C632Fc871722Ae3#code) | Similar Match |
| PhilGenesisNames | [`0x0142e100500A5360564C7875B8A988C752d7cF9d`](https://etherscan.io/address/0x0142e100500A5360564C7875B8A988C752d7cF9d#code) | Similar Match |

All five collection contracts and the tested deployed Genesis account have exact creation and runtime source matches on Sourcify. Find source records at [Sourcify](https://sourcify.dev) using Ethereum Mainnet and the contract address. Etherscan labels mint-access and names as Similar Match; these are not claimed as Etherscan exact matches.

All **77 referenced artwork pages** (55 retained and 22 replacements for the approved Body2 correction) have Sourcify creation matches. They return raw artwork bytes as runtime code, so the usual Solidity runtime verification badge does not apply. All 77 runtime hashes independently matched the frozen deployment configuration through dRPC and PublicNode at block **25994250**.

The NFT collection address is not a funding address. Fund only your personal Genesis account copied from the app.
