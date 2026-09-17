// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
/// @notice Bounded LZ4 block decoder. Input and exact output length are immutable catalog records.
/// @dev LZ4 block format, https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md.
/// Independent implementation; overlapping matches expand by doubling initialized bytes.
library PhilGenesisLZ4 {
    function decode(bytes memory data, uint256 size) internal pure returns(bytes memory out) {
        if(size>65536)revert();
        out=new bytes(size);decodeInto(data,out,0,size);
    }
    function decodeInto(bytes memory data,bytes memory out,uint256 dest,uint256 size) internal pure {
        if(dest>out.length||size>out.length-dest)revert();
        assembly ("memory-safe") {
            let p:=add(data,32) let end:=add(p,mload(data))
            let start:=add(add(out,32),dest) let q:=start let limit:=add(start,size)
            for {} lt(p,end) {} {
                let t:=byte(0,mload(p)) p:=add(p,1)
                let n:=shr(4,t)
                if eq(n,15) {
                    for {let more:=1} more {} {
                        if iszero(lt(p,end)){revert(0,0)}
                        let x:=byte(0,mload(p)) p:=add(p,1) n:=add(n,x) more:=eq(x,255)
                    }
                }
                if or(gt(n,sub(end,p)),gt(n,sub(limit,q))){revert(0,0)}
                mcopy(q,p,n) p:=add(p,n) q:=add(q,n)
                if eq(p,end){break}
                if lt(sub(end,p),2){revert(0,0)}
                let word:=mload(p) let distance:=or(byte(0,word),shl(8,byte(1,word))) p:=add(p,2)
                n:=and(t,15)
                if eq(n,15) {
                    for {let more:=1} more {} {
                        if iszero(lt(p,end)){revert(0,0)}
                        let x:=byte(0,mload(p)) p:=add(p,1) n:=add(n,x) more:=eq(x,255)
                    }
                }
                n:=add(n,4)
                if or(or(iszero(distance),gt(distance,sub(q,start))),gt(n,sub(limit,q))){revert(0,0)}
                let initialized:=distance let source:=sub(q,distance)
                for {} n {} {
                    let take:=n if gt(take,initialized){take:=initialized}
                    mcopy(q,source,take) q:=add(q,take) n:=sub(n,take) initialized:=add(initialized,take)
                }
            }
            if iszero(eq(q,limit)){revert(0,0)}
        }
    }
}
