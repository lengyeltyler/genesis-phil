'use strict';
// Pure quote arithmetic. No signer, transaction, RPC URL, or funding capability.
const fail=code=>{throw Object.assign(Error(code),{code})};
const uint=x=>{if(typeof x!=='string'||!/^\d+$/.test(x))fail('GENESIS_FEE_DATA_UNAVAILABLE');return BigInt(x)};
function quoteFunding(data,{nowMs=Date.now(),maximumAgeMs=30000}={}) {
 if(!data||!['local','mainnet'].includes(data.environment)||data.chainId!==(data.environment==='local'?'31337':'1')||!Number.isSafeInteger(data.observedAtMs)||data.observedAtMs>nowMs+1000||nowMs-data.observedAtMs>maximumAgeMs||data.source!==(data.environment==='local'?'local-provider-and-measurements':'provider-and-bundler'))fail('GENESIS_FEE_DATA_UNAVAILABLE');
 const base=uint(data.baseFeeWei),priority=uint(data.priorityFeeWei),max=uint(data.maxFeePerGasWei);
 if(max<base+priority||max===0n)fail('GENESIS_FEE_DATA_UNAVAILABLE');
 const setup=uint(data.setupGas),mint=uint(data.mintGas),transfer=uint(data.transferGas),balance=uint(data.balanceWei),deposit=uint(data.depositWei),cap=uint(data.feeCeilingWei);
 if(data.accountDeployed&&setup!==0n||mint===0n||(transfer===0n&&data.action!=="MINT_PHIL")||setup+mint>16000000n)fail('GENESIS_FEE_DATA_UNAVAILABLE');
 // Components MUST be disjoint bundler estimates; deployment is not counted twice.
 const setupWei=setup*(base+priority),mintWei=mint*(base+priority),transferWei=transfer*(base+priority);
 const marginBps=2500n,operationMaximumWei=(setup+mint)*max;
 const prefund=uint(data.requiredPrefundWei??"0"),recommendedWei=((operationMaximumWei>prefund?operationMaximumWei:prefund)*(10000n+marginBps)+9999n)/10000n,availableWei=balance+deposit;
 return Object.freeze({environment:data.environment,chainId:data.chainId,observedAtMs:data.observedAtMs,baseFeeWei:String(base),priorityFeeWei:String(priority),maxFeePerGasWei:String(max),setupGas:String(setup),mintGas:String(mint),transferGas:String(transfer),setupWei:String(setupWei),mintWei:String(mintWei),transferWei:String(transferWei),recommendedWei:String(recommendedWei),additionalWei:String(recommendedWei>availableWei?recommendedWei-availableWei:0n),availableWei:String(availableWei),balanceWei:String(balance),depositWei:String(deposit),requiredPrefundWei:String(prefund),operationMaximumWei:String(operationMaximumWei),safetyMarginWei:String(recommendedWei-(operationMaximumWei>prefund?operationMaximumWei:prefund)),expiresAtMs:data.observedAtMs+maximumAgeMs,marginPercent:25,reserveWei:'0',feeCeilingWei:String(cap),withinCap:recommendedWei<=cap,sufficient:availableWei>=recommendedWei,source:data.source});
}
async function refreshFunding(adapter,request) {
 if(!adapter||typeof adapter.readNetwork!=='function'||typeof adapter.estimateGas!=='function')fail('GENESIS_FEE_DATA_UNAVAILABLE');
 try {const network=await adapter.readNetwork(request),gas=await adapter.estimateGas(request);return quoteFunding({...network,...gas,environment:request.environment,chainId:network.chainId});}catch{fail('GENESIS_FEE_DATA_UNAVAILABLE')}
}
function assertFundingReady(quote,{nowMs=Date.now(),approvedMaximumWei,requiredMaximumWei}={}) {
 if(!quote||nowMs-quote.observedAtMs>30000||quote.observedAtMs>nowMs+1000)fail('GENESIS_FEE_DATA_UNAVAILABLE');
 const required=uint(requiredMaximumWei??quote.recommendedWei);
 if(!quote.withinCap||required>uint(quote.feeCeilingWei)||required>uint(approvedMaximumWei)||required>uint(quote.availableWei))fail('GENESIS_FUNDING');
}
module.exports={quoteFunding,refreshFunding,assertFundingReady};
