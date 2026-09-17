'use strict';
exports.generate=function(c){const fs=require('fs'),path=require('path');const hex=xs=>xs.map(i=>i.toString(16).padStart(4,'0')).join('');const bytes=Object.entries(c.groups).filter(([k])=>!['hoodie','hoodieSpikes'].includes(k)).map(([k,v])=>`bytes constant ${k}=hex"${hex(v)}";`).join('\n');
const s=`// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;
// Generated from owner revision source-lock; dense mixed-radix subset ranking.
library PhilGenesisRecipes {
uint256 internal constant SUPPLY=${c.N};
uint256 internal constant MAX_LAYERS=29;
${bytes}
bytes constant pairs=hex"${hex(c.pairs.flatMap(p=>p.map(i=>i<0?65535:i)))}";
function rank(uint256 id) internal pure returns(uint256){require(id>0&&id<=SUPPLY,"RECIPE_BOUNDS");return id-1;}
function item(bytes memory g,uint256 i) private pure returns(uint16){require(i*2+1<g.length,"TRAIT_BOUNDS");return (uint16(uint8(g[i*2]))<<8)|uint8(g[i*2+1]);}
function choose(uint256 n,uint256 k) private pure returns(uint256 r){if(k>n)return 0;r=1;for(uint256 i=1;i<=k;++i)r=r*(n-i+1)/i;}
function subset(uint256 code,bytes memory group,uint16[] memory out,uint256 cursor) private pure returns(uint256){uint256 size=group.length/2;uint256 k;while(code>=choose(size,k)){code-=choose(size,k);++k;}require(k<=9,"MULTIPLICITY");uint256 start;for(uint256 left=k;left>0;--left){for(uint256 j=start;j<size;++j){uint256 count=choose(size-j-1,left-1);if(code<count){out[cursor++]=item(group,j);start=j+1;break;}code-=count;}}return cursor;}
function recipe(uint256 id) internal pure returns(uint16[] memory out){uint256 r=rank(id);uint256[12] memory f;
${c.radices.map((n,i)=>`f[${i}]=r%${n};r/=${n};`).join('\n')}
require(r==0,"RADIX");out=new uint16[](MAX_LAYERS);uint256 n;
out[n++]=item(color,f[0]);if(f[1]>0&&f[1]<=108)out[n++]=item(nebula,f[1]-1);
n=subset(f[2],stars,out,n);if(f[1]>108)out[n++]=item(spiral,f[1]-109);
if(f[3]>0)out[n++]=item(dust,f[3]-1);n=subset(f[4],overlay,out,n);
if(f[5]>0)out[n++]=item(wings,f[5]-1);out[n++]=item(base,f[6]);if(f[7]>0)out[n++]=item(body,f[7]-1);
uint16 sp=item(pairs,f[8]*2);if(sp!=65535)out[n++]=sp;if(f[9]>0)out[n++]=item(teeth,f[9]-1);out[n++]=item(jaw,f[10]);out[n++]=item(eyes,f[11]);uint16 t=item(pairs,f[8]*2+1);if(t!=65535)out[n++]=t;
assembly("memory-safe"){mstore(out,n)}
}
}
`;
// Encode top/spike pairs as a compact arithmetic split, avoiding a 14KB table.
const allWidth=c.groups.spikes.length+1,hoodieWidth=c.groups.hoodieSpikes.length+1,hoodieEnd=allWidth+c.groups.hoodie.length*hoodieWidth;
const normal=c.groups.top.filter(t=>!c.groups.hoodie.includes(t));const allowed=c.groups.hoodieSpikes;
let compact=s.replace(/bytes constant pairs=hex"[a-f0-9]+";/,`bytes constant normalTop=hex"${hex(normal)}";\nbytes constant hoodieTop=hex"${hex(c.groups.hoodie)}";\nbytes constant hoodieSpikes=hex"${hex(allowed)}";`);
// JS pair order: no top, all hoodie tops, then all normal tops. Widths derive from explicit group membership.
compact=compact.replace('uint16 sp=item(pairs,f[8]*2);',`uint256 pair=f[8];uint16 sp=65535;uint16 t=65535;if(pair<${allWidth}){if(pair>0)sp=item(spikes,pair-1);}else if(pair<${hoodieEnd}){pair-=${allWidth};t=item(hoodieTop,pair/${hoodieWidth});if(pair%${hoodieWidth}>0)sp=item(hoodieSpikes,pair%${hoodieWidth}-1);}else{pair-=${hoodieEnd};t=item(normalTop,pair/${allWidth});if(pair%${allWidth}>0)sp=item(spikes,pair%${allWidth}-1);}`);
compact=compact.replace('uint16 t=item(pairs,f[8]*2+1);','');fs.writeFileSync(path.join(__dirname,'../contracts/PhilGenesisRecipes.sol'),compact);
fs.writeFileSync(path.join(__dirname,'../final-art/evidence/recipe-domain.json'),JSON.stringify({masterSHA256:require('../owner-art/source-lock.json').masterSHA256,recipeCount:String(c.N),radices:c.radices.map(String),starsSubsets:String(c.STARS),overlaySubsets:String(c.OVERLAYS),topSpikePairs:c.pairs.length,invalidTopSpikePairs:(c.groups.top.length+1)*(c.groups.spikes.length+1)-c.pairs.length,maxLayers:29,encoding:'recipeId = 1 + dense mixed-radix rank; size-first lexicographic subset rank; source-ordered distinct layers; paired Top/Spikes; joint Nebula/Spiral',publicTokenIds:'separate sequential 1..369'},null,2)+'\n');console.log(String(c.N));};
