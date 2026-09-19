'use strict';
const fs = require('node:fs'), {createHash} = require('node:crypto');
const {canonicalJSON} = require('../runtime/authorization.cjs');
const {
  bindingForPackage,
  inspectGenesisExecutionAttempt,
  retireGenesisExecutionAttempt,
} = require('../runtime/attempt.cjs');
const fail = () => { throw Object.assign(Error('GENESIS_RECONCILIATION_REQUIRED'), {code:'GENESIS_RECONCILIATION_REQUIRED'}); };

// Receipt bookkeeping only: never creates/adopts a signing claim or releases
// its nonce. Call only after reconciliation checked the exact operation against
// both providers. Pending results preserve the original durable hold.
function settleReconciledAttempt({directory, pkg, receipt}) {
  if (receipt?.status === 'pending' && receipt.userOperationHash === pkg.userOperationHash) return;
  const binding = bindingForPackage(pkg);
  const key = createHash('sha256').update(`${binding.chainId}:${binding.account}:${binding.nonce}`).digest('hex');
  let current;
  try { current = inspectGenesisExecutionAttempt({directory,name:key+'.jsonl'}); }
  catch { fail(); }
  if (Object.keys(binding).some(field => current.binding[field] !== binding[field])) fail();
  if (receipt?.status === 'retirable') {
    if (!['submission_started','submitted'].includes(current.state) ||
        receipt.userOperationHash !== pkg.userOperationHash) fail();
    try { retireGenesisExecutionAttempt({directory,binding,expectedState:current.state,resolution:receipt}); }
    catch { fail(); }
    return;
  }
  if (receipt?.status !== 'confirmed' || receipt.userOperationHash !== pkg.userOperationHash ||
      typeof receipt.success !== 'boolean' ||
      !/^0x[0-9a-f]{64}$/.test(receipt.transactionHash) ||
      !/^0x[0-9a-f]{64}$/.test(receipt.blockHash) ||
      !/^[0-9]+$/.test(receipt.blockNumber) ||
      !/^[0-9]+$/.test(receipt.actualGasCost) || !/^[0-9]+$/.test(receipt.actualGasUsed) ||
      BigInt(receipt.actualGasCost) > BigInt(pkg.authorization.maximumFeeWei)) fail();
  const terminal = {state:receipt.success ? 'confirmed' : 'failed', receipt:{
    transactionHash:receipt.transactionHash, blockHash:receipt.blockHash,
    blockNumber:receipt.blockNumber, success:receipt.success,
    ...(!receipt.success ? {userOperationHash:receipt.userOperationHash,
      actualGasCost:receipt.actualGasCost, actualGasUsed:receipt.actualGasUsed} : {}),
  }, ...(!receipt.success ? {diagnostic:'confirmed_execution_revert'} : {})};
  if (['confirmed','failed'].includes(current.state)) {
    if (canonicalJSON(current.rows.at(-1)) !== canonicalJSON(terminal)) fail();
    return;
  }
  if (!['submission_started','submitted'].includes(current.state)) fail();
  let fd;
  try {
    fd = fs.openSync(current.location, fs.constants.O_RDWR | fs.constants.O_APPEND |
      fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const st=fs.fstatSync(fd), disk=fs.lstatSync(current.location);
    if (!st.isFile() || st.nlink!==1 || st.uid!==process.getuid() || st.mode&0o077 ||
        st.ino!==disk.ino || st.dev!==disk.dev || st.size!==Buffer.byteLength(current.content) ||
        fs.readFileSync(fd,'utf8')!==current.content) fail();
    fs.writeFileSync(fd,JSON.stringify(terminal)+'\n');fs.fsyncSync(fd);
  } catch { fail(); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
module.exports = {settleReconciledAttempt};
