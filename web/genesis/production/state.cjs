'use strict';
const {Interface,keccak256,getAddress,getCreateAddress}=require('ethers'),{checkedHead}=require('./rpc.cjs'),{validateProfile,digest}=require('../runtime/authorization.cjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
const nft=new Interface(['function renderer() view returns(address)','function catalogHash() view returns(bytes32)','function accountFactory() view returns(address)','function isMintable(uint256) view returns(bool)','function hasMinted(address) view returns(bool)','function ownerOf(uint256) view returns(address)','function recipeIdOf(uint256) view returns(uint256)']);
const names=new Interface(['function isNameAvailable(uint256) view returns(bool)']);
const mintAccessGetter=new Interface(['function mintAccess() view returns(address)']);
const mintAccess=new Interface(['function canMint(address) view returns(bool)','function publicOpensAt() view returns(uint256)']);
const factory=new Interface(['function getAddress(address,address,bytes32,uint8) view returns(address)','function identityOf(address) view returns(bytes32)','function isGenesisAccount(address) view returns(bool)']);
const account=new Interface(['function identityCommitment() view returns(bytes32)','function owner() view returns(address)','function recoveryAuthority() view returns(address)','function genesis() view returns(address)','function entryPoint() view returns(address)','function authorityEpoch() view returns(uint64)','function authorizationMode() view returns(uint8)','function recovery() view returns(address pendingOwner,uint48 executableAt,uint48 expiresAt,bytes32 id)']);
const ep=new Interface(['function getNonce(address,uint192) view returns(uint256)','function balanceOf(address) view returns(uint256)','function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)) view returns(bytes32)']);
// Limit parallel reads per provider without sharing results between snapshots.
function bounded(provider){let active=0;const queue=[];function drain(){while(active<4&&queue.length){const job=queue.shift();active++;Promise.resolve().then(()=>provider(...job.args)).then(job.resolve,job.reject).finally(()=>{active--;drain();});}}return(...args)=>new Promise((resolve,reject)=>{queue.push({args,resolve,reject});drain();});}
function createStateReader({primary,independent,profile}){
 validateProfile(profile);profile=JSON.parse(JSON.stringify(profile));const binding=digest(profile);
 async function readSnapshot(pkg,{requireFunds=true}={}){
  const started=Date.now();
  if(digest(pkg.profile)!==binding)fail('GENESIS_PROFILE_CHANGED');
  const p=profile,head=await checkedHead(primary,independent),tag=head.number;
  const a=bounded(primary),b=bounded(independent);
  const call=async(api,to,method,args=[])=>{const params=[{to,data:api.encodeFunctionData(method,args)},tag],values=await Promise.all([a('eth_call',params),b('eth_call',params)]);if(values[0]!==values[1])fail('GENESIS_PROVIDER_DISAGREEMENT');return api.decodeFunctionResult(method,values[0]);};
  const code=async(address,expected,emptyAllowed=false)=>{const [x,y]=await Promise.all([a('eth_getCode',[address,tag]),b('eth_getCode',[address,tag])]);if(x!==y)fail('GENESIS_PROVIDER_DISAGREEMENT');if(x==='0x'&&emptyAllowed)return false;if(x==='0x'||keccak256(x)!==expected)fail('GENESIS_CODE_CHANGED');return true;};
  const [deployed]=await Promise.all([code(p.account,p.accountCodeHash,true),code(p.factory,p.factoryCodeHash),code(p.entryPoint,p.entryPointCodeHash),code(p.genesis,p.genesisCodeHash)]);
  if(!deployed&&(pkg.op.initCode==='0x'||!['MINT_PHIL','WITHDRAW_ETH'].includes(pkg.presentation.action)||p.authorityEpoch!=='1'))fail('GENESIS_CREATION_BINDING');
  if(deployed&&pkg.op.initCode!=='0x')fail('GENESIS_STATE_CHANGED');
  const minting=pkg.presentation.action==='MINT_PHIL',withdrawing=pkg.presentation.action==='WITHDRAW_ETH';
  const keys=['identityCommitment','owner','recoveryAuthority','genesis','entryPoint','authorityEpoch','authorizationMode'];
  const [renderer,catalog,accountFactory,nonce,operationHash,deposit,balances,identity,mintState]=await Promise.all([
   call(nft,p.genesis,'renderer'),call(nft,p.genesis,'catalogHash'),call(nft,p.genesis,'accountFactory'),
   call(ep,p.entryPoint,'getNonce',[p.account,0]),call(ep,p.entryPoint,'getUserOpHash',[pkg.op]),call(ep,p.entryPoint,'balanceOf',[p.account]),
   Promise.all([a('eth_getBalance',[p.account,tag]),b('eth_getBalance',[p.account,tag])]),
   deployed?Promise.all([...keys.map(key=>call(account,p.account,key)),call(account,p.account,'recovery'),call(factory,p.factory,'identityOf',[p.account]),call(factory,p.factory,'isGenesisAccount',[p.account])]):call(factory,p.factory,'getAddress',[p.owner,p.recoveryAuthority,p.identityCommitment,p.mode==='PHONE_REQUIRED'?2:1]),
   minting?Promise.all([call(nft,p.genesis,'isMintable',[pkg.presentation.recipeId]),call(nft,p.genesis,'hasMinted',[p.account]),call(mintAccessGetter,p.genesis,'mintAccess'),call(names,getCreateAddress({from:p.genesis,nonce:1}),'isNameAvailable',[pkg.presentation.nameId])]):withdrawing?Promise.resolve(null):call(nft,p.genesis,'ownerOf',[pkg.presentation.tokenId])
  ]);
  if(renderer[0].toLowerCase()!==p.genesis||p.rendererCodeHash!==p.genesisCodeHash||catalog[0]!==p.catalogCommitment||accountFactory[0].toLowerCase()!==p.factory)fail('GENESIS_ART_CHANGED');
  if(!deployed){if(identity[0].toLowerCase()!==p.account)fail('GENESIS_CREATION_BINDING');}
  else{
   const expected=[p.identityCommitment,p.owner,p.recoveryAuthority,p.genesis,p.entryPoint,p.authorityEpoch,p.mode==='PHONE_REQUIRED'?'2':'1'];
   if(expected.some((value,i)=>String(identity[i][0]).toLowerCase()!==value)||identity[7][0]!==getAddress('0x'+'0'.repeat(40))||identity[8][0]!==p.identityCommitment||!identity[9][0])fail('GENESIS_STATE_CHANGED');
  }
  if(String(nonce[0])!==pkg.op.nonce||operationHash[0]!==pkg.userOperationHash)fail('GENESIS_OPERATION_CHANGED');
  if(minting){
   if(!mintState[0][0]||mintState[1][0])fail('GENESIS_MINT_UNAVAILABLE');
   if(!mintState[3][0])fail('GENESIS_NAME_TAKEN');
   const access=mintState[2][0];if(!(await call(mintAccess,access,'canMint',[p.account]))[0]){
    if(BigInt(head.timestamp)<(await call(mintAccess,access,'publicOpensAt'))[0])fail('GENESIS_PRIVATE_MINT_WINDOW');
    fail('GENESIS_PUBLIC_ALLOCATION_EXHAUSTED');
   }
  }else if(!withdrawing&&mintState[0].toLowerCase()!==p.account)fail('GENESIS_OWNER_CHANGED');
  if(BigInt(balances[0])!==BigInt(balances[1]))fail('GENESIS_PROVIDER_DISAGREEMENT');
  const balance=BigInt(balances[0]),maximum=BigInt(pkg.authorization.maximumFeeWei),fee=BigInt(pkg.op.gasFees)&((1n<<128n)-1n),priority=BigInt(pkg.op.gasFees)>>128n;
  if(requireFunds&&balance+deposit[0]<maximum+BigInt(pkg.presentation.principalWei))fail('GENESIS_FUNDING');
  // A new block is normal. Recheck the ORIGINAL height's canonical hash on
  // both providers, then bound the snapshot's age against their current head.
  const [finalHead,canonical,peer]=await Promise.all([checkedHead(primary,independent),primary('eth_getBlockByNumber',[tag,false]),independent('eth_getBlockByNumber',[tag,false])]);
  if(!canonical||!peer||canonical.hash?.toLowerCase()!==peer.hash?.toLowerCase()||canonical.number!==tag||peer.number!==tag)fail('GENESIS_PROVIDER_DISAGREEMENT');
  if(canonical.hash.toLowerCase()!==head.hash.toLowerCase())fail('GENESIS_STATE_REORG');
  const lag=BigInt(finalHead.number)-BigInt(tag);
  if(lag<0n||lag>2n||Date.now()-started>30000)fail('GENESIS_SNAPSHOT_EXPIRED');
  if(BigInt(finalHead.baseFeePerGas)+priority>fee)fail('GENESIS_FEE_DATA_UNAVAILABLE');
  return Object.freeze({deployed,balanceWei:String(balance),depositWei:String(deposit[0]),blockNumber:String(BigInt(tag)),blockHash:head.hash,observedAtMs:Date.now()});
 }
 async function read(pkg,options){
  for(let attempt=0;attempt<3;attempt++)try{return await readSnapshot(pkg,options);}catch(error){
   if(!['GENESIS_STATE_REORG','GENESIS_SNAPSHOT_EXPIRED'].includes(error.code))throw error;
   if(attempt===2)fail('GENESIS_STATE_REFRESH_REQUIRED');
  }
 }
 return Object.freeze({assertFresh:pkg=>read(pkg),read});
}
module.exports={createStateReader};
