'use strict';
const {randomBytes}=require('node:crypto');
const {randomNameId}=require('./names.cjs');
const {buildAuthorization}=require('../runtime/authorization.cjs');
const {randomRecipeId}=require('../preview/random.cjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).sort().join('|')!==keys.slice().sort().join('|')||Object.values(Object.getOwnPropertyDescriptors(value)).some(x=>!('value'in x)))fail('GENESIS_SHAPE');}
// Trusted main-process coordinator. A renderer can select a recipient/public
// token, but can never supply mint recipes, profiles, fees, nonces, or calldata.
function createProductionController({artReader,readState,completeExecution,random=randomRecipeId,randomName=randomNameId,selectionStore=null,onBatch=async()=>{}}){
 let generation=0,selected=null,active=null,busy=false,context=null,selectionKey=null,previous=null,previousNameId=null,kept=false;
 const invalidate=()=>{generation++;active=null;};
 const draw=()=>artReader.render(BigInt(random()),BigInt(randomName()));
 const choiceOf=art=>art?{recipeId:art.recipeId,nameId:art.nameId}:null;
 function bindContext(value,key=value){if(value!==context){
  invalidate();selected=null;previous=null;previousNameId=null;kept=false;context=value;selectionKey=key;
  const saved=selectionStore?.read(key);if(saved){selected=artReader.render(BigInt(saved.current),BigInt(saved.nameId));previous=saved.previous;previousNameId=saved.previousNameId;kept=saved.kept;}
 }}
 function persist(art,prior,keep,priorName=previousNameId){selectionStore?.write(selectionKey,{current:art.recipeId,nameId:art.nameId,previous:prior,previousNameId:priorName,kept:keep});selected=art;previous=prior;previousNameId=priorName;kept=keep;}
 function selection(input={}){exact(input,[]);if(!context)fail('GENESIS_IDENTITY_REQUIRED');return selected?Object.freeze({...selected,kept,canUndo:previous!==null,canUndoName:previousNameId!==null}):null;}
 function keepSelection(input={}){exact(input,[]);if(busy)fail('GENESIS_BUSY');if(!selected)fail('GENESIS_ART_REQUIRED');persist(selected,previous,true);return selection();}
 function releaseSelection(input={}){exact(input,[]);if(busy)fail('GENESIS_BUSY');if(!selected)fail('GENESIS_ART_REQUIRED');invalidate();persist(selected,previous,false);return selection();}
 function undoSelection(input={}){exact(input,[]);if(busy)fail('GENESIS_BUSY');if(kept)fail('GENESIS_SELECTION_KEPT');if(previous===null)fail('GENESIS_ART_REQUIRED');const art=artReader.render(BigInt(previous.recipeId),BigInt(previous.nameId));persist(art,choiceOf(selected),true,null);invalidate();return selection();}
 function reroll(input={}){
  exact(input,[]);if(busy)fail('GENESIS_BUSY');if(!context)fail('GENESIS_IDENTITY_REQUIRED');if(kept)fail('GENESIS_SELECTION_KEPT');
  const art=draw();persist(art,choiceOf(selected),false,null);invalidate();return selection();
 }
 async function rerollBatch(input={}){
  exact(input,['count']);if(![10,100].includes(input.count))fail('GENESIS_SHAPE');
  if(busy)fail('GENESIS_BUSY');if(!context)fail('GENESIS_IDENTITY_REQUIRED');if(kept)fail('GENESIS_SELECTION_KEPT');
  invalidate();const version=generation;busy=true;
  try{let art;for(let i=1;i<=input.count;i++){
   if(version!==generation)fail('GENESIS_CANCELLED');art=draw();
   await onBatch({art,index:i,count:input.count});
  }
  if(version!==generation)fail('GENESIS_CANCELLED');persist(art,null,false,null);return selection();
  }finally{busy=false;}
 }
 async function review(action,input){
  exact(input,action==='MINT_PHIL'?[]:action==='WITHDRAW_ETH'?['amountWei','recipient']:['tokenId','recipient']);
  if(busy)fail('GENESIS_BUSY');if(!context)fail('GENESIS_IDENTITY_REQUIRED');
  if(action==='MINT_PHIL'&&!selected)fail('GENESIS_ART_REQUIRED');
  if(action==='MINT_PHIL')keepSelection();
  invalidate();const version=generation,chosen=selected;
  const choice=Object.freeze(action==='MINT_PHIL'?{recipeId:chosen.recipeId,nameId:chosen.nameId}:{...input});
  const state=await readState(action,choice);
  if(version!==generation)fail('GENESIS_CANCELLED');
  const pkg=buildAuthorization(state.profile,{action,...(action==='MINT_PHIL'?{nameId:chosen.nameId}:{}),...(action==='WITHDRAW_ETH'?{amountWei:state.amountWei}:{tokenId:action==='MINT_PHIL'?chosen.recipeId:choice.tokenId}),
   recipient:action==='MINT_PHIL'?state.profile.account:choice.recipient,nonce:state.nonce,
   authorizationId:'0x'+randomBytes(32).toString('hex'),philNonce:'0x'+randomBytes(32).toString('hex'),
   validAfter:state.validAfter,validUntil:state.validUntil,...Object.fromEntries(['callGasLimit','verificationGasLimit','preVerificationGas','maxFeePerGas','maxPriorityFeePerGas'].map(k=>[k,state.gas[k]]))},state.creation||null);
  const art=action==='WITHDRAW_ETH'?null:action==='MINT_PHIL'?chosen:artReader.render(BigInt(state.recipeId),BigInt(state.nameId));
  const reviewId=randomBytes(32).toString('hex');active={reviewId,pkg,version};
  return Object.freeze({reviewId,...pkg.presentation,art,feeQuote:state.feeQuote,validUntil:pkg.authorization.validUntil});
 }
 async function confirm(input){
  exact(input,['reviewId']);if(busy||!active||input.reviewId!==active.reviewId)fail('GENESIS_REVIEW_STALE');
  const current=active;active=null;busy=true;
  try{return await completeExecution(current.pkg,()=>current.version===generation);}
  finally{busy=false;}
 }
 return Object.freeze({bindContext,reroll,rerollBatch,selection,keepSelection,releaseSelection,undoSelection,reviewMint:input=>review('MINT_PHIL',input),reviewTransfer:input=>review('TRANSFER_PHIL',input),reviewWithdrawal:input=>review('WITHDRAW_ETH',input),confirm,cancel:()=>{invalidate();return{cancelled:true};}});
}
module.exports={createProductionController};
