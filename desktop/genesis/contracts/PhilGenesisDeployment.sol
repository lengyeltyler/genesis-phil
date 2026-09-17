// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {PhilGenesisAccountFactoryV1} from './PhilGenesisAccountFactoryV1.sol';
import {IGenesisNFT,IEntryPoint} from './PhilGenesisAccountV1.sol';
import {PhilGenesisMintAccess} from './PhilGenesisMintAccess.sol';
interface IPinnedGenesisNFT {
    function accountFactory() external view returns(address);
    function mintAccess() external view returns(address);
    function chainId() external view returns(uint256);
}
/// @notice Completes a two-transaction immutable deployment. The preceding NFT
/// creation already pins this bootstrap's CREATE-1 factory and CREATE-2 access.
/// Before this succeeds the NFT cannot recognize any account or mint a token.
contract PhilGenesisDeployment {
    address public immutable nft;
    PhilGenesisAccountFactoryV1 public immutable factory;
    PhilGenesisMintAccess public immutable mintAccess;
    constructor(address nft_,bytes32 nftCodeHash,IEntryPoint ep,uint256 chain,uint256 feeCeiling,address[2] memory earlyWallets){
        require(chain==block.chainid&&nft_.code.length!=0&&nft_.codehash==nftCodeHash,'NFT_CODE');
        address predictedFactory=address(uint160(uint256(keccak256(abi.encodePacked(hex'd694',address(this),hex'01')))));
        address predictedAccess=address(uint160(uint256(keccak256(abi.encodePacked(hex'd694',address(this),hex'02')))));
        require(IPinnedGenesisNFT(nft_).accountFactory()==predictedFactory&&IPinnedGenesisNFT(nft_).mintAccess()==predictedAccess&&IPinnedGenesisNFT(nft_).chainId()==chain,'NFT_BINDING');
        nft=nft_;
        factory=new PhilGenesisAccountFactoryV1(ep,IGenesisNFT(nft_),chain,feeCeiling);
        require(address(factory)==predictedFactory,'FACTORY_ADDRESS');
        mintAccess=new PhilGenesisMintAccess(nft_,msg.sender,earlyWallets[0],earlyWallets[1]);
        require(address(mintAccess)==predictedAccess,'ACCESS_ADDRESS');
    }
}
