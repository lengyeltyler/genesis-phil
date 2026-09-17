'use strict';
// Read-only migration of an explicitly selected build-72 portable backup.
// This is never used to open local signing storage or as a platform fallback.
const crypto=require('node:crypto');
const {Wallet}=require('ethers');
const fail=()=>{throw Error('GENESIS_RECOVERY_INVALID');};
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const exact=(x,keys)=>{if(!x||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).sort().join('|')!==keys.slice().sort().join('|'))fail();};
function bytes(value,length){if(typeof value!=='string'||value.length>2000000||!/^[a-zA-Z0-9_-]+$/.test(value))fail();const b=Buffer.from(value,'base64url');if(b.toString('base64url')!==value||(length&&b.length!==length))fail();return b;}
function importBackupV1(b,passphrase,config,makeBinding,expectedAccount){
 if(typeof expectedAccount!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(expectedAccount))throw Error('GENESIS_LEGACY_ACCOUNT_REQUIRED');
 exact(b,['account','configuration','files','format','index','mode','version']);if(b.format!=='phil-genesis-encrypted-backup'||b.version!==1||!['DESKTOP_GENESIS','PHONE_REQUIRED'].includes(b.mode)||typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)fail();
 if(stable(b.configuration)!==stable({genesis:config.genesis,factory:config.factory,catalogCommitment:config.catalogCommitment,chainId:1}))fail();
 if(b.index?.format!=='philcore-desktop-local-identity-index-v1'||b.index.version!==1||b.index.identities?.length!==1)fail();const entry=b.index.identities[0];
 if(!/^identity_[a-f0-9]{12}_[a-f0-9]{8}$/.test(entry.identityId)||!/^0x[a-f0-9]{64}$/.test(entry.ownerCommitment)||entry.platformUnlockEnabled)fail();
 const files=['identity.encrypted.json','registry.encrypted.json','validator.encrypted.json','recovery-authority.encrypted.json'];exact(b.files,files);const records={};
 const formats=[['philcore-desktop-private-identity-envelope-v1','philcore-desktop-private-identity-v1'],['phil-device-identity-registry-encrypted','phil-device-identity-registry'],['philcore-desktop-device-vault-validator-envelope-v1','philcore-desktop-validator-public-metadata-v1'],['philcore-desktop-device-vault-recovery-authority-envelope-v1','philcore-desktop-recovery-authority-v1']];
 try{for(const file of files){if(typeof b.files[file]!=='string'||b.files[file].length>2000000)fail();const e=JSON.parse(b.files[file]);const role=formats[files.indexOf(file)];if(e.format!==role[0]||e.payloadFormat!==role[1])fail();
  if(e.version!==1||e.identityId!==entry.identityId||e.ownerCommitment!==entry.ownerCommitment||e.encryption?.algorithm!=='aes-256-gcm'||e.encryption.kdf?.providerKind!=='local-alpha-passphrase-scrypt-device-registry-key-test-only-v1'||stable(e.encryption.kdf.scrypt)!==stable({N:32768,r:8,p:1,keyLength:32}))fail();
  const key=crypto.scryptSync(passphrase,Buffer.concat([bytes(e.encryption.kdf.salt,16),Buffer.from(entry.ownerCommitment.slice(2),'hex')]),32,{N:32768,r:8,p:1,maxmem:128*1024*1024});let partial,plain;
  try{const d=crypto.createDecipheriv('aes-256-gcm',key,bytes(e.encryption.iv,12),{authTagLength:16});d.setAAD(Buffer.from(stable({format:e.format,version:e.version,identityId:e.identityId,ownerCommitment:e.ownerCommitment,payloadFormat:e.payloadFormat})));d.setAuthTag(bytes(e.encryption.tag,16));partial=d.update(bytes(e.ciphertext));plain=Buffer.concat([partial,d.final()]);records[file]=JSON.parse(plain.toString());if(records[file].format!==role[1]||records[file].ownerCommitment!==entry.ownerCommitment)fail();}finally{key.fill(0);partial?.fill(0);plain?.fill(0);}
 }
 if(records[files[0]].identityId!==entry.identityId||records[files[1]].philIdentity?.ownerCommitment!==entry.ownerCommitment||records[files[2]].purpose!=='erc4337_owner_validator_local_alpha'||records[files[3]].purpose!=='local_alpha_recovery_authority'||records[files[3]].ordinaryExecutionAuthority!==false)fail();
 const material={philSecret:records[files[0]].philSecret,validator:records[files[2]].privateKey,recovery:records[files[3]].privateKey};
 const header={identityId:entry.identityId,label:entry.label,identityCommitment:entry.ownerCommitment,owner:new Wallet(material.validator).address.toLowerCase(),recoveryAuthority:new Wallet(material.recovery).address.toLowerCase(),binding:null};header.binding=makeBinding(header,b.mode);if(header.binding.account!==b.account||header.binding.account!==expectedAccount.toLowerCase()||header.owner!==records[files[2]].publicOwnerAddress?.toLowerCase()||header.recoveryAuthority!==records[files[3]].publicRecoveryAddress?.toLowerCase())fail();
 return{header,material};
 }finally{for(const record of Object.values(records))for(const key of Object.keys(record))record[key]=null;}
}
module.exports={importBackupV1};
