'use strict';
// Shared Desktop custody. Existing identity derivation, AES-GCM and scrypt are
// retained. Local authority has only an OS-wrapped key; portable recovery is an
// explicitly exported, separately passphrase-encrypted artifact.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {AbiCoder,Wallet,keccak256,toUtf8Bytes}=require('ethers');
const abi=AbiCoder.defaultAbiCoder(),KDF=Object.freeze({N:32768,r:8,p:1,keyLength:32});
const fail=(code='GENESIS_CUSTODY_INVALID')=>{throw Object.assign(Error(code),{code});};
function checkedStage(code,fn){try{return fn();}catch(e){if(e.code==='GENESIS_CUSTODY_INVALID')fail(code);throw e;}}
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const exact=(x,keys)=>{if(!x||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).sort().join('|')!==keys.slice().sort().join('|'))fail();};
function b64(x,size){if(typeof x!=='string'||x.length>2000000||!/^[A-Za-z0-9_-]+$/.test(x))fail();const b=Buffer.from(x,'base64url');if(b.toString('base64url')!==x||(size!==undefined&&b.length!==size))fail();return b;}
function encrypt(key,plain,aad){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});c.setAAD(Buffer.from(canonical(aad)));const text=Buffer.from(canonical(plain));try{return{iv:iv.toString('base64url'),tag:null,ciphertext:Buffer.concat([c.update(text),c.final()]).toString('base64url'),...{tag:c.getAuthTag().toString('base64url')}};}finally{text.fill(0);}}
function decrypt(key,e,aad){exact(e,['iv','tag','ciphertext']);const d=crypto.createDecipheriv('aes-256-gcm',key,b64(e.iv,12),{authTagLength:16});d.setAAD(Buffer.from(canonical(aad)));d.setAuthTag(b64(e.tag,16));let plain,partial;try{partial=d.update(b64(e.ciphertext));plain=Buffer.concat([partial,d.final()]);return JSON.parse(plain.toString('utf8'));}catch{fail();}finally{partial?.fill(0);plain?.fill(0);}}
function passKey(passphrase,salt,commitment){if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)fail('GENESIS_BACKUP_SECRET');return crypto.scryptSync(passphrase,Buffer.concat([salt,Buffer.from(commitment.slice(2),'hex')]),32,{...KDF,maxmem:128*1024*1024});}
function sealPass(value,passphrase,header,purpose){const salt=crypto.randomBytes(16),key=passKey(passphrase,salt,header.identityCommitment);try{return{salt:salt.toString('base64url'),kdf:KDF,envelope:encrypt(key,value,{header,purpose})};}finally{key.fill(0);}}
function openPass(e,passphrase,header,purpose){exact(e,['salt','kdf','envelope']);if(canonical(e.kdf)!==canonical(KDF))fail();const key=passKey(passphrase,b64(e.salt,16),header.identityCommitment);try{return decrypt(key,e.envelope,{header,purpose});}finally{key.fill(0);}}
function commitment(secret){if(!/^0x[0-9a-f]{64}$/.test(secret)||BigInt(secret)===0n||BigInt(secret)>=(1n<<251n))fail();const root=keccak256(abi.encode(['bytes32','bytes32'],[keccak256(toUtf8Bytes('PHIL_IDENTITY_ROOT_V1')),secret]));return keccak256(abi.encode(['bytes32','bytes32'],[keccak256(toUtf8Bytes('PHIL_OWNER_COMMITMENT_CANONICAL_V1')),root]));}
function walletKey(){for(;;){const bytes=crypto.randomBytes(32);try{return new Wallet('0x'+bytes.toString('hex')).privateKey;}catch{}finally{bytes.fill(0);}}}
function publicHeader(material,{identityId,label,binding}){return{identityId,label,identityCommitment:commitment(material.philSecret),owner:new Wallet(material.validator).address.toLowerCase(),recoveryAuthority:new Wallet(material.recovery).address.toLowerCase(),binding};}
function validateHeader(h){exact(h,['identityId','label','identityCommitment','owner','recoveryAuthority','binding']);if(!/^identity_[a-f0-9]{12}_[a-f0-9]{8}$/.test(h.identityId)||typeof h.label!=='string'||h.label.length<1||h.label.length>80||/[\u0000-\u001f]/.test(h.label)||!/^0x[a-f0-9]{64}$/.test(h.identityCommitment)||!/^0x[a-f0-9]{40}$/.test(h.owner)||!/^0x[a-f0-9]{40}$/.test(h.recoveryAuthority)||h.owner===h.recoveryAuthority)fail();}
function validateMaterial(m,h){exact(m,['philSecret','validator','recovery']);const generated=publicHeader(m,h);if(canonical(generated)!==canonical(h))fail('GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED');}
function wipeMaterial(m){if(m)for(const key of Object.keys(m))m[key]=null;}
function privateRead(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||s.mode&0o077||s.size>2000000)fail();return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
function writeNew(file,bytes){const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function createPlatformAdapter(safeStorage){return Object.freeze({
 protect(key){if(process.platform!=='darwin'||!safeStorage.isEncryptionAvailable())fail('GENESIS_PLATFORM_REQUIRED');try{return safeStorage.encryptString(key.toString('base64url')).toString('base64url');}catch{fail('GENESIS_PLATFORM_REQUIRED');}},
 retrieve(blob){if(process.platform!=='darwin'||!safeStorage.isEncryptionAvailable())fail('GENESIS_PLATFORM_REQUIRED');try{return b64(safeStorage.decryptString(b64(blob)),32);}catch{fail('GENESIS_PLATFORM_REQUIRED');}}
});}
function createCustodyStore({directory,platform,confirm,makeBinding,validateBinding,legacyBackupDecoder,observe=()=>{},sessionLifetimeMs=15*60*1000}){
 if(sessionLifetimeMs!==null&&(!Number.isSafeInteger(sessionLifetimeMs)||sessionLifetimeMs<=0))fail();
 const file=path.join(directory,'platform-custody.json');let session=null,grants=new WeakSet(),busy=false;
 const notify=event=>{try{observe(event);}catch{}};
 function read(){try{const bytes=privateRead(file),r=JSON.parse(bytes);exact(r,['format','version','header','auth','vault','platform','probe','backupSHA']);if(r.format!=='phil-desktop-platform-custody'||r.version!==1)fail();validateHeader(r.header);validateBinding(r.header);exact(r.vault,['identity','validator','recovery']);if(r.backupSHA!==null&&!/^[a-f0-9]{64}$/.test(r.backupSHA))fail();return{r,seal:hash(bytes)};}catch(e){if(e.code?.startsWith('GENESIS_'))throw e;fail();}}
 function probe(r,key){const p=decrypt(key,r.probe,{header:r.header,purpose:'local-binding'});if(canonical(p)!==canonical({vaultHash:hash(canonical(r.vault)),authHash:hash(canonical(r.auth)),backupSHA:r.backupSHA}))fail();}
 function keyFor(r){let key;try{key=platform.retrieve(r.platform);if(!Buffer.isBuffer(key)||key.length!==32)fail('GENESIS_PLATFORM_REQUIRED');probe(r,key);return key;}catch(e){key?.fill(0);throw e;}}
 function updateProbe(r,key){r.probe=encrypt(key,{vaultHash:hash(canonical(r.vault)),authHash:hash(canonical(r.auth)),backupSHA:r.backupSHA},{header:r.header,purpose:'local-binding'});}
 function publish(r,initial){const bytes=Buffer.from(canonical(r)+'\n');if(initial){if(fs.readdirSync(directory).length)fail('GENESIS_RESTORE_REQUIRES_FRESH_STATE');writeNew(file,bytes);}else{const temp=path.join(directory,'.custody-'+crypto.randomBytes(12).toString('hex'));writeNew(temp,bytes);fs.renameSync(temp,file);}syncDir(directory);if(session)session.seal=hash(bytes);}
 function current(){if(!session||(session.expires!==null&&Date.now()>session.expires)) {lock();fail('GENESIS_IDENTITY_OR_RECOVERY_REQUIRED');}const loaded=read();if(loaded.seal!==session.seal){lock();fail('GENESIS_CUSTODY_CHANGED');}return loaded.r;}
 function lock(){session=null;grants=new WeakSet();notify('locked');}
 function bind(material,header,passphrase,verifiedBackupSHA=null){validateHeader(header);validateMaterial(material,header);validateBinding(header);const key=crypto.randomBytes(32);let reopened;try{
  const vault={};for(const [role,value]of Object.entries({identity:material.philSecret,validator:material.validator,recovery:material.recovery}))vault[role]=encrypt(key,{value},{header,role});
  const r={format:'phil-desktop-platform-custody',version:1,header,auth:sealPass({identityId:header.identityId},passphrase,header,'ui-authentication'),vault,platform:platform.protect(key),probe:null,backupSHA:verifiedBackupSHA};updateProbe(r,key);reopened=keyFor(r);if(!crypto.timingSafeEqual(reopened,key))fail('GENESIS_PLATFORM_REQUIRED');publish(r,true);lock();notify('enrolled');return header;
 }finally{key.fill(0);reopened?.fill(0);}}
 function create({label,passphrase,mode}){if(busy)fail('GENESIS_BUSY');busy=true;let material;try{if(typeof label!=='string'||typeof passphrase!=='string'||!/[A-Z]/.test(passphrase)||!/[a-z]/.test(passphrase)||!/[0-9]/.test(passphrase)||!/[\W_]/.test(passphrase))fail('GENESIS_IDENTITY_CREATION_FAILED');let secret;do{secret='0x'+(BigInt('0x'+crypto.randomBytes(32).toString('hex'))&((1n<<251n)-1n)).toString(16).padStart(64,'0');}while(BigInt(secret)===0n);material={philSecret:secret,validator:walletKey(),recovery:walletKey()};const id='identity_'+commitment(secret).slice(2,14)+'_'+crypto.randomBytes(4).toString('hex');const header=publicHeader(material,{identityId:id,label,binding:null});header.binding=makeBinding(header,mode);return bind(material,header,passphrase);}finally{wipeMaterial(material);busy=false;}}
 function unlock(passphrase){if(busy)fail('GENESIS_BUSY');const {r,seal}=read();const auth=openPass(r.auth,passphrase,r.header,'ui-authentication');if(canonical(auth)!==canonical({identityId:r.header.identityId}))fail();let key;try{try{key=keyFor(r);}catch{fail('GENESIS_UNLOCK_PLATFORM_REQUIRED');}session={id:crypto.randomBytes(16).toString('hex'),seal,expires:sessionLifetimeMs===null?null:Date.now()+sessionLifetimeMs};notify('metadata-unlocked');return r.header;}finally{key?.fill(0);}}
 function context(){const r=current();return{...r.header,sessionId:session.id,sessionExpiresAt:session.expires};}
 function status(){try{const r=current();let key;try{key=keyFor(r);return{configured:true,platformBound:true,backupVerified:r.backupSHA!==null,storageApproved:true,readyToFund:r.backupSHA!==null,reason:r.backupSHA?'GENESIS_CUSTODY_READY':'GENESIS_BACKUP_REQUIRED',validator:r.header.owner,recoveryAuthority:r.header.recoveryAuthority};}finally{key?.fill(0);}}catch{return{configured:false,platformBound:false,backupVerified:false,storageApproved:false,readyToFund:false,reason:'GENESIS_PLATFORM_REQUIRED'};}}
 function metadata(){if(!fs.existsSync(file)){if(fs.readdirSync(directory).length)fail('GENESIS_LEGACY_RESTORE_REQUIRED');return null;}return read().r.header;}
 async function presence(reason,digest,id){const r=current(),saved=session.id;const result=await confirm({reason,presentationDigest:digest,presentationId:id});current();if(session.id!==saved||result!==true)fail('GENESIS_CONFIRMATION');return r;}
 async function authorize({operationHash,presentationDigest,presentationId,owner}){if(busy)fail('GENESIS_BUSY');busy=true;try{if(!/^0x[a-f0-9]{64}$/.test(operationHash)||!/^0x[a-f0-9]{64}$/.test(presentationDigest)||current().header.owner!==owner)fail();await presence('Approve the reviewed Genesis Phil action and maximum Ethereum network fee',presentationDigest,presentationId);const grant=Object.freeze({operationHash,sessionId:session.id,expires:Math.min(session.expires??Infinity,Date.now()+30000)});grants.add(grant);return grant;}finally{busy=false;}}
 async function signOnce(grant,bytes,owner){if(busy)fail('GENESIS_BUSY');busy=true;let key,record,wallet;try{if(!grants.has(grant))fail('GENESIS_SIGNING_BINDING');grants.delete(grant);const r=current();if(grant.sessionId!==session.id||Date.now()>grant.expires||'0x'+Buffer.from(bytes).toString('hex')!==grant.operationHash||owner!==r.header.owner)fail('GENESIS_SIGNING_BINDING');key=keyFor(r);notify('validator-open');record=decrypt(key,r.vault.validator,{header:r.header,role:'validator'});exact(record,['value']);wallet=new Wallet(record.value);if(wallet.address.toLowerCase()!==owner)fail();const signature=await wallet.signMessage(bytes);current();if(grant.sessionId!==session.id||Date.now()>grant.expires)fail('GENESIS_SIGNING_BINDING');return signature;}finally{key?.fill(0);if(record)record.value=null;wallet=null;record=null;notify('validator-released');busy=false;}}
 function revoke(grant){grants.delete(grant);}
 function allMaterial(r,key){const m={};try{for(const [role,name]of [['identity','philSecret'],['validator','validator'],['recovery','recovery']]){const x=decrypt(key,r.vault[role],{header:r.header,role});exact(x,['value']);m[name]=x.value;x.value=null;}validateMaterial(m,r.header);return m;}catch(e){wipeMaterial(m);throw e;}}
 async function exportBackup(passphrase){if(busy)fail('GENESIS_BUSY');busy=true;let key,material;try{const r=current();openPass(r.auth,passphrase,r.header,'ui-authentication');await presence('Export your encrypted Phil recovery backup',hash(canonical(r.header)).replace(/^/,'0x'),'backup-export');key=keyFor(r);notify('backup-material-open');material=allMaterial(r,key);const backup={format:'phil-desktop-custody-backup',version:2,header:r.header,encryption:sealPass(material,passphrase,r.header,'portable-backup-v2')};return Buffer.from(canonical(backup)+'\n');}finally{key?.fill(0);wipeMaterial(material);notify('backup-material-released');busy=false;}}
 function decodeBackup(bytes,passphrase,expectedAccount){
  if(!Buffer.isBuffer(bytes)||bytes.length>8000000)fail('GENESIS_BACKUP_BYTES');
  let b;try{b=JSON.parse(bytes.toString('utf8'));}catch{fail('GENESIS_BACKUP_SCHEMA');}
  if(b?.format==='phil-genesis-encrypted-backup'&&b.version===1&&legacyBackupDecoder){
   const decoded=legacyBackupDecoder(b,passphrase,expectedAccount);
   try{validateHeader(decoded.header);validateBinding(decoded.header);validateMaterial(decoded.material,decoded.header);return decoded;}
   catch(e){wipeMaterial(decoded.material);throw e;}
  }
  checkedStage('GENESIS_BACKUP_SCHEMA',()=>exact(b,['format','version','header','encryption']));
  if(b.format!=='phil-desktop-custody-backup'||b.version!==2)fail('GENESIS_BACKUP_VERSION');
  checkedStage('GENESIS_BACKUP_HEADER',()=>validateHeader(b.header));validateBinding(b.header);
  checkedStage('GENESIS_BACKUP_ENVELOPE',()=>{
   exact(b.encryption,['salt','kdf','envelope']);if(canonical(b.encryption.kdf)!==canonical(KDF))fail();
   b64(b.encryption.salt,16);const e=b.encryption.envelope;exact(e,['iv','tag','ciphertext']);b64(e.iv,12);b64(e.tag,16);b64(e.ciphertext);
  });
  const material=checkedStage('GENESIS_BACKUP_AUTHENTICATION',()=>openPass(b.encryption,passphrase,b.header,'portable-backup-v2'));
  try{checkedStage('GENESIS_BACKUP_MATERIAL',()=>validateMaterial(material,b.header));return{header:b.header,material};}
  catch(e){wipeMaterial(material);throw e;}
 }
 function verifyBackup(bytes,passphrase){
  if(busy)fail('GENESIS_BUSY');busy=true;let decoded,key;
  try{
   const r=checkedStage('GENESIS_LOCAL_CUSTODY_INVALID',()=>current());
   decoded=decodeBackup(bytes,passphrase,r.header.binding.account);
   if(canonical(decoded.header)!==canonical(r.header))fail('GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED');
   key=checkedStage('GENESIS_PLATFORM_BINDING_INVALID',()=>keyFor(r));
   r.backupSHA=hash(bytes);updateProbe(r,key);publish(r,false);return status();
  }finally{key?.fill(0);wipeMaterial(decoded?.material);busy=false;}
 }
 function restoreBackup(bytes,passphrase,expectedAccount){
  if(busy)fail('GENESIS_BUSY');busy=true;let decoded;
  try{
   if(fs.readdirSync(directory).length)fail('GENESIS_RESTORE_REQUIRES_FRESH_STATE');
   decoded=decodeBackup(bytes,passphrase,expectedAccount);
   if(expectedAccount!==undefined&&expectedAccount!==''){
    if(typeof expectedAccount!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(expectedAccount)||expectedAccount.toLowerCase()!==decoded.header.binding.account)fail('GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED');
   }
   // The authenticated artifact proves recovery possession. Bind its digest to
   // the restored header and fresh Mac probe before initial publication.
   return bind(decoded.material,decoded.header,passphrase,hash(bytes));
  }finally{wipeMaterial(decoded?.material);busy=false;}
 }
 return Object.freeze({create,unlock,lock,context,status,metadata,authorize,signOnce,revoke,exportBackup,verifyBackup,restoreBackup});
}
module.exports={createCustodyStore,createPlatformAdapter};
