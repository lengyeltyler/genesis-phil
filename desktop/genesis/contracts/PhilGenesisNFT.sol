// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import {IERC165} from '@openzeppelin/contracts/utils/introspection/IERC165.sol';
import {IERC2981} from '@openzeppelin/contracts/interfaces/IERC2981.sol';
import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';
import {PhilGenesisRenderer} from './PhilGenesisRenderer.sol';
import {PhilGenesisRecipes} from './PhilGenesisRecipes.sol';
interface IGenesisAccountRegistry {function isGenesisAccount(address account) external view returns(bool);}
interface IGenesisMintAccess {function consume(address account) external;}
/// @notice Immutable artwork; fixed launch window and limited reserved-mint grants.
contract PhilGenesisNFT is ERC721, IERC2981, PhilGenesisRenderer {
    uint256 public constant MAX_SUPPLY=369;
    uint96 public constant ROYALTY_BPS=369;
    address public immutable accountFactory;
    IGenesisMintAccess public immutable mintAccess;
    address public immutable royaltyReceiver;
    uint256 public immutable chainId;
    uint256 public totalMinted;
    mapping(uint256=>uint256) public recipeIdOf;
    mapping(uint256=>uint256) public tokenIdForRecipe;
    mapping(uint256=>bool) private recipeMinted;
    mapping(address=>bool) public hasMinted;
    bool private _minting;
    error MintUnavailable();error InvalidMintAccount();
    event PhilMinted(address indexed account,uint256 indexed tokenId,uint256 indexed recipeId,uint256 nameId);
    constructor(address[] memory pages,uint256 length,bytes32 commitment,address factory,address receiver,uint256 expectedChain,address access)
        ERC721('Phils','PHIL') PhilGenesisRenderer(pages,length,commitment) {
        require(factory!=address(0)&&receiver!=address(0)&&access!=address(0)&&expectedChain==block.chainid,'CONFIG');
        accountFactory=factory;royaltyReceiver=receiver;chainId=expectedChain;mintAccess=IGenesisMintAccess(access);
    }
    function renderer() external view returns(address){return address(this);}
    function isMintable(uint256 selectedRecipeId) public view returns(bool){
        return block.chainid==chainId&&totalMinted<MAX_SUPPLY&&selectedRecipeId>0&&selectedRecipeId<=PhilGenesisRecipes.SUPPLY&&!recipeMinted[selectedRecipeId];
    }
    // One existing finite-account argument binds the independently chosen art/name.
    function mintPhil(uint256 selectedChoiceId) external returns(uint256 tokenId){
        if(_minting||hasMinted[msg.sender])revert MintUnavailable();
        if(!IGenesisAccountRegistry(accountFactory).isGenesisAccount(msg.sender))revert InvalidMintAccount();
        _minting=true;tokenId=totalMinted;
        (uint256 selectedRecipeId,uint256 selectedNameId)=nameGenerator.claim(selectedChoiceId,tokenId);
        if(!isMintable(selectedRecipeId))revert MintUnavailable();
        mintAccess.consume(msg.sender);hasMinted[msg.sender]=true;totalMinted=tokenId+1;
        recipeMinted[selectedRecipeId]=true;recipeIdOf[tokenId]=selectedRecipeId;tokenIdForRecipe[selectedRecipeId]=tokenId;
        _safeMint(msg.sender,tokenId);emit PhilMinted(msg.sender,tokenId,selectedRecipeId,selectedNameId);_minting=false;
    }
    function royaltyInfo(uint256,uint256 salePrice) external view returns(address,uint256){return(royaltyReceiver,Math.mulDiv(salePrice,ROYALTY_BPS,10000));}
    function supportsInterface(bytes4 id) public view override(ERC721,IERC165) returns(bool){return id==type(IERC2981).interfaceId||super.supportsInterface(id);}
    function tokenURI(uint256 tokenId) public view override(ERC721,PhilGenesisRenderer) returns(string memory){_requireOwned(tokenId);return _tokenURI(tokenId,recipeIdOf[tokenId],nameGenerator.nameIdOf{gas:10000}(tokenId));}
    function recipe(uint256 tokenId) public view override returns(uint16[] memory){_requireOwned(tokenId);return PhilGenesisRecipes.recipe(recipeIdOf[tokenId]);}
    function render(uint256 tokenId) public view override returns(string memory){_requireOwned(tokenId);return _render(recipeIdOf[tokenId]);}
}
