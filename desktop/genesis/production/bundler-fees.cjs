'use strict';
const {toBeHex} = require('ethers');
function quantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(value)) throw Error('GENESIS_FEE_DATA_UNAVAILABLE');
  return BigInt(value);
}
async function bundlerFees(bundler, kind, baseFee) {
  const base = quantity(baseFee);
  if (kind === 'alchemy') {
    const priority = quantity(await bundler('rundler_maxPriorityFeePerGas', []));
    return {standard: {maxFeePerGas: toBeHex(2n * base + priority), maxPriorityFeePerGas: toBeHex(priority)}};
  }
  if (kind === 'pimlico') return bundler('pimlico_getUserOperationGasPrice', []);
  if (kind === 'public-candide') {
    const fees = await bundler('voltaire_feesPerGas', []);
    const max = quantity(fees?.maxFeePerGas), priority = quantity(fees?.maxPriorityFeePerGas);
    if (max === 0n || max < base + priority) throw Error('GENESIS_FEE_DATA_UNAVAILABLE');
    return {standard: {maxFeePerGas: toBeHex(max), maxPriorityFeePerGas: toBeHex(priority)}};
  }
  throw Error('GENESIS_BUNDLER_CONFIG');
}
module.exports = {bundlerFees};
