'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hash=p=>sha(fs.readFileSync(p));
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');};
const run=(exe,args,options={})=>cp.execFileSync(exe,args,{cwd:ROOT,encoding:'utf8',maxBuffer:32*1024*1024,...options});
function assertHash(file,expected){assert.match(expected,/^[a-f0-9]{64}$/);assert.equal(hash(file),expected,'HASH: '+file);}
function inventory(root){
 const rows=[];root=fs.realpathSync(root);
 function walk(dir){for(const name of fs.readdirSync(dir).sort()){
  const p=path.join(dir,name),s=fs.lstatSync(p),rel=path.relative(root,p),mode=s.mode&0o777;
  if(s.isSymbolicLink()){
   const target=fs.readlinkSync(p);assert(!path.isAbsolute(target),'ABSOLUTE_LINK');assert(fs.realpathSync(p).startsWith(root+path.sep),'ESCAPING_LINK');rows.push({path:rel,type:'symlink',target,mode});
  }else if(s.isDirectory()){rows.push({path:rel,type:'directory',mode});walk(p);}
  else{assert(s.isFile(),'SPECIAL_FILE');rows.push({path:rel,type:'file',mode,bytes:s.size,sha256:hash(p)});}
 }}walk(root);return rows;
}
function inventoryDigest(rows){return sha(Buffer.from(JSON.stringify(rows)));}
function checkInventory(root,expected){assert.deepEqual(inventory(root),expected,'PACKAGE_INVENTORY_MISMATCH');}
function macho(bytes){return bytes.length>=32&&bytes.readUInt32LE(0)===0xfeedfacf;}
// Signature layout only. UUIDs, instructions, constants, symbols, SDK and all
// other load commands remain compared. No wildcard or whole-binary exclusion.
function normalizeMachO(bytes){
 assert(macho(bytes),'EXPECTED_THIN_MACHO64');const b=Buffer.from(bytes),n=b.readUInt32LE(16);let at=32,signature=null,linkedit=null;
 assert(n<1024);for(let i=0;i<n;i++){
  assert(at+8<=b.length);const cmd=b.readUInt32LE(at),size=b.readUInt32LE(at+4);assert(size>=8&&at+size<=b.length);
  if(cmd===0x1d){assert(!signature&&size===16);signature={at,offset:b.readUInt32LE(at+8),size:b.readUInt32LE(at+12)};}
  if(cmd===0x19&&b.subarray(at+8,at+24).toString().replace(/\0/g,'')==='__LINKEDIT'){assert(!linkedit);linkedit=at;}
  at+=size;
 }
 assert(at===32+b.readUInt32LE(20),'LOAD_COMMAND_SIZE');assert(signature&&linkedit!==null,'SIGNATURE_LAYOUT');
 assert(signature.offset>=at&&signature.offset+signature.size===b.length,'SIGNATURE_MUST_BE_FINAL');
 const fileoff=Number(b.readBigUInt64LE(linkedit+40)),filesize=Number(b.readBigUInt64LE(linkedit+48)),vmsize=Number(b.readBigUInt64LE(linkedit+32));
 assert(fileoff+filesize===b.length&&vmsize>=filesize&&vmsize%16384===0,'LINKEDIT_LAYOUT');
 b.fill(0,signature.at+8,signature.at+16);b.fill(0,linkedit+32,linkedit+40);b.fill(0,linkedit+48,linkedit+56);
 return b.subarray(0,signature.offset);
}
function checkSource(root=ROOT){
 const m=json(path.join(root,'verification-manifest.json'));assertHash(path.join(root,'package-lock.json'),m.dependencyLockSHA256);assertHash(path.join(root,'SOURCE-FILES.json'),m.sourceFilesSHA256);assertHash(path.join(root,'package-inventory.json'),m.packageInventorySHA256);
 const source=json(path.join(root,'SOURCE-FILES.json'));
 for(const row of source){const p=path.resolve(root,row.path);assert(p.startsWith(root+path.sep));assert(!fs.lstatSync(p).isSymbolicLink());assertHash(p,row.sha256);assert.equal(fs.statSync(p).mode&0o777,row.mode,'SOURCE_MODE');}
 if(fs.existsSync(path.join(root,'.git'))){
  const state=run('git',['-c','core.fsmonitor=false','status','--porcelain','--untracked-files=no'],{cwd:root,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});assert(!state.trim(),'SOURCE_GIT_DIRTY');
  const tag=cp.spawnSync('git',['rev-parse','--verify',m.sourceTag+'^{commit}'],{cwd:root,encoding:'utf8'});
  if(tag.status===0)assert.equal(run('git',['rev-parse','HEAD'],{cwd:root}).trim(),tag.stdout.trim(),'SOURCE_TAG_MISMATCH');
 }
 return m;
}
function signatureText(text,m){assert(text.includes('Authority='+m.signingIdentity),'SIGNING_IDENTITY');assert(text.includes('TeamIdentifier='+m.teamId),'SIGNING_TEAM');assert(/flags=.*\(runtime\)/.test(text),'HARDENED_RUNTIME');assert(/Timestamp=/.test(text),'SIGNATURE_TIMESTAMP');}
module.exports={ROOT,sha,hash,json,write,run,assertHash,inventory,inventoryDigest,checkInventory,macho,normalizeMachO,checkSource,signatureText};
