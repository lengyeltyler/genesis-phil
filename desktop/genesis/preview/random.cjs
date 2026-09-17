'use strict';
const {randomBytes}=require('node:crypto');
const {radices,fromFields,rankSubset,recipe,encodeSelection,validateSelection,groups,order}=require('../scripts/recipes.cjs');
const families=require('../owner-art/color-families.json');
// Rejection sampling. The injected source is used by tests only; never exposed over IPC.
function uniform(limit,source=randomBytes){limit=BigInt(limit);if(limit<1n)throw Error('GENESIS_RANDOM_LIMIT');if(limit===1n)return 0n;const bits=(limit-1n).toString(2).length,n=Math.ceil(bits/8),mask=255>>>(n*8-bits);for(let attempt=0;attempt<256;attempt++){const b=Buffer.from(source(n));if(b.length!==n)throw Error('GENESIS_RANDOM_SOURCE');b[0]&=mask;const x=BigInt('0x'+b.toString('hex'));if(x<limit)return x;}throw Error('GENESIS_RANDOM_SOURCE');}
function countFor(category,source=randomBytes){const narrow=uniform(100n,source)<69n;return {narrow,count:Number(uniform(BigInt(narrow?(category==='stars'?2:3):7),source))};}
function drawSubset(n,count,source){const pool=Array.from({length:n},(_,i)=>i),selected=[];for(let i=0;i<count;i++){const j=i+Number(uniform(BigInt(n-i),source));[pool[i],pool[j]]=[pool[j],pool[i]];selected.push(pool[i]);}return rankSubset(selected.sort((a,b)=>a-b),n);}
function drawRecipe(source=randomBytes){const f=radices.map((n,i)=>[2,4,5].includes(i)?0n:uniform(n,source));const stars=countFor('stars',source),overlay=countFor('overlay',source);f[2]=drawSubset(groups.stars.length,stars.count,source);f[4]=drawSubset(groups.overlay.length,overlay.count,source);f[5]=uniform(5000n,source)===0n?uniform(BigInt(groups.wings.length),source)+1n:0n;
 const coordinated=uniform(100n,source)<87n;let id=fromFields(f),family=null;
 if(coordinated){const s=validateSelection(recipe(id)),hoodie=s.top.some(t=>groups.hoodie.includes(t));const eligible={};for(const k of ['body','teeth','jaw','spikes'])if(s[k].length)eligible[k]=groups[k].filter(t=>k!=='spikes'||!hoodie||groups.hoodieSpikes.includes(t));const choices=families.families.filter(color=>Object.values(eligible).every(ids=>ids.some(t=>families.traits[t]===color)));if(!choices.length)throw Error('GENESIS_COORDINATION_UNAVAILABLE');family=choices[Number(uniform(BigInt(choices.length),source))];for(const [k,ids]of Object.entries(eligible)){const matching=ids.filter(t=>families.traits[t]===family);s[k]=[matching[Number(uniform(BigInt(matching.length),source))]];}id=encodeSelection(order.flatMap(k=>s[k]));}
 return {recipeId:String(id),coordinated,family,stars,overlay};}
function randomRecipeId(source=randomBytes){return drawRecipe(source).recipeId;}
module.exports={randomRecipeId,uniform,drawRecipe,countFor};
