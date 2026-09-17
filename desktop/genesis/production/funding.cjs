'use strict';
const {Interface,toBeHex}=require('ethers'),{checkedHead,unpack}=require('./rpc.cjs'),{quoteFunding}=require('../preview/funding.cjs');
const {bundlerFees}=require('./bundler-fees.cjs');
const ep=new Interface(['function balanceOf(address) view returns(uint256)']);
const DUMMY_SIGNATURE='0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';
function integer(x){if(typeof x!=='string'||x.length>66||!/^0x[0-9a-f]+$/i.test(x))throw Error('GENESIS_FEE_DATA_UNAVAILABLE');return BigInt(x);}
async function liveFunding({primary,independent,bundler,profile,operation,accountDeployed,bundlerKind="pimlico",action="MINT_PHIL",principalWei="0"}){
 const observedAtMs=Date.now();
 const block=await checkedHead(primary,independent),tag=block.number;
 const [recommendation,balance,deposit,mintEstimate,creationEstimate]=await Promise.all([bundlerFees(bundler,bundlerKind,block.baseFeePerGas),primary('eth_getBalance',[profile.account,tag]),primary('eth_call',[{to:profile.entryPoint,data:ep.encodeFunctionData('balanceOf',[profile.account])},tag]),bundler('eth_estimateUserOperationGas',[unpack({...operation,signature:DUMMY_SIGNATURE}),profile.entryPoint,{[profile.account]:{balance:toBeHex(BigInt(profile.feeCeilingWei)+BigInt(principalWei))}}]),accountDeployed?Promise.resolve('0x0'):primary('eth_estimateGas',[{from:profile.entryPoint,to:profile.factory,data:'0x'+operation.initCode.slice(42)},tag])]);
 // State override funds ONLY the simulated sender, bounded by its policy fee
 // ceiling. The user still sees the actual balances from both providers.
 const [peerBalance,peerDeposit]=await Promise.all([independent('eth_getBalance',[profile.account,tag]),independent('eth_call',[{to:profile.entryPoint,data:ep.encodeFunctionData('balanceOf',[profile.account])},tag])]);
 if(integer(peerBalance)!==integer(balance)||peerDeposit!==deposit)throw Error('GENESIS_PROVIDER_DISAGREEMENT');
 const speed=recommendation?.standard;if(!speed)throw Error('GENESIS_FEE_DATA_UNAVAILABLE');
 const max=integer(speed.maxFeePerGas),priority=integer(speed.maxPriorityFeePerGas),base=integer(block.baseFeePerGas);if(max<base+priority)throw Error('GENESIS_FEE_DATA_UNAVAILABLE');
 const estimate=x=>{const call=integer(x.callGasLimit),verification=integer(x.verificationGasLimit),pre=integer(x.preVerificationGas);if(!call||!verification||call+verification+pre>16000000n)throw Error('GENESIS_FEE_DATA_UNAVAILABLE');return{call,verification,pre,total:call+verification+pre};};
 const mint=estimate(mintEstimate);
 if(!["MINT_PHIL","TRANSFER_PHIL","WITHDRAW_ETH"].includes(action))throw Error("GENESIS_ACTION");
 // v0.7 verificationGas includes creation. An independent factory estimate
 // removes transaction intrinsic gas to show disjoint setup/operation costs.
 const factoryData=Buffer.from(operation.initCode.slice(42),'hex');const intrinsic=21000n+Array.from(factoryData).reduce((n,b)=>n+(b===0?4n:16n),0n);
 const setup=accountDeployed?0n:integer(creationEstimate)-intrinsic;if(setup<0n||setup>mint.verification)throw Error('GENESIS_FEE_DATA_UNAVAILABLE');
 const quote=quoteFunding({environment:'mainnet',chainId:'1',observedAtMs,source:'provider-and-bundler',baseFeeWei:String(base),priorityFeeWei:String(priority),maxFeePerGasWei:String(max),setupGas:String(setup),mintGas:String(mint.total-setup),transferGas:action!=="MINT_PHIL"?String(mint.total):"0",action,balanceWei:String(integer(balance)),depositWei:String(ep.decodeFunctionResult('balanceOf',deposit)[0]),feeCeilingWei:profile.feeCeilingWei,accountDeployed,requiredPrefundWei:String(mint.total*max)});
 const required=BigInt(principalWei)+BigInt(quote.recommendedWei),available=BigInt(quote.availableWei);
 return Object.freeze({...quote,principalWei,additionalWei:String(required>available?required-available:0n),sufficient:available>=required,account:profile.account,blockNumber:String(integer(tag)),blockHash:block.hash,setupIncludedInMint:false,gas:{callGasLimit:String(mint.call),verificationGasLimit:String(mint.verification),preVerificationGas:String(mint.pre),maxFeePerGas:String(max),maxPriorityFeePerGas:String(priority)}});
}
module.exports={liveFunding,DUMMY_SIGNATURE};
