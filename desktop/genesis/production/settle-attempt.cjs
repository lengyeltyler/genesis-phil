'use strict';
const fs = require('node:fs'), path = require('node:path'), {createHash} = require('node:crypto');
const {canonicalJSON} = require('../runtime/authorization.cjs');
const fail = () => { throw Object.assign(Error('GENESIS_RECONCILIATION_REQUIRED'), {code:'GENESIS_RECONCILIATION_REQUIRED'}); };

// Receipt bookkeeping only: never creates/adopts a signing claim or releases
// its nonce. Call only after reconciliation checked the exact operation against
// both providers. Pending results preserve the original durable hold.
function settleReconciledAttempt({directory, pkg, receipt}) {
  if (receipt?.status === 'pending' && receipt.userOperationHash === pkg.userOperationHash) return;
  if (receipt?.status !== 'confirmed' || receipt.userOperationHash !== pkg.userOperationHash ||
      typeof receipt.success !== 'boolean' ||
      !/^0x[0-9a-f]{64}$/.test(receipt.transactionHash) ||
      !/^0x[0-9a-f]{64}$/.test(receipt.blockHash) ||
      !/^[0-9]+$/.test(receipt.blockNumber) ||
      !/^[0-9]+$/.test(receipt.actualGasCost) || !/^[0-9]+$/.test(receipt.actualGasUsed) ||
      BigInt(receipt.actualGasCost) > BigInt(pkg.authorization.maximumFeeWei)) fail();
  const binding = {
    format:'phil-genesis-local-execution-attempt-v1', chainId:pkg.profile.chainId,
    account:pkg.profile.account, nonce:pkg.op.nonce,
    authorizationId:pkg.authorization.authorizationId, envelopeDigest:pkg.presentationDigest,
    userOperationHash:pkg.userOperationHash, maximumTotalFeeWei:pkg.authorization.maximumFeeWei,
    validUntil:pkg.authorization.validUntil, state:'signing_started',
  };
  const terminal = {state:receipt.success ? 'confirmed' : 'failed', receipt:{
    transactionHash:receipt.transactionHash, blockHash:receipt.blockHash,
    blockNumber:receipt.blockNumber, success:receipt.success,
    ...(!receipt.success ? {userOperationHash:receipt.userOperationHash,
      actualGasCost:receipt.actualGasCost, actualGasUsed:receipt.actualGasUsed} : {}),
  }, ...(!receipt.success ? {diagnostic:'confirmed_execution_revert'} : {})};
  let fd;
  try {
    const dir = fs.lstatSync(directory);
    if (!path.isAbsolute(directory) || !dir.isDirectory() || dir.isSymbolicLink() ||
        dir.uid !== process.getuid() || dir.mode & 0o077 || fs.realpathSync(directory) !== directory) fail();
    const key = createHash('sha256').update(`${binding.chainId}:${binding.account}:${binding.nonce}`).digest('hex');
    const file = path.join(directory, key+'.jsonl');
    fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || st.uid !== process.getuid() || st.mode & 0o077 || st.size > 16384) fail();
    const bytes = Buffer.alloc(st.size);
    if (fs.readSync(fd,bytes,0,bytes.length,0) !== bytes.length) fail();
    const content = bytes.toString('utf8');
    if (!content.endsWith('\n')) fail();
    const rows = content.slice(0,-1).split('\n').map(JSON.parse);
    if (![3,4].includes(rows.length) || canonicalJSON(rows[0]) !== canonicalJSON(binding) ||
        canonicalJSON(rows[1]) !== canonicalJSON({state:'signed'}) ||
        canonicalJSON(rows[2]) !== canonicalJSON({state:'submission_started'})) fail();
    if (rows.length === 4) {
      if (canonicalJSON(rows[3]) !== canonicalJSON(terminal)) fail();
      return; // Repeat lookups never append another terminal record.
    }
    const now = fs.lstatSync(file), current = Buffer.alloc(st.size);
    if (!now.isFile() || now.ino !== st.ino || now.dev !== st.dev || now.nlink !== 1 ||
        now.uid !== st.uid || now.mode !== st.mode || now.size !== st.size ||
        fs.readSync(fd,current,0,current.length,0) !== current.length || current.toString('utf8') !== content) fail();
    fs.writeFileSync(fd, JSON.stringify(terminal)+'\n');
    fs.fsyncSync(fd);
  } catch { fail(); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
module.exports = {settleReconciledAttempt};
