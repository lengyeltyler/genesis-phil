'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const L=require('./lib.cjs'),{ROOT,json,run,hash}=L;
function compare(local,official,m){
 const expected=json(path.join(ROOT,'package-inventory.json'));L.checkInventory(official,expected);
 const a=L.inventory(local),b=L.inventory(official),by=new Map(a.map(r=>[r.path,r]));const exceptions=[];
 const signatureResource=p=>/(^|\/)\_CodeSignature(\/|$)/.test(p)||p==='Contents/embedded.provisionprofile'||p==='Contents/CodeResources';
 for(const row of b){
  const other=by.get(row.path);by.delete(row.path);
  if(signatureResource(row.path)){exceptions.push({path:row.path,reason:'Apple signing resource; exact official inventory and signature independently checked'});continue;}
  assert(other,'MISSING_REBUILT_FILE: '+row.path);assert.equal(other.type,row.type);assert.equal(other.mode,row.mode,'MODE: '+row.path);
  if(row.type==='directory')continue;
  if(row.type==='symlink'){assert.equal(other.target,row.target,'LINK: '+row.path);continue;}
  const x=fs.readFileSync(path.join(local,row.path)),y=fs.readFileSync(path.join(official,row.path));
  if(L.macho(x)||L.macho(y)){assert(L.macho(x)&&L.macho(y));assert(L.normalizeMachO(x).equals(L.normalizeMachO(y)),'MACHO_CODE: '+row.path);exceptions.push({path:row.path,reason:'Code-signature payload and its three layout regions only'});}
  else if(row.path==='Contents/Resources/app/release.json'){
   const xm=JSON.parse(x),ym=JSON.parse(y);assert.equal(xm.helperSHA256,hash(path.join(local,'Contents/Resources/app/native/PhilUserPresence')));assert.equal(ym.helperSHA256,hash(path.join(official,'Contents/Resources/app/native/PhilUserPresence')));delete xm.helperSHA256;delete ym.helperSHA256;assert.deepEqual(xm,ym);exceptions.push({path:row.path,reason:'helperSHA256 must hash each exact signed/unsigned helper; every other field identical'});
  }else assert(x.equals(y),'RESOURCE_CONTENT: '+row.path);
 }
 assert.equal(by.size,0,'UNEXPECTED_REBUILT_FILES: '+[...by.keys()].join(', '));
 return exceptions;
}
function inspectSignature(target,m,checkEntitlements=true){
 run('/usr/bin/codesign',['--verify','--strict',target]);const r=cp.spawnSync('/usr/bin/codesign',['-d','--verbose=4',target],{encoding:'utf8'});assert.equal(r.status,0);L.signatureText(r.stderr+r.stdout,m);
 if(checkEntitlements){const e=cp.spawnSync('/usr/bin/codesign',['-d','--entitlements',':-',target],{encoding:'utf8'});assert.equal(e.status,0);
  const actual=e.stdout.trim()?JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-','--','-'],{input:e.stdout})):{};
  const isApp=target.endsWith('.app')||/\.app\/Contents\/MacOS\/[^/]+$/.test(target);
  const expected=isApp?{'com.apple.security.cs.allow-jit':true}:{};
  if(path.basename(target)==='Phil.app'||target.endsWith('/Phil.app/Contents/MacOS/Phil'))Object.assign(expected,{'com.apple.application-identifier':m.teamId+'.'+m.bundleId,'com.apple.developer.team-identifier':m.teamId,'keychain-access-groups':[m.teamId+'.'+m.bundleId+'.webauthn']});
  assert.deepEqual(actual,expected,'EXACT_ENTITLEMENTS: '+target);
 }
}
async function verify(){
 const m=L.checkSource(),args=process.argv.slice(2),at=args.indexOf('--dmg');assert(at>=0&&args[at+1],'Usage: npm run verify:release -- --dmg /absolute/Phil-0.3.0-93-macOS-arm64.dmg');const dmg=path.resolve(args[at+1]);L.assertHash(dmg,m.dmg.sha256);console.log('PASS — DMG identity');
 await require('./reconstruct.cjs').reconstruct();let local=path.join(ROOT,'.local-build/Phil.app');if(!fs.existsSync(local))local=await require('./build-local.cjs').build({reconstruct:false});
 const mount=path.join(ROOT,'.reconstructed/mounted-release');fs.mkdirSync(mount,{recursive:true});let attached=false;
 try{
  run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);attached=true;const app=path.join(mount,'Phil.app');
  const differences=compare(local,app,m);console.log('PASS — complete source-to-package comparison (including upstream Electron and native helper)');
  run('/usr/bin/codesign',['--verify','--deep','--strict',app]);const rows=L.inventory(app);
  for(const r of rows){const p=path.join(app,r.path);if(r.type==='file'&&L.macho(fs.readFileSync(p))||r.type==='directory'&&/\.(app|framework)$/.test(p))inspectSignature(p,m);}
  inspectSignature(app,m);const d=cp.spawnSync('/usr/bin/codesign',['-d','--verbose=4',dmg],{encoding:'utf8'});assert.equal(d.status,0);assert(d.stderr.includes('Authority='+m.signingIdentity));run('/usr/bin/codesign',['--verify','--strict',dmg]);console.log('PASS — publisher/signature identity');
  for(const p of [app,dmg])run('/usr/bin/xcrun',['stapler','validate',p]);run('/usr/sbin/spctl',['--assess','--type','execute',app]);run('/usr/sbin/spctl',['--assess','--type','open','--context','context:primary-signature',dmg]);console.log('PASS — Apple notarization');
  L.write(path.join(ROOT,'.reconstructed/verification-result.json'),{passed:true,release:m.dmg.sha256,sourceDerivedContents:true,publisherIdentity:true,appleNotarization:true,dmgIdentity:true,explainedDifferences:differences});console.log('UNAVOIDABLE/NONDETERMINISTIC DIFFERENCE — only the explicitly enumerated signing resources and signature layout; see .reconstructed/verification-result.json');
 }finally{if(attached)run('/usr/bin/hdiutil',['detach',mount]);}
}
module.exports={compare,inspectSignature};if(require.main===module)verify().catch(e=>{console.error('FAIL — '+e.stack);process.exitCode=1;});
