'use strict';
const {Interface,ZeroAddress}=require('ethers'),{checkedHead}=require('./rpc.cjs'),{canonicalJSON}=require('../runtime/authorization.cjs');
const ep=new Interface(['event BeforeExecution()','event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const account=new Interface(['event ETHWithdrawn(bytes32 indexed authorizationId,address indexed recipient,uint256 amount)']);
const nft=new Interface(['event PhilMinted(address indexed account,uint256 indexed tokenId,uint256 indexed recipeId,uint256 nameId)','event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
const fail=()=>{throw Object.assign(Error('GENESIS_RECONCILIATION_REQUIRED'),{code:'GENESIS_RECONCILIATION_REQUIRED'});};
function events(receipt,address,abi,name){return receipt.logs.filter(l=>l.address.toLowerCase()===address).map((l,index)=>{try{const parsed=abi.parseLog(l);return parsed?{...parsed,receiptIndex:receipt.logs.indexOf(l)}:null}catch{return null}}).filter(l=>l?.name===name);}
async function reconcile({pkg,primary,independent,bundler}){
 const reported=await bundler('eth_getUserOperationReceipt',[pkg.userOperationHash]);if(reported===null)return{status:'pending',userOperationHash:pkg.userOperationHash};
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
module.exports={reconcile};
