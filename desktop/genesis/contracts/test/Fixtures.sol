// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {EntryPoint} from '@account-abstraction/contracts/core/EntryPoint.sol';
import {IERC721Receiver} from '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import {IGenesisNFT} from '../PhilGenesisAccountV1.sol';
contract GenesisRejectingReceiver {}
contract GenesisAcceptingReceiver is IERC721Receiver {
 function onERC721Received(address,address,uint256,bytes calldata)external pure returns(bytes4){return IERC721Receiver.onERC721Received.selector;}
}
contract GenesisReentrantReceiver is IERC721Receiver {
 IGenesisNFT public nft;bool public blocked;
 function mint(IGenesisNFT target,uint256 id)external{nft=target;target.mintPhil(id);}
 function onERC721Received(address,address,uint256,bytes calldata)external returns(bytes4){try nft.mintPhil(2){blocked=false;}catch{blocked=true;}return IERC721Receiver.onERC721Received.selector;}
}
