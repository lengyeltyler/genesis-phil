// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
import {PhilGenesisNames} from "./PhilGenesisNames.sol";
import {PhilGenesisArtCommitment} from "./PhilGenesisArtCommitment.sol";
import {PhilGenesisLZ4} from "./PhilGenesisLZ4.sol";
import {PhilGenesisRecipes} from "./PhilGenesisRecipes.sol";
/// @notice Fully on-chain deterministic SVG dictionary reconstruction of the pinned final 896 traits.
contract PhilGenesisRenderer {
    uint256 public constant PAGE_SIZE = 24000;
    uint256 public constant TRAIT_COUNT = 896;
    PhilGenesisNames internal immutable nameGenerator;
    bytes32 public immutable catalogHash;
    uint256 public immutable catalogLength;
    address[] private _pages;
    uint256 private immutable tokenCount;
    uint256 private immutable blockCount;
    uint256 private immutable traitDirectory;
    uint256 private immutable blockDirectory;
    uint256 private immutable dictionaryLength;
    uint256 private immutable literalLength;
    error InvalidCatalog();
    error InvalidTrait();
    constructor(address[] memory pages, uint256 length, bytes32 hash) {
        if(hash!=PhilGenesisArtCommitment.EXPECTED)revert InvalidCatalog();
        if (length < 32+TRAIT_COUNT*40 || pages.length != (length+PAGE_SIZE-1)/PAGE_SIZE || hash==bytes32(0)) revert InvalidCatalog();
        bytes32[] memory hashes=new bytes32[](pages.length);
        for(uint256 i; i<pages.length; ++i) {
            uint256 expected = i+1==pages.length ? length-i*PAGE_SIZE : PAGE_SIZE;
            if(pages[i].code.length != expected+1) revert InvalidCatalog();
            bytes memory prefix = new bytes(1); address p=pages[i];
            assembly ("memory-safe") { extcodecopy(p,add(prefix,32),0,1) }
            if(prefix[0] != 0) revert InvalidCatalog();
            hashes[i]=p.codehash;_pages.push(p);
        }
        nameGenerator=new PhilGenesisNames();
        catalogLength=length;catalogHash=hash;
        // Commitment to actual runtime code hashes; bounded constructor memory.
        if(keccak256(abi.encode(length,hashes)) != hash) revert InvalidCatalog();
        bytes memory h=_read(0,32);
        if(_u(h,0,4)!=0x50473036||_u(h,8,4)!=32)revert InvalidCatalog();
        tokenCount=_u(h,4,2);blockCount=_u(h,6,2);
        traitDirectory=_u(h,12,4);blockDirectory=_u(h,16,4);dictionaryLength=_u(h,20,4);literalLength=_u(h,24,4);
        if(tokenCount==0||blockCount==0||blockCount>64||traitDirectory!=32+tokenCount*10||blockDirectory!=traitDirectory+TRAIT_COUNT*40||dictionaryLength>blockCount*65536)revert InvalidCatalog();
    }
    function pageCount() external view returns(uint256){return _pages.length;}
    function page(uint256 index) external view returns(address){return _pages[index];}
    function catalogChunk(uint256 offset,uint256 length) external view returns(bytes memory){
        if(length>PAGE_SIZE)revert InvalidCatalog();return _read(offset,length);
    }
    function _read(uint256 offset,uint256 length) private view returns(bytes memory out){out=new bytes(length);_copy(offset,length,out,0);}
    function _copy(uint256 offset,uint256 length,bytes memory out,uint256 dest) private view {
        if(offset>catalogLength||length>catalogLength-offset||dest>out.length||length>out.length-dest)revert InvalidCatalog();
        uint256 end=dest+length;
        while(dest<end){uint256 index=offset/PAGE_SIZE;uint256 local=offset%PAGE_SIZE;uint256 n=PAGE_SIZE-local;
            if(n>end-dest)n=end-dest;address p=_pages[index];
            assembly ("memory-safe") {extcodecopy(p,add(add(out,32),dest),add(local,1),n)}offset+=n;dest+=n;
        }
    }
    function _u(bytes memory b,uint256 offset,uint256 size) private pure returns(uint256 v){
        if(offset>b.length||size>b.length-offset)revert InvalidCatalog();
        assembly ("memory-safe"){v:=shr(sub(256,mul(size,8)),mload(add(add(b,32),offset)))}
    }
    function recipe(uint256 tokenId) public view virtual returns(uint16[] memory){return PhilGenesisRecipes.recipe(tokenId);}
    function trait(uint256 index) public view returns(bytes memory){
        if(index>=TRAIT_COUNT)revert InvalidTrait();uint16[] memory ids=new uint16[](1);ids[0]=uint16(index);
        _returnString(_compose(ids,false,bytes(''),bytes(''),false));
    }
    function inlineTrait(uint256 index) external view returns(bytes memory){return trait(index);}
    // Each packed copy node is 12 bytes: destination:uint32, block offset:uint16,
    // length:uint16, next node:uint32 (1-based). Writes are grouped by dictionary
    // block, so each 64 KiB block is decoded at most once per call.
    struct Work {bytes table;bytes literals;bytes out;bytes nodes;uint256[] heads;uint256 used;uint256 dictionaryBytes;}
    function _plan(uint256 id,bool encoded,bytes memory d,Work memory w,uint256 dest,uint256 expected) private view {
        bytes memory references=_read(_u(d,28,4),_u(d,32,4));
        // Resolve each local reference once. Programs reuse attributes thousands of
        // times; the hot loop needs a single aligned load instead of two indexes.
        bytes memory resolved=new bytes((references.length/2)*32);
        bytes memory table=w.table;
        assembly ("memory-safe") {
            let end:=add(add(references,32),mload(references))
            let refDest:=add(resolved,32)
            for {let p:=add(references,32)} lt(p,end) {p:=add(p,2) refDest:=add(refDest,32)} {
                let t:=shr(240,mload(p))
                mstore(refDest,shr(216,mload(add(add(table,32),add(mul(t,10),mul(encoded,5))))))
            }
        }
        uint256 count=_u(d,8,4);if(count>32768)revert InvalidCatalog();
        bytes memory program=PhilGenesisLZ4.decode(_read(_u(d,0,4),_u(d,4,4)),count*2);
        // Catalog page hashes are pinned to the generated build commitment in the
        // constructor. The compiler validates all token ranges and plan lengths;
        // only those immutable programs reach this allocation-bounded interpreter.
        assembly ("memory-safe") {
            let literals:=mload(add(w,32))
            let output:=add(mload(add(w,64)),32)
            let literalData:=add(literals,32)
            let resolvedData:=add(resolved,32)
            let nodes:=mload(add(w,96))
            let heads:=mload(add(w,128))
            let p:=add(program,32) let end:=add(p,mload(program))
            for {} lt(p,end) {p:=add(p,2)} {
                let t:=shr(240,mload(p))
                let attribute:=and(t,0x8000)
                if attribute {
                    let prefix:=mload(add(resolvedData,mul(and(t,0x7fff),32)))
                    let n:=and(prefix,65535)
                    mcopy(add(output,dest),add(literalData,shr(16,prefix)),n)
                    dest:=add(dest,n) p:=add(p,2) t:=shr(240,mload(p))
                }
                let record:=mload(add(resolvedData,mul(t,32)))
                let offset:=shr(16,record) let len:=and(record,65535)
                switch and(offset,0x800000)
                case 0 {
                    mcopy(add(output,dest),add(literalData,offset),len)
                    dest:=add(dest,len)
                }
                default {
                offset:=and(offset,0x7fffff)
                for {} len {} {
                    let used:=mload(add(w,160))
                    let blockId:=shr(16,offset) let local:=and(offset,65535)
                    let n:=sub(65536,local) if gt(n,len){n:=len}
                    let head:=add(add(heads,32),mul(blockId,32))
                    let packed:=or(or(shl(64,dest),shl(48,local)),or(shl(32,n),mload(head)))
                    mstore(add(add(nodes,32),mul(used,12)),shl(160,packed))
                    used:=add(used,1) mstore(head,used) mstore(add(w,160),used)
                    dest:=add(dest,n) offset:=add(offset,n) len:=sub(len,n)
                }
                }
                if attribute {mstore8(add(output,dest),39) dest:=add(dest,1)}
            }
            if iszero(eq(dest,expected)){revert(0,0)}
        }
        id;
    }

    function _expand(Work memory w,bytes memory out) private view {
        bytes memory bd=_read(blockDirectory,blockCount*12);
        for(uint256 b;b<blockCount;++b){
            uint256 node=w.heads[b];if(node==0)continue;
            uint256 scratch;assembly ("memory-safe"){scratch:=mload(0x40)}
            uint256 size=_u(bd,b*12+8,4);
            if(size!=(b+1==blockCount?dictionaryLength-b*65536:65536))revert InvalidCatalog();
            bytes memory data=PhilGenesisLZ4.decode(_read(_u(bd,b*12,4),_u(bd,b*12+4,4)),size);
            bytes memory nodes=w.nodes;
            // Packed widths bound these additions below 2^33. Preserve both
            // source and destination checks without checked-arithmetic scaffolding.
            assembly ("memory-safe") {
                let used:=mload(add(w,160))
                let nodeData:=add(nodes,32)
                let output:=add(out,32)
                let outputLength:=mload(out)
                let source:=add(data,32)
                for {} node {} {
                    if gt(node,used){revert(0,0)}
                    let packed:=shr(160,mload(add(nodeData,mul(sub(node,1),12))))
                    let dest:=shr(64,packed)
                    let offset:=and(shr(48,packed),65535)
                    let n:=and(shr(32,packed),65535)
                    if or(gt(add(offset,n),size),gt(add(dest,n),outputLength)){revert(0,0)}
                    mcopy(add(output,dest),add(source,offset),n)
                    node:=and(packed,0xffffffff)
                }
            }
            assembly ("memory-safe"){mstore(0x40,scratch)}
        }
    }
    function _compose(uint16[] memory ids,bool encoded,bytes memory header,bytes memory footer,bool layers) internal view returns(string memory){
        bytes memory ls=encoded?bytes("%253Cg%2520style='isolation:isolate'%253E"):bytes("<g style='isolation:isolate'>");
        bytes memory le=encoded?bytes('%253C/g%253E'):bytes('</g>');
        bytes memory directory=_read(traitDirectory,TRAIT_COUNT*40);
        uint256 length=header.length+footer.length;uint256 nodes;
        for(uint256 i;i<ids.length;++i){if(ids[i]>=TRAIT_COUNT)revert InvalidTrait();uint256 at=uint256(ids[i])*40;
            length+=_u(directory,at+(encoded?16:12),4);nodes+=_u(directory,at+(encoded?24:20),4);
        }
        if(layers)length+=ids.length*(ls.length+le.length);
        if(length>2100000||nodes>2000)revert InvalidCatalog();
        bytes memory out=new bytes(length+32);assembly ("memory-safe"){out:=add(out,32) mstore(out,length)}
        Work memory w=Work(_read(32,tokenCount*10),_read(blockDirectory+blockCount*12,literalLength),out,new bytes(nodes*12+32),new uint256[](blockCount),0,dictionaryLength);
        // Reserve tail padding for unaligned node stores; logical length excludes it.
        bytes memory ns=w.nodes;assembly ("memory-safe"){mstore(ns,sub(mload(ns),32))}
        uint256 cursor=header.length;assembly ("memory-safe"){mcopy(add(out,32),add(header,32),mload(header))}
        for(uint256 i;i<ids.length;++i){uint256 scratch;assembly ("memory-safe"){scratch:=mload(0x40)}
            if(layers){assembly ("memory-safe"){mcopy(add(add(out,32),cursor),add(ls,32),mload(ls))}cursor+=ls.length;}
            bytes memory d=new bytes(40);uint256 at=uint256(ids[i])*40;assembly ("memory-safe"){mcopy(add(d,32),add(add(directory,32),at),40)}
            uint256 end=cursor+_u(d,encoded?16:12,4);_plan(ids[i],encoded,d,w,cursor,end);cursor=end;
            if(layers){assembly ("memory-safe"){mcopy(add(add(out,32),cursor),add(le,32),mload(le))}cursor+=le.length;}
            assembly ("memory-safe"){mstore(0x40,scratch)}
        }
        if(w.used!=nodes||cursor+footer.length!=length)revert InvalidCatalog();
        assembly ("memory-safe"){mcopy(add(add(out,32),cursor),add(footer,32),mload(footer))}
        _expand(w,out);return string(out);
    }
    function render(uint256 recipeId) public view virtual returns(string memory){return _render(recipeId);}
    function _render(uint256 recipeId) internal view returns(string memory){
        _returnString(_compose(PhilGenesisRecipes.recipe(recipeId),false,bytes("<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420' viewBox='109.06 15.22 420 420'>"),bytes('</svg>'),true));
    }
    function tokenURI(uint256 recipeId) public view virtual returns(string memory){return _tokenURI(0,recipeId,1);}
    function _attributes(uint16[] memory ids) private view returns(bytes memory result){
        // At most 2,096 bytes for any valid recipe in the immutable catalog.
        // Output precedes scratch so the directory and label reads can be reclaimed.
        result=new bytes(4096);
        uint256 scratch;assembly ("memory-safe"){scratch:=mload(0x40)}
        bytes memory directory=_read(traitDirectory,TRAIT_COUNT*40);
        uint256 first=_u(directory,36,4);
        bytes memory labels=_read(first,catalogLength-first);
        assembly ("memory-safe") {
            let cursor:=0
            let output:=add(result,32)
            for {let i:=0} lt(i,mload(ids)) {i:=add(i,1)} {
                let index:=mload(add(add(ids,32),mul(i,32)))
                let at:=shr(224,mload(add(add(directory,68),mul(index,40))))
                if lt(at,first){revert(0,0)}
                let offset:=sub(at,first)
                if gt(add(offset,2),mload(labels)){revert(0,0)}
                let source:=add(add(labels,32),offset)
                let n:=shr(240,mload(source))
                if i {mstore8(add(output,cursor),44) cursor:=add(cursor,1)}
                if or(gt(add(cursor,n),4096),gt(add(add(offset,2),n),mload(labels))){revert(0,0)}
                mcopy(add(output,cursor),add(source,2),n)
                cursor:=add(cursor,n)
            }
            mstore(result,cursor) mstore(0x40,scratch)
        }
    }
    function _tokenURI(uint256 tokenId,uint256 recipeId,uint256 nameId) internal view returns(string memory){
        uint16[] memory ids=PhilGenesisRecipes.recipe(recipeId);
        bytes memory prefix=abi.encodePacked('data:application/json,%7B%22name%22:%22',nameGenerator.encodedName{gas:30000}(nameId),tokenId==0?'%20%230':string.concat('%20%23',_decimal(tokenId)),'%22,%22recipe_id%22:%22',_decimal(recipeId),'%22,%22attributes%22:[',_attributes(ids),"],%22image%22:%22data:image/svg+xml,%253Csvg%2520xmlns='http://www.w3.org/2000/svg'%2520width='420'%2520height='420'%2520viewBox='109.06%252015.22%2520420%2520420'%253E");
        _returnString(_compose(ids,true,prefix,bytes('%253C/svg%253E%22%7D'),true));
    }
    function _returnString(string memory result) internal pure {
        assembly ("memory-safe") {let start:=sub(result,32) mstore(start,32) let n:=mload(result) mstore(add(add(result,32),n),0) return(start,add(64,and(add(n,31),not(31))))}
    }
    function _decimal(uint256 n) internal pure returns(string memory){
        uint256 x=n;uint256 length=1;while(x>=10){x/=10;++length;}bytes memory b=new bytes(length);
        do {b[--length]=bytes1(uint8(48+n%10));n/=10;}while(length>0);return string(b);
    }
}
