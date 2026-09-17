'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {createCustodyStore,createPlatformAdapter}=require('../src/main/platform-bound-custody.cjs');
const {deriveAccount}=require('./account.cjs');
const {importBackupV1}=require('./import-backup-v1.cjs');
const {CHANNELS}=require('../src/shared/bridge-contract.cjs');
const genesis=require('../../../genesis/runtime/authorization.cjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
function createProductionCustodyHost({root,config,safeStorage,presence,platform,observe}){
 const ordered=x=>JSON.stringify(Object.entries(x||{}).sort(([a],[b])=>a.localeCompare(b)));
 const configHash=crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
 const makeBinding=(h,mode)=>{if(!['DESKTOP_GENESIS','PHONE_REQUIRED'].includes(mode))fail('GENESIS_MODE');return{account:deriveAccount(config,h,mode).profile.account,mode,configurationHash:configHash,authorityEpoch:'1',policyEpoch:'1'};};
 const store=createCustodyStore({directory:path.join(root,'identities'),platform:platform||createPlatformAdapter(safeStorage),observe,makeBinding,sessionLifetimeMs:null,legacyBackupDecoder:(b,p,expected)=>importBackupV1(b,p,config,makeBinding,expected),
  validateBinding:h=>{if(ordered(h.binding)!==ordered(makeBinding(h,h.binding?.mode)))fail('GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED');},
  confirm:request=>{const a=presence.getAvailability();if(!a.available)fail('GENESIS_PLATFORM_REQUIRED');const result=presence.requestUserPresence({...request,policy:'device_owner_authentication'});return result.userPresenceVerified===true&&result.provider==='macos_local_authentication_helper';}
 });
 let selected=null;
 function snapshot(){const metadata=store.metadata();let context;try{context=store.context();}catch{}return{localIdentities:metadata?[{identityId:metadata.identityId,label:metadata.label}]:[],identity:metadata?{identityId:metadata.identityId,label:metadata.label}:null,session:{lockState:context?'unlocked':'locked',expiresAt:context?.sessionExpiresAt??null}};}
 async function invoke(channel,input={}){
  if(channel===CHANNELS.CREATE_LOCAL_IDENTITY){if(store.metadata())fail('GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED');selected=store.create(input).identityId;return snapshot();}
  if(channel===CHANNELS.OPEN_LOCAL_IDENTITY){store.lock();if(store.metadata()?.identityId!==input.identityId)fail('GENESIS_IDENTITY_OR_RECOVERY_REQUIRED');selected=input.identityId;return snapshot();}
  if(channel===CHANNELS.AUTHENTICATE_LOCAL){if(!selected)fail('GENESIS_IDENTITY_OR_RECOVERY_REQUIRED');try{store.unlock(input.passphrase);return{status:'authenticated'};}catch(e){store.lock();if(e.code==='GENESIS_UNLOCK_PLATFORM_REQUIRED')fail('GENESIS_UNLOCK_PLATFORM_REQUIRED');return{status:'failed'};}}
  if(channel===CHANNELS.UNLOCK_VAULT){store.context();return{status:'unlocked'};}
  if(channel===CHANNELS.LOCK_SESSION){store.lock();return snapshot();}
  fail('GENESIS_ACTION');
 }
 async function complete({pkg,host,isRequestCurrent}){
  if(!genesis.isBuiltAuthorization(pkg))fail('GENESIS_UNTRUSTED_PACKAGE');const c=store.context();
  if(pkg.profile.identityCommitment!==c.identityCommitment||pkg.profile.owner!==c.owner||pkg.profile.recoveryAuthority!==c.recoveryAuthority||pkg.profile.mode!==c.binding.mode||pkg.profile.account!==c.binding.account)fail('GENESIS_IDENTITY_BINDING');
  const current=()=>{const now=store.context();if(now.sessionId!==c.sessionId||isRequestCurrent()!==true)fail('GENESIS_SESSION_CHANGED');};let grant;
  const protectedHost={...host,assertSession:async x=>{current();await host.assertSession(x);current();},
   protectedConfirmation:async(_presentation,presentationDigest)=>{current();host.onProgress?.('approval');grant=await store.authorize({operationHash:pkg.userOperationHash,presentationDigest,presentationId:pkg.authorization.authorizationId,owner:c.owner});current();return true;},
   signHash:async(bytes,owner)=>{current();host.onProgress?.('signing');const signature=await store.signOnce(grant,bytes,owner);current();return signature;}};
  try{return await (host.networkName==='hardhat'?genesis.executeLocal:genesis.executeMainnet)(pkg,protectedHost);}finally{if(grant)store.revoke(grant);}
 }
 const recovery=Object.freeze({status:store.status,exportEncrypted:store.exportBackup,verifySaved:store.verifyBackup,
  restore:async(bytes,passphrase,expectedAccount)=>{if(fs.readdirSync(path.join(root,'accounts')).length||fs.readdirSync(path.join(root,'attempts')).length)fail('GENESIS_RESTORE_REQUIRES_FRESH_STATE');const header=store.restoreBackup(bytes,passphrase,expectedAccount);return{restored:true,account:header.binding.account,recoveryAuthority:header.recoveryAuthority,restartRequired:true,backupVerified:true,fundingBlocked:true};}});
 return Object.freeze({invoke,snapshot,recovery,_genesisIdentityContext:store.context,_completeGenesisExecution:complete,teardown:store.lock});
}
module.exports={createProductionCustodyHost};
