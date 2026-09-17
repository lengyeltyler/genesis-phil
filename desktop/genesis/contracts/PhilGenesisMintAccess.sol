// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
interface IGenesisMintHistory { function hasMinted(address account) external view returns (bool); }
/// @notice Fixed September 16, 2026 Denver launch, 336 general mints and 33 deployer-assigned mints.
/// Cannot alter artwork, transfer tokens, increase supply or extend the launch.
contract PhilGenesisMintAccess {
    address public immutable nft;
    address public immutable deployer;
    address public immutable earlyWallet2;
    address public immutable earlyWallet3;
    // Written only by construction. Storage keeps runtime hashes independent of
    // the eventual deployment timestamp; there is no setter or reset method.
    uint256 public publicOpensAt;
    uint256 public generalMinted;
    uint256 public reservedMinted;
    uint256 public reservedAssigned;
    mapping(address => address) public earlyAccountOf;
    mapping(address => bool) public earlyAccount;
    // 0: no grant; 1: available; 2: consumed. Grants cannot be reassigned.
    mapping(address => uint8) public reservedGrant;
    error AccessDenied();
    event EarlyAccountRegistered(address indexed wallet,address indexed account);
    event ReservedMintGranted(address indexed account);
    event MintAllocationConsumed(address indexed account,bool reserved);
    constructor(address nft_,address deployer_,address second,address third) {
        require(nft_!=address(0)&&deployer_!=address(0)&&second!=address(0)&&third!=address(0)
            &&deployer_!=second&&deployer_!=third&&second!=third,"CONFIG");
        nft=nft_;deployer=deployer_;earlyWallet2=second;earlyWallet3=third;
        // 2026-09-16 21:36:00 America/Denver (MDT); 2026-09-17 03:36:00 UTC.
        publicOpensAt=1789616160;
    }
    function registerEarlyAccount(address account) external {
        if(block.timestamp>=publicOpensAt||(msg.sender!=deployer&&msg.sender!=earlyWallet2&&msg.sender!=earlyWallet3)
            ||account==address(0)||earlyAccountOf[msg.sender]!=address(0)||earlyAccount[account]
            ||IGenesisMintHistory(nft).hasMinted(account))revert AccessDenied();
        earlyAccountOf[msg.sender]=account;earlyAccount[account]=true;
        emit EarlyAccountRegistered(msg.sender,account);
    }
    function grantReservedMint(address account) external {
        if(msg.sender!=deployer||block.timestamp<publicOpensAt||account==address(0)||reservedAssigned>=33
            ||reservedGrant[account]!=0||IGenesisMintHistory(nft).hasMinted(account))revert AccessDenied();
        reservedGrant[account]=1;++reservedAssigned;emit ReservedMintGranted(account);
    }
    function canMint(address account) public view returns(bool) {
        if(block.timestamp<publicOpensAt)return earlyAccount[account]&&generalMinted<336;
        if(reservedGrant[account]==1)return reservedMinted<33;
        return generalMinted<336;
    }
    function consume(address account) external {
        if(msg.sender!=nft||!canMint(account))revert AccessDenied();
        bool reserved=block.timestamp>=publicOpensAt&&reservedGrant[account]==1;
        if(reserved){reservedGrant[account]=2;++reservedMinted;}else ++generalMinted;
        emit MintAllocationConsumed(account,reserved);
    }
}
