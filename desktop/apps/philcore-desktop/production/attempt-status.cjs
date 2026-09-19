'use strict';
const fs=require('node:fs');
const {inspectGenesisExecutionAttempt}=require('../../../genesis/runtime/attempt.cjs');
// Presentation-only warning. This never settles a journal or permits signing.
function hasUnresolvedAttempt(directory,account){
 for(const name of fs.readdirSync(directory).filter(n=>/^[0-9a-f]{64}\.jsonl$/.test(n)))try{
  const current=inspectGenesisExecutionAttempt({directory,name}),last=current.rows.at(-1);
  if(current.binding.account!==account)continue;
  if(current.state==='retired')continue;
  if(current.state==='confirmed'&&last.receipt?.success===true&&/^0x[0-9a-f]{64}$/.test(last.receipt.transactionHash))continue;
  if(current.state==='failed'&&last.receipt?.success===false&&last.diagnostic==='confirmed_execution_revert'&&/^0x[0-9a-f]{64}$/.test(last.receipt.transactionHash))continue;
  return true;
 }catch{return true;}
 return false;
}
module.exports={hasUnresolvedAttempt};
