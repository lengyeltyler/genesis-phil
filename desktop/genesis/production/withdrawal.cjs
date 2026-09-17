'use strict';
const {buildAuthorization}=require('../runtime/authorization.cjs'),{unpack}=require('./rpc.cjs'),{DUMMY_SIGNATURE}=require('./funding.cjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
async function prepareWithdrawal({profile,input,choice,creation,feeQuote,bundler,reader}){
 let amountWei=input.amountWei;
      // Fixed generous execution padding accommodates the recipient's final
      // amount without silently changing any field after the review is shown.
      const gas={...feeQuote.gas,callGasLimit:String(BigInt(feeQuote.gas.callGasLimit)+50000n),verificationGasLimit:String(BigInt(feeQuote.gas.verificationGasLimit)+50000n),preVerificationGas:String(BigInt(feeQuote.gas.preVerificationGas)+5000n)};
      const maximum=(BigInt(gas.callGasLimit)+BigInt(gas.verificationGasLimit)+BigInt(gas.preVerificationGas))*BigInt(gas.maxFeePerGas);
      if(maximum>BigInt(profile.feeCeilingWei))fail('GENESIS_BOUNDS');
      if(choice.amountWei==='max')amountWei=String(BigInt(feeQuote.availableWei)-maximum);
      if(BigInt(amountWei)<=0n||BigInt(amountWei)+maximum>BigInt(feeQuote.availableWei))fail('GENESIS_FUNDING');
      const finalPackage=buildAuthorization(profile,{...input,amountWei,...gas},creation);
      const estimate=await bundler('eth_estimateUserOperationGas',[unpack({...finalPackage.op,signature:DUMMY_SIGNATURE}),profile.entryPoint]);
      for(const key of ['callGasLimit','verificationGasLimit','preVerificationGas'])if(typeof estimate[key]!=='string'||!/^0x[0-9a-f]+$/i.test(estimate[key])||BigInt(estimate[key])>BigInt(gas[key]))fail('GENESIS_WITHDRAWAL_ESTIMATE_CHANGED');
      await reader.read(finalPackage);
      feeQuote=Object.freeze({...feeQuote,gas,principalWei:amountWei,requiredPrefundWei:String(maximum),operationMaximumWei:String(maximum),recommendedWei:String(maximum),safetyMarginWei:'0',marginPercent:0,mintWei:String((BigInt(gas.callGasLimit)+BigInt(gas.verificationGasLimit)+BigInt(gas.preVerificationGas)-BigInt(feeQuote.setupGas))*(BigInt(feeQuote.baseFeeWei)+BigInt(feeQuote.priorityFeeWei))),withinCap:true,additionalWei:'0',sufficient:true});
 return {amountWei,feeQuote};
}
module.exports={prepareWithdrawal};
