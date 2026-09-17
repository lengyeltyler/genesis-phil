'use strict';
const { AbiCoder, Interface, keccak256, getCreate2Address, concat, toBeHex, zeroPadValue } = require('ethers');
const { validateProfile } = require('../../../genesis/runtime/authorization.cjs');
const abi = AbiCoder.defaultAbiCoder();
const factoryABI = new Interface(['function createAccount(address,address,bytes32,uint8)']);
function deriveAccount(config, identity, mode) {
  if (!['DESKTOP_GENESIS', 'PHONE_REQUIRED'].includes(mode)) throw Error('GENESIS_MODE');
  const number = mode === 'PHONE_REQUIRED' ? 2 : 1;
  const args = [config.entryPoint, config.genesis, config.genesisCodeHash, identity.owner,
    identity.recoveryAuthority, identity.identityCommitment, number, 1, config.feeCeilingWei];
  const creationCode = concat([config.accountCreationCode, abi.encode(
    ['address','address','bytes32','address','address','bytes32','uint8','uint256','uint256'], args)]);
  const salt = keccak256(abi.encode(['string','uint256','bytes32','uint8'], ['PHIL_GENESIS_ACCOUNT_V1',1,identity.identityCommitment,number]));
  const account = getCreate2Address(config.factory, salt, keccak256(creationCode)).toLowerCase();
  const values = { _entryPoint: config.entryPoint, genesis: config.genesis, genesisCodeHash: config.genesisCodeHash,
    identityCommitment: identity.identityCommitment, authorizationMode: toBeHex(number), chainId: '0x01', feeCeilingWei: toBeHex(BigInt(config.feeCeilingWei)) };
  const runtime = Buffer.from(config.accountRuntimeTemplate.slice(2), 'hex');
  for (const [name, references] of Object.entries(config.accountImmutables)) {
    if (!values[name]) throw Error('GENESIS_ACCOUNT_TEMPLATE');
    for (const {start,length} of references) {
      if (length !== 32) throw Error('GENESIS_ACCOUNT_TEMPLATE');
      Buffer.from(zeroPadValue(values[name], 32).slice(2), 'hex').copy(runtime, start);
    }
  }
  const profile = { version: 'phil-genesis-profile-v1', identityCommitment: identity.identityCommitment,
    account, factory: config.factory, entryPoint: config.entryPoint, chainId: '1', genesis: config.genesis,
    accountCodeHash: keccak256(runtime), factoryCodeHash: config.factoryCodeHash,
    entryPointCodeHash: config.entryPointCodeHash, genesisCodeHash: config.genesisCodeHash,
    rendererCodeHash: config.genesisCodeHash, catalogCommitment: config.catalogCommitment,
    owner: identity.owner, recoveryAuthority: identity.recoveryAuthority, mode, authorityEpoch: '1',
    policyEpoch: '1', feeCeilingWei: config.feeCeilingWei, device: null };
  // Phone profiles require an authenticated enrollment before they are valid.
  // Derivation never creates a Desktop substitute for a phone account.
  if (mode === 'DESKTOP_GENESIS') validateProfile(profile);
  return { profile, runtime: '0x' + runtime.toString('hex'),
    creation: { initCode: concat([config.factory, factoryABI.encodeFunctionData('createAccount', [identity.owner, identity.recoveryAuthority, identity.identityCommitment, number])]).toLowerCase() } };
}
module.exports = { deriveAccount };
