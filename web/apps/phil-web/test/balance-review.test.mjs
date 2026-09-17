import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Interface, id } from 'ethers';
import { createNetwork } from '../src/network.mjs';
import { deriveAccount, buildAuthorization } from '../src/protocol.mjs';
import { validatePersistedPackage } from '../src/persisted-package.mjs';
import { withdrawalAmount, reviewDetails } from '../src/review.mjs';
const config = JSON.parse(await readFile(new URL('../../philcore-desktop/production/candidate-public-config.json', import.meta.url)));
const header = {owner:'0x'+'11'.repeat(20), recoveryAuthority:'0x'+'22'.repeat(20), identityCommitment:id('web parity fixture')};
const {profile, creation} = deriveAccount(config, header, 'DESKTOP_GENESIS');
const ep = new Interface(['function balanceOf(address) view returns(uint256)']);
function fixture(disagree=false) {
  const calls=[];
  const primary=async(method, params)=> {
    calls.push(method);
    if(method==='eth_chainId') return '0x1';
    if(method==='eth_getBlockByNumber') return {number:'0x123',hash:id('block'),timestamp:'0x'+Math.floor(Date.now()/1000).toString(16),baseFeePerGas:'0x1'};
    if(method==='eth_getBalance') {assert.equal(params[0],profile.account);assert.equal(params[1],'0x123');return '0x10';}
    if(method==='eth_call') {assert.equal(params[0].to,config.entryPoint);return ep.encodeFunctionResult('balanceOf',[5n]);}
    throw Error('Unexpected RPC '+method);
  };
  return {calls, network:createNetwork(config,{apis:{primary,independent:(m,p)=>disagree&&m==='eth_getBalance'?'0x11':primary(m,p),bundler:()=>{throw Error('Balance must not depend on bundler');}}})};
}
test('Web balance uses Desktop independent balance and deposit reader even with closed mint gate',async()=>{
 const f=fixture(), result=await f.network.balance(header);
 assert.equal(result.balanceWei,'16');assert.equal(result.depositWei,'5');assert.equal(result.availableWei,'21');assert.equal(result.account,profile.account);
 assert(!f.calls.includes('eth_sendUserOperation'));
 await assert.rejects(fixture(true).network.balance(header),/PROVIDER_DISAGREEMENT/);
});
test('withdrawal input accepts exact ETH precision and never rounds or accepts exponent notation',()=>{
 assert.equal(withdrawalAmount('',true),'max');assert.equal(withdrawalAmount('.001',false),'1000000000000000');
 assert.equal(withdrawalAmount('0.000000000000000001',false),'1');
 for(const value of ['0','-1','1e-3','1.0000000000000000001','NaN','1,000',''])assert.throws(()=>withdrawalAmount(value,false));
});
for(const action of ['MINT_PHIL','WITHDRAW_ETH'])test('exact '+action+' review and persisted journal resist altered principal/recipient',()=>{
 const pkg=buildAuthorization(profile,{action,...(action==='WITHDRAW_ETH'?{amountWei:'1000000000000000'}:{tokenId:'1',nameId:'160'}),recipient:action==='MINT_PHIL'?profile.account:header.owner,nonce:'0',authorizationId:id('approval'),philNonce:id('nonce'),validAfter:'100',validUntil:'300',callGasLimit:'450000',verificationGasLimit:'2300000',preVerificationGas:'100000',maxFeePerGas:'1000000000',maxPriorityFeePerGas:'100000000'},creation);
 const copy=structuredClone(pkg);assert.deepEqual(validatePersistedPackage(copy),pkg);
 for(const field of ['principalWei','recipient']){const changed=structuredClone(pkg);changed.presentation[field]=field==='principalWei'?'2':header.recoveryAuthority;assert.throws(()=>validatePersistedPackage(changed),/JOURNAL_INVALID/);}
 const rows=Object.fromEntries(reviewDetails({pkg,feeQuote:{availableWei:'5000000000000000',additionalWei:'0'}},{name:pkg.presentation.name}));
 assert.equal(rows['From account'],profile.account);assert.equal(rows.Recipient,pkg.presentation.recipient);assert.equal(rows.Network,'Ethereum Mainnet');
 if(action==='WITHDRAW_ETH'){assert.equal(rows['You receive'],'0.001 ETH');assert.equal(rows.Artwork,undefined);}else{assert.match(rows.Artwork,/recipe 1/);assert.equal(rows['Mint price'],'0 ETH');}
});
