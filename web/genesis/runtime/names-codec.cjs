"use strict";
const catalog=require('../unique-names/catalog.json');
const {N}=require('./recipes.cjs');
const NAME_COUNT=8352n;
function validNameId(id){if(typeof id!=='bigint'||id<1n||id>NAME_COUNT)throw Object.assign(Error('GENESIS_NAME_ID'),{code:'GENESIS_NAME_ID'});return id;}
function generatedName(nameId){let i=Number(validNameId(nameId)-1n);return 'Phil-'+(i<160?catalog.standalone[i]:catalog.prefixes[Math.floor((i-160)/64)]+catalog.suffixes[(i-160)%64]);}
function tokenName(nameId,tokenId){return generatedName(nameId)+' #'+BigInt(tokenId);}
function encodeChoice(recipeId,nameId){validNameId(nameId);if(typeof recipeId!=='bigint'||recipeId<1n||recipeId>N)throw Error('GENESIS_RECIPE');return recipeId+N*(nameId-1n);}
function decodeChoice(choice){if(typeof choice!=='bigint'||choice<1n||choice>N*NAME_COUNT)throw Error('GENESIS_CHOICE');return {recipeId:(choice-1n)%N+1n,nameId:(choice-1n)/N+1n};}
module.exports={NAME_COUNT,validNameId,generatedName,tokenName,encodeChoice,decodeChoice};
