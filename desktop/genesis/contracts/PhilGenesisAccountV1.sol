// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.27;
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {MessageHashUtils} from '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol';
import {BaseAccount} from '@account-abstraction/contracts/core/BaseAccount.sol';
import {IEntryPoint} from '@account-abstraction/contracts/interfaces/IEntryPoint.sol';
import {PackedUserOperation} from '@account-abstraction/contracts/interfaces/PackedUserOperation.sol';
import {IERC721Receiver} from '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
interface IGenesisNFT {function mintPhil(uint256 selectedRecipeId) external returns(uint256);function safeTransferFrom(address from,address to,uint256 tokenId) external;}
/// @notice One Phil Identity account, with an intrinsically finite Genesis policy.
/// @dev Phone mode describes the off-chain pre-signing policy; ECDSA remains the on-chain authority.
contract PhilGenesisAccountV1 is BaseAccount, IERC721Receiver {
    struct Authorization {
        bytes32 authorizationId;
        bytes32 philNonce;
        bytes32 presentationDigest;
        uint256 accountNonce;
        uint64 authorityEpoch;
        uint48 validAfter;
        uint48 validUntil;
        uint256 maximumFeeWei;
    }
    struct Recovery {address pendingOwner;uint48 executableAt;uint48 expiresAt;bytes32 id;}
    IEntryPoint private immutable _entryPoint;
    IGenesisNFT public immutable genesis;
    bytes32 public immutable genesisCodeHash;
    bytes32 public immutable identityCommitment;
    uint256 public immutable chainId;
    uint8 public immutable authorizationMode; // 1 protected Desktop, 2 phone-required host
    uint256 public immutable feeCeilingWei;
    address public owner;
    address public recoveryAuthority;
    struct AuthorityRotation {address pending;address proposer;uint48 executableAt;uint48 expiresAt;bytes32 id;}
    AuthorityRotation public authorityRotation;
    uint64 public authorityEpoch=1;
    uint48 public constant RECOVERY_DELAY=2 days;
    uint48 public constant RECOVERY_EXPIRY=30 days;
    Recovery public recovery;
    mapping(bytes32=>bool) public consumedAuthorization;
    mapping(bytes32=>bool) public consumedPhilNonce;
    bool private _executing;
    event ETHWithdrawn(bytes32 indexed authorizationId,address indexed recipient,uint256 amount);
    event GenesisExecuted(bytes32 indexed authorizationId, uint8 action, uint256 tokenId, address recipient);
    event RecoveryRequested(bytes32 indexed id,address pendingOwner,uint48 executableAt);
    event RecoveryCancelled(bytes32 indexed id);
    event OwnerRotated(address indexed owner,uint64 epoch);
    event AuthorityRotationRequested(bytes32 indexed id,address pending,uint48 executableAt);
    event AuthorityRotationCancelled(bytes32 indexed id);
    event RecoveryAuthorityRotated(address indexed authority,uint64 epoch);
    error InvalidConfiguration();error Unauthorized();error InvalidAuthorization();error Reentrant();
    constructor(IEntryPoint ep,IGenesisNFT nft,bytes32 expectedNftCode,address owner_,address recovery_,bytes32 identity,uint8 mode,uint256 expectedChain,uint256 feeCeiling){
        if(address(ep).code.length==0||address(nft).code.length==0||address(nft).codehash!=expectedNftCode||owner_==address(0)||recovery_==address(0)||owner_==recovery_||identity==0||(mode!=1&&mode!=2)||expectedChain!=block.chainid||feeCeiling==0)revert InvalidConfiguration();
        _entryPoint=ep;genesis=nft;genesisCodeHash=expectedNftCode;owner=owner_;recoveryAuthority=recovery_;identityCommitment=identity;authorizationMode=mode;chainId=expectedChain;feeCeilingWei=feeCeiling;
    }
    receive() external payable {}
    function entryPoint() public view override returns(IEntryPoint){return _entryPoint;}
    function _requireFromEntryPoint() internal view override {if(msg.sender!=address(_entryPoint))revert Unauthorized();}
    function validateUserOp(PackedUserOperation calldata op,bytes32 hash,uint256 missing) external override returns(uint256 validation){
        _requireFromEntryPoint();
        // All policy/fee checks precede prefunding. No NFT external reads in validation.
        validation=_validatePolicy(op);
        if(validation!=1){
            validation=_signerValidation(op,hash,validation);
            _validateNonce(op.nonce);_payPrefund(missing);
        }
        // v0.7 unsigned gas simulation needs prefund even with a dummy signer.
        // A real handleOps rejects SIG_VALIDATION_FAILED and atomically reverts
        // the prefund. Invalid policy never reaches the prefunding call.
    }
    function _validateSignature(PackedUserOperation calldata op,bytes32 hash) internal view override returns(uint256){
        uint256 policy=_validatePolicy(op);return policy==1?1:_signerValidation(op,hash,policy);
    }
    function _signerValidation(PackedUserOperation calldata op,bytes32 hash,uint256 window) private view returns(uint256){
        (address signer,ECDSA.RecoverError err,)=ECDSA.tryRecover(MessageHashUtils.toEthSignedMessageHash(hash),op.signature);
        return err==ECDSA.RecoverError.NoError&&signer==owner?window:window|1;
    }
    function _validatePolicy(PackedUserOperation calldata op) private view returns(uint256){
        if(block.chainid!=chainId||op.sender!=address(this)||op.nonce>type(uint64).max||op.paymasterAndData.length!=0||recovery.pendingOwner!=address(0)||op.callData.length<4)return 1;
        bytes4 selector=bytes4(op.callData[:4]);bool mint=selector==this.mintPhil.selector;
        bool withdrawing=selector==this.withdrawETH.selector;
        if((mint&&op.callData.length!=4+9*32)||(!mint&&((!withdrawing&&selector!=this.transferPhil.selector)||op.callData.length!=4+10*32)))return 1;
        if(mint){if(abi.decode(op.callData[260:],(uint256))==0)return 1;}else{(uint256 token,address recipient)=abi.decode(op.callData[260:],(uint256,address));if((withdrawing?token==0:token>=369)||recipient==address(0)||(withdrawing&&recipient==address(this)))return 1;}
        // ABI decoding rejects noncanonical narrow integers and addresses. Strict length rejects tails.
        Authorization memory a=abi.decode(op.callData[4:260],(Authorization));
        if(!_valid(a)||a.accountNonce!=op.nonce)return 1;
        uint256 verification=uint128(uint256(op.accountGasLimits)>>128);uint256 callGas=uint128(uint256(op.accountGasLimits));
        uint256 maxFee=uint128(uint256(op.gasFees));uint256 priority=uint128(uint256(op.gasFees)>>128);
        if(maxFee==0||priority>maxFee||verification==0||callGas==0||verification+callGas>16000000||op.preVerificationGas>16000000)return 1;
        uint256 maximum=(verification+callGas+op.preVerificationGas)*maxFee;
        if(maximum>a.maximumFeeWei||a.maximumFeeWei>feeCeilingWei)return 1;
        return uint256(a.validUntil)<<160|uint256(a.validAfter)<<208;
    }
    function _valid(Authorization memory a) private view returns(bool){return a.authorizationId!=0&&a.philNonce!=0&&a.presentationDigest!=0&&a.authorityEpoch==authorityEpoch&&a.validUntil>a.validAfter&&a.maximumFeeWei>0&&!consumedAuthorization[a.authorizationId]&&!consumedPhilNonce[a.philNonce];}
    function _begin(Authorization calldata a) private {
        _requireFromEntryPoint();if(_executing)revert Reentrant();
        if(block.chainid!=chainId||address(genesis).codehash!=genesisCodeHash||recovery.pendingOwner!=address(0)||!_valid(a)||block.timestamp<a.validAfter||block.timestamp>a.validUntil)revert InvalidAuthorization();
        consumedAuthorization[a.authorizationId]=true;consumedPhilNonce[a.philNonce]=true;_executing=true;
    }
    function mintPhil(Authorization calldata a,uint256 selectedRecipeId) external {
        if(msg.data.length!=4+9*32)revert InvalidAuthorization();_begin(a);uint256 tokenId=genesis.mintPhil(selectedRecipeId);_executing=false;emit GenesisExecuted(a.authorizationId,1,tokenId,address(this));
    }
    function transferPhil(Authorization calldata a,uint256 tokenId,address recipient) external {
        if(msg.data.length!=4+10*32||recipient==address(0))revert InvalidAuthorization();_begin(a);genesis.safeTransferFrom(address(this),recipient,tokenId);_executing=false;emit GenesisExecuted(a.authorizationId,2,tokenId,recipient);
    }
    // Exact owner-authorized principal. EntryPoint has already reserved this
    // operation's maximum fee; only the remaining deposit can be reclaimed.
    function withdrawETH(Authorization calldata a,uint256 amount,address payable recipient) external {
        if(msg.data.length!=4+10*32||amount==0||recipient==address(0)||recipient==address(this))revert InvalidAuthorization();
        _begin(a);
        uint256 deposit=_entryPoint.balanceOf(address(this));
        if(deposit!=0)_entryPoint.withdrawTo(payable(address(this)),deposit);
        (bool sent,)=recipient.call{value:amount}("");if(!sent)revert InvalidAuthorization();
        emit ETHWithdrawn(a.authorizationId,recipient,amount);_executing=false;
    }
    function onERC721Received(address,address,uint256,bytes calldata) external view returns(bytes4){if(msg.sender!=address(genesis))revert Unauthorized();return IERC721Receiver.onERC721Received.selector;}
    // User-held recovery, never creator administration. Direct role calls only;
    // these selectors are not available to the Genesis UserOperation signer.
    function requestRecovery(address pendingOwner) external {
        if(msg.sender!=recoveryAuthority||(recovery.pendingOwner!=address(0)&&block.timestamp<=recovery.expiresAt)||pendingOwner==address(0)||pendingOwner==owner||pendingOwner==recoveryAuthority||_executing)revert Unauthorized();
        bytes32 id=keccak256(abi.encode(address(this),chainId,authorityEpoch,pendingOwner,block.timestamp));
        ++authorityEpoch;delete authorityRotation;recovery=Recovery(pendingOwner,uint48(block.timestamp)+RECOVERY_DELAY,uint48(block.timestamp)+RECOVERY_EXPIRY,id);emit RecoveryRequested(id,pendingOwner,recovery.executableAt);
    }
    function cancelRecovery(bytes32 id) external {if(msg.sender!=owner||recovery.pendingOwner==address(0)||recovery.id!=id||_executing)revert Unauthorized();delete recovery;++authorityEpoch;emit RecoveryCancelled(id);}
    function rotateOwner(address next) external {if(msg.sender!=owner||_executing||recovery.pendingOwner!=address(0)||next==address(0)||next==owner||next==recoveryAuthority)revert Unauthorized();owner=next;++authorityEpoch;delete authorityRotation;emit OwnerRotated(owner,authorityEpoch);}
    function requestAuthorityRotation(address next) external {
        if((msg.sender!=owner&&msg.sender!=recoveryAuthority)||_executing||recovery.pendingOwner!=address(0)||(authorityRotation.pending!=address(0)&&block.timestamp<=authorityRotation.expiresAt)||next==address(0)||next==owner||next==recoveryAuthority)revert Unauthorized();
        authorityRotation=AuthorityRotation(next,msg.sender,uint48(block.timestamp)+RECOVERY_DELAY,uint48(block.timestamp)+RECOVERY_EXPIRY,keccak256(abi.encode(address(this),chainId,authorityEpoch,msg.sender,next,block.timestamp)));emit AuthorityRotationRequested(authorityRotation.id,next,authorityRotation.executableAt);
    }
    function cancelAuthorityRotation(bytes32 id) external {
        AuthorityRotation memory r=authorityRotation;address canceller=r.proposer==owner?recoveryAuthority:owner;
        if(r.pending==address(0)||r.id!=id||msg.sender!=canceller||_executing)revert Unauthorized();delete authorityRotation;emit AuthorityRotationCancelled(id);
    }
    function completeAuthorityRotation(bytes32 id) external {
        AuthorityRotation memory r=authorityRotation;
        if(r.pending==address(0)||r.id!=id||_executing||recovery.pendingOwner!=address(0)||block.timestamp<r.executableAt||block.timestamp>r.expiresAt||r.pending==owner)revert Unauthorized();
        recoveryAuthority=r.pending;++authorityEpoch;delete authorityRotation;emit RecoveryAuthorityRotated(recoveryAuthority,authorityEpoch);
    }
    function completeRecovery(bytes32 id) external {
        Recovery memory r=recovery;if(msg.sender!=recoveryAuthority||r.pendingOwner==address(0)||r.id!=id||block.timestamp<r.executableAt||block.timestamp>r.expiresAt||_executing)revert Unauthorized();
        owner=r.pendingOwner;++authorityEpoch;delete recovery;delete authorityRotation;emit OwnerRotated(owner,authorityEpoch);
    }
}
