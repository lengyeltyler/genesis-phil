// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;
import {PhilGenesisAccountV1, IGenesisNFT, IEntryPoint} from './PhilGenesisAccountV1.sol';
/// @notice Deterministic full accounts; no proxy, upgrade, creator key or arbitrary initializer.
contract PhilGenesisAccountFactoryV1 {
    IEntryPoint public immutable entryPoint;
    IGenesisNFT public immutable genesis;
    bytes32 public immutable genesisCodeHash;
    uint256 public immutable chainId;
    uint256 public immutable feeCeilingWei;
    mapping(address=>bytes32) public identityOf;
    mapping(address=>bytes32) public accountRuntimeHash;
    function isGenesisAccount(address account) external view returns(bool){return block.chainid==chainId&&address(genesis).codehash==genesisCodeHash&&identityOf[account]!=bytes32(0)&&account.codehash==accountRuntimeHash[account];}
    event AccountCreated(bytes32 indexed identityCommitment,address indexed account,uint8 mode);
    constructor(IEntryPoint ep,IGenesisNFT nft,uint256 expectedChain,uint256 feeCeiling){
        require(address(ep).code.length>0&&address(nft).code.length>0&&expectedChain==block.chainid&&feeCeiling>0,'CONFIG');entryPoint=ep;genesis=nft;genesisCodeHash=address(nft).codehash;chainId=expectedChain;feeCeilingWei=feeCeiling;
    }
    function _salt(bytes32 identity,uint8 mode) private view returns(bytes32){return keccak256(abi.encode('PHIL_GENESIS_ACCOUNT_V1',chainId,identity,mode));}
    function _code(address owner,address recovery,bytes32 identity,uint8 mode) private view returns(bytes memory){return abi.encodePacked(type(PhilGenesisAccountV1).creationCode,abi.encode(entryPoint,genesis,genesisCodeHash,owner,recovery,identity,mode,chainId,feeCeilingWei));}
    function getAddress(address owner,address recovery,bytes32 identity,uint8 mode) public view returns(address){return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff),address(this),_salt(identity,mode),keccak256(_code(owner,recovery,identity,mode)))))));}
    function createAccount(address owner,address recovery,bytes32 identity,uint8 mode) external returns(PhilGenesisAccountV1 account){
        address predicted=getAddress(owner,recovery,identity,mode);if(predicted.code.length>0)return PhilGenesisAccountV1(payable(predicted));
        account=new PhilGenesisAccountV1{salt:_salt(identity,mode)}(entryPoint,genesis,genesisCodeHash,owner,recovery,identity,mode,chainId,feeCeilingWei);identityOf[address(account)]=identity;accountRuntimeHash[address(account)]=address(account).codehash;emit AccountCreated(identity,address(account),mode);
    }
}
