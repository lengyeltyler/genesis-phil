'use strict';
const {Interface,ZeroAddress,keccak256}=require('ethers'),{checkedHead}=require('./rpc.cjs'),{canonicalJSON}=require('../runtime/authorization.cjs');
const ep=new Interface(['event BeforeExecution()','event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const epState=new Interface(['function getNonce(address,uint192) view returns(uint256)']);
const factoryState=new Interface(['function getAddress(address,address,bytes32,uint8) view returns(address)','function identityOf(address) view returns(bytes32)','function isGenesisAccount(address) view returns(bool)']);
const accountState=new Interface(['function identityCommitment() view returns(bytes32)','function owner() view returns(address)','function recoveryAuthority() view returns(address)','function genesis() view returns(address)','function entryPoint() view returns(address)','function authorityEpoch() view returns(uint64)','function authorizationMode() view returns(uint8)']);
const account=new Interface(['event ETHWithdrawn(bytes32 indexed authorizationId,address indexed recipient,uint256 amount)']);
const nft=new Interface(['event PhilMinted(address indexed account,uint256 indexed tokenId,uint256 indexed recipeId,uint256 nameId)','event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
const fail=()=>{throw Object.assign(Error('GENESIS_RECONCILIATION_REQUIRED'),{code:'GENESIS_RECONCILIATION_REQUIRED'});};
function events(receipt,address,abi,name){return receipt.logs.filter(l=>l.address.toLowerCase()===address).map((l,index)=>{try{const parsed=abi.parseLog(l);return parsed?{...parsed,receiptIndex:receipt.logs.indexOf(l)}:null}catch{return null}}).filter(l=>l?.name===name);}
async function same(primary,independent,method,params){const [a,b]=await Promise.all([primary(method,params),independent(method,params)]);if(canonicalJSON(a)!==canonicalJSON(b))fail();return a;}
async function call(primary,independent,to,abi,name,args,tag){const data=await same(primary,independent,'eth_call',[{to,data:abi.encodeFunctionData(name,args)},tag]);try{return abi.decodeFunctionResult(name,data);}catch{fail();}}
async function safeBlock(primary,independent){let a,b;try{[a,b]=await Promise.all([primary('eth_getBlockByNumber',['safe',false]),independent('eth_getBlockByNumber',['safe',false])]);}catch{return null;}if(!a||!b)return null;const critical=x=>({number:x.number,hash:x.hash,timestamp:x.timestamp});if(canonicalJSON(critical(a))!==canonicalJSON(critical(b))||!/^0x[0-9a-f]{64}$/i.test(a.hash)||!/^0x[0-9a-f]+$/i.test(a.number)||!/^0x[0-9a-f]+$/i.test(a.timestamp))return null;return a;}
async function validPredeployment(pkg,primary,independent,tag){const p=pkg.profile,code=await same(primary,independent,'eth_getCode',[p.account,tag]);if(code==='0x')return false;if(keccak256(code)!==p.accountCodeHash)fail();for(const [address,expected] of [[p.factory,p.factoryCodeHash],[p.entryPoint,p.entryPointCodeHash],[p.genesis,p.genesisCodeHash]]){const current=await same(primary,independent,'eth_getCode',[address,tag]);if(current==='0x'||keccak256(current)!==expected)fail();}
 const [predicted,identity,registered,accountIdentity,owner,recovery,genesis,entryPoint,epoch,mode]=await Promise.all([
  call(primary,independent,p.factory,factoryState,'getAddress',[p.owner,p.recoveryAuthority,p.identityCommitment,p.mode==='PHONE_REQUIRED'?2:1],tag),
  call(primary,independent,p.factory,factoryState,'identityOf',[p.account],tag),call(primary,independent,p.factory,factoryState,'isGenesisAccount',[p.account],tag),
  call(primary,independent,p.account,accountState,'identityCommitment',[],tag),call(primary,independent,p.account,accountState,'owner',[],tag),call(primary,independent,p.account,accountState,'recoveryAuthority',[],tag),
  call(primary,independent,p.account,accountState,'genesis',[],tag),call(primary,independent,p.account,accountState,'entryPoint',[],tag),call(primary,independent,p.account,accountState,'authorityEpoch',[],tag),call(primary,independent,p.account,accountState,'authorizationMode',[],tag),
 ]);
 if(predicted[0].toLowerCase()!==p.account||identity[0]!==p.identityCommitment||registered[0]!==true||accountIdentity[0]!==p.identityCommitment||owner[0].toLowerCase()!==p.owner||recovery[0].toLowerCase()!==p.recoveryAuthority||genesis[0].toLowerCase()!==p.genesis||entryPoint[0].toLowerCase()!==p.entryPoint||String(epoch[0])!==p.authorityEpoch||String(mode[0])!==(p.mode==='PHONE_REQUIRED'?'2':'1'))fail();return true;
}
async function unresolved({pkg,primary,independent,bundler}){
 let located=null,lookupAvailable=true;try{located=await bundler('eth_getUserOperationByHash',[pkg.userOperationHash]);}catch{lookupAvailable=false;}
 const block=await safeBlock(primary,independent);if(!block)return{status:'pending',userOperationHash:pkg.userOperationHash,reason:'safe_block_unavailable'};
 const nonce=BigInt((await call(primary,independent,pkg.profile.entryPoint,epState,'getNonce',[pkg.profile.account,0],block.number))[0]),expected=BigInt(pkg.op.nonce),evidence={safeBlockNumber:String(BigInt(block.number)),safeBlockHash:block.hash};
 if(nonce<expected)fail();
 if(nonce>expected)return{status:'retirable',reason:'nonce_advanced',userOperationHash:pkg.userOperationHash,...evidence};
 if(BigInt(block.timestamp)>BigInt(pkg.authorization.validUntil))return{status:'retirable',reason:'authorization_expired',userOperationHash:pkg.userOperationHash,...evidence};
 if(pkg.op.initCode!=='0x'&&await validPredeployment(pkg,primary,independent,block.number))return{status:'retirable',reason:'valid_account_predeployed',userOperationHash:pkg.userOperationHash,...evidence};
 return{status:'pending',userOperationHash:pkg.userOperationHash,reason:located===null?(lookupAvailable?'not_found_unexpired':'operation_lookup_unavailable'):'operation_found'};
}
async function reconcileHeldAttempt({binding,profile,primary,independent}){
 if(!binding||binding.format!=='phil-genesis-local-execution-attempt-v1'||binding.chainId!==profile.chainId||binding.account!==profile.account||!/^0x[0-9a-f]{64}$/.test(binding.userOperationHash))fail();
 const block=await safeBlock(primary,independent);if(!block)return{status:'pending',userOperationHash:binding.userOperationHash,reason:'safe_block_unavailable'};
 const nonce=BigInt((await call(primary,independent,profile.entryPoint,epState,'getNonce',[profile.account,0],block.number))[0]),expected=BigInt(binding.nonce),evidence={safeBlockNumber:String(BigInt(block.number)),safeBlockHash:block.hash};
 if(nonce<expected)fail();
 if(nonce>expected)return{status:'retirable',reason:'nonce_advanced',userOperationHash:binding.userOperationHash,...evidence};
 if(BigInt(block.timestamp)>BigInt(binding.validUntil))return{status:'retirable',reason:'authorization_expired',userOperationHash:binding.userOperationHash,...evidence};
 return{status:'pending',userOperationHash:binding.userOperationHash,reason:'no_operation_package'};
}
async function reconcile({pkg,primary,independent,bundler}){
 const reported=await bundler('eth_getUserOperationReceipt',[pkg.userOperationHash]);if(reported===null)return unresolved({pkg,primary,independent,bundler});
 const hash=reported?.receipt?.transactionHash;if(!/^0x[0-9a-f]{64}$/.test(hash))fail();
 const [a,b]=await Promise.all([primary('eth_getTransactionReceipt',[hash]),independent('eth_getTransactionReceipt',[hash])]);if(!a||!b)return{status:'pending',userOperationHash:pkg.userOperationHash};
 const critical=r=>({transactionHash:r.transactionHash,blockHash:r.blockHash,blockNumber:r.blockNumber,status:r.status,logs:r.logs.map(l=>({address:l.address.toLowerCase(),topics:l.topics,data:l.data,logIndex:l.logIndex,removed:l.removed===true}))});
 if(canonicalJSON(critical(a))!==canonicalJSON(critical(b))||a.transactionHash!==hash||a.status!=='0x1'||a.logs.some(l=>l.removed))fail();
 const head=await checkedHead(primary,independent),block=await independent('eth_getBlockByNumber',[a.blockNumber,false]);if(block?.hash!==a.blockHash||BigInt(head.number)<BigInt(a.blockNumber))fail();
 const matches=events(a,pkg.profile.entryPoint,ep,'UserOperationEvent').filter(l=>l.args.userOpHash===pkg.userOperationHash&&l.args.sender.toLowerCase()===pkg.profile.account&&l.args.nonce===BigInt(pkg.op.nonce)&&l.args.paymaster===ZeroAddress);if(matches.length!==1)fail();const event=matches[0];
 let tokenId=null;if(event.args.success){
  // EntryPoint emits one terminal event per operation. Restrict NFT evidence
  // to this operation, excluding validation and other operations in the bundle.
  let start=-1;for(let i=0;i<event.receiptIndex;i++){const log=a.logs[i];if(log.address.toLowerCase()!==pkg.profile.entryPoint)continue;let parsed;try{parsed=ep.parseLog(log)}catch{}if(['BeforeExecution','UserOperationEvent'].includes(parsed?.name))start=i;}
  if(start<0)fail();const operationReceipt={logs:a.logs.slice(start+1,event.receiptIndex)};
  if(pkg.presentation.action==='WITHDRAW_ETH'){
   const withdrawals=events(operationReceipt,pkg.profile.account,account,'ETHWithdrawn').filter(l=>l.args.authorizationId===pkg.authorization.authorizationId&&l.args.recipient.toLowerCase()===pkg.presentation.recipient&&String(l.args.amount)===pkg.presentation.principalWei);if(withdrawals.length!==1)fail();
  }else{
  if(pkg.presentation.action==='MINT_PHIL'){
   const minted=events(operationReceipt,pkg.profile.genesis,nft,'PhilMinted').filter(l=>l.args.account.toLowerCase()===pkg.profile.account&&String(l.args.recipeId)===pkg.presentation.recipeId&&String(l.args.nameId)===pkg.presentation.nameId);if(minted.length!==1)fail();tokenId=String(minted[0].args.tokenId);
  }else tokenId=pkg.presentation.tokenId;
  const transfers=events(operationReceipt,pkg.profile.genesis,nft,'Transfer').filter(l=>String(l.args.tokenId)===tokenId&&l.args.to.toLowerCase()===pkg.presentation.recipient&&l.args.from.toLowerCase()===(pkg.presentation.action==='MINT_PHIL'?ZeroAddress:pkg.profile.account));if(transfers.length!==1||BigInt(tokenId)<0n||BigInt(tokenId)>368n)fail();
 }
 }
 if(event.args.actualGasCost>BigInt(pkg.authorization.maximumFeeWei))fail();
 return{status:'confirmed',success:event.args.success,action:pkg.presentation.action,principalWei:pkg.presentation.principalWei,recipient:pkg.presentation.recipient,tokenId,transactionHash:hash,blockHash:a.blockHash,blockNumber:String(BigInt(a.blockNumber)),userOperationHash:pkg.userOperationHash,actualGasCost:String(event.args.actualGasCost),actualGasUsed:String(event.args.actualGasUsed),confirmations:String(BigInt(head.number)-BigInt(a.blockNumber)+1n)};
}
module.exports={reconcile,reconcileHeldAttempt};
