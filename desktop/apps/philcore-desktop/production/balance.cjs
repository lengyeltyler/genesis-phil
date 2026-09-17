 'use strict';
const {Interface}=require('ethers');
const {checkedHead}=require('../../../genesis/production/rpc.cjs');
const ep=new Interface(['function balanceOf(address) view returns(uint256)']);
async function readBalance({primary,independent,account,entryPoint}){
 const head=await checkedHead(primary,independent),tag=head.number;
 const call=[{to:entryPoint,data:ep.encodeFunctionData('balanceOf',[account])},tag];
 const [a,b,c,d]=await Promise.all([primary('eth_getBalance',[account,tag]),independent('eth_getBalance',[account,tag]),primary('eth_call',call),independent('eth_call',call)]);
 if(BigInt(a)!==BigInt(b)||c!==d)throw Object.assign(Error('GENESIS_PROVIDER_DISAGREEMENT'),{code:'GENESIS_PROVIDER_DISAGREEMENT'});
 const balance=BigInt(a),deposit=ep.decodeFunctionResult('balanceOf',c)[0];
 return{account,balanceWei:String(balance),depositWei:String(deposit),availableWei:String(balance+deposit),block:String(BigInt(tag)),observedAtMs:Date.now()};
}
module.exports={readBalance};
