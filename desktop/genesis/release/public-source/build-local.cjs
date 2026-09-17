'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const L=require('./lib.cjs'),{ROOT,run,hash,json,write}=L;
async function build({reconstruct=true,sign=false}={}){
 const m=L.checkSource();if(reconstruct)await require('./reconstruct.cjs').reconstruct();
 assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');const output=path.join(ROOT,'.local-build'),app=path.join(output,'Phil.app');assert(!fs.existsSync(app),'LOCAL_APP_ALREADY_EXISTS');fs.mkdirSync(output,{recursive:true});
 const electron=path.join(ROOT,'node_modules/electron/dist');assert.equal(json(path.join(ROOT,'node_modules/electron/package.json')).version,m.toolchain.electron);
 run('/usr/bin/ditto',[path.join(electron,'Electron.app'),app]);
 const contents=path.join(app,'Contents'),resources=path.join(contents,'Resources/app');fs.mkdirSync(resources,{recursive:true});fs.mkdirSync(path.join(resources,'native'));
 fs.unlinkSync(path.join(contents,'Resources/default_app.asar'));fs.renameSync(path.join(contents,'MacOS/Electron'),path.join(contents,'MacOS/Phil'));
 const plist=path.join(contents,'Info.plist'),set=(p,k,v)=>{const exists=cp.spawnSync('/usr/libexec/PlistBuddy',['-c','Print :'+k,p],{encoding:'utf8'}).status===0;run('/usr/libexec/PlistBuddy',['-c',(exists?'Set :'+k+' ':'Add :'+k+' string ')+v,p]);};
 for(const [k,v]of Object.entries({CFBundleIdentifier:m.bundleId,CFBundleExecutable:'Phil',CFBundleName:'Phil',CFBundleDisplayName:'Phil',CFBundleIconFile:'Phil.icns',CFBundleShortVersionString:m.version,CFBundleVersion:String(m.build),LSMinimumSystemVersion:'12.0',LSApplicationCategoryType:'public.app-category.graphics-design'}))set(plist,k,v);
 for(const name of fs.readdirSync(path.join(contents,'Frameworks')).filter(n=>n.endsWith('.app'))){const p=path.join(contents,'Frameworks',name,'Contents/Info.plist'),id=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',p]).trim();assert(id.startsWith('com.github.Electron.helper'));set(p,'CFBundleIdentifier',id.replace('com.github.Electron',m.bundleId));set(p,'CFBundleShortVersionString',m.version);set(p,'CFBundleVersion',String(m.build));}
 for(const r of m.staticResources){fs.mkdirSync(path.dirname(path.join(app,r.destination)),{recursive:true});fs.copyFileSync(path.join(ROOT,r.source),path.join(app,r.destination));}
 const {bundled}=await require('../../../apps/philcore-desktop/production/build.cjs').bundleMain(path.join(resources,'main.cjs'));L.assertHash(path.join(resources,'main.cjs'),m.mainSHA256);
 for(const [from,to]of [['genesis/optimization/.generated/catalog.bin','catalog.bin'],['genesis/optimization/evidence/optimized-manifest.json','catalog-manifest.json'],['apps/philcore-desktop/production/candidate-public-config.json','public-config.json'],['.reconstructed/PhilUserPresence','native/PhilUserPresence'],['LICENSE','LICENSE'],['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md'],['genesis/THIRD_PARTY_NOTICES.md','GENESIS-THIRD-PARTY-NOTICES.md']])fs.copyFileSync(path.join(ROOT,from),path.join(resources,to));
 fs.chmodSync(path.join(resources,'native/PhilUserPresence'),0o755);
 write(path.join(resources,'package.json'),{name:'phil-desktop',productName:'Phil',version:m.version,buildNumber:String(m.build),main:'main.cjs',private:true});
 write(path.join(resources,'release.json'),{schema:1,bundleId:m.bundleId,production:true,version:m.version,build:String(m.build),sourceHead:m.applicationSourceHead,sourceTree:m.applicationSourceTree,sourceDirty:false,helperSHA256:hash(path.join(resources,'native/PhilUserPresence'))});
 const licenses=path.join(resources,'licenses');fs.mkdirSync(licenses);for(const n of ['LICENSE','LICENSES.chromium.html'])fs.copyFileSync(path.join(electron,n),path.join(licenses,n));
 const packageRoots=new Set();for(const input of Object.keys(bundled.metafile.inputs)){if(!input.includes('node_modules/'))continue;let dir=path.dirname(path.resolve(ROOT,input));while(dir!==path.dirname(dir)){if(fs.existsSync(path.join(dir,'package.json'))&&json(path.join(dir,'package.json')).name)break;dir=path.dirname(dir);}if(fs.existsSync(path.join(dir,'package.json')))packageRoots.add(dir);}
 const notices=[];for(const dir of packageRoots){const p=json(path.join(dir,'package.json')),license=fs.readdirSync(dir).find(n=>/^licen[sc]e(?:\..*)?$/i.test(n));assert(license);const target=p.name.replaceAll('/','_')+'-'+p.version+'.txt';fs.copyFileSync(path.join(dir,license),path.join(licenses,target));notices.push({name:p.name,version:p.version,license:p.license,file:target});}write(path.join(licenses,'dependency-notices.json'),notices);
 if(sign)adHoc(app);
 console.log('Local application assembled: '+app);return app;
}
function adHoc(app){
 const output=path.dirname(app),ent=path.join(output,'local-jit.plist');fs.writeFileSync(ent,'<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>');
 // Innermost Mach-O files first; then framework/helper bundles and the outer
 // bundle. No owner identity, profile, keychain group or notarization involved.
 const rows=L.inventory(app);for(const r of rows.filter(r=>r.type==='file')){const p=path.join(app,r.path);if(L.macho(fs.readFileSync(p)))run('/usr/bin/codesign',['--force','--sign','-','--options','runtime',p]);}
 const resource=path.join(app,'Contents/Resources/app/release.json'),m=json(resource);m.helperSHA256=hash(path.join(app,'Contents/Resources/app/native/PhilUserPresence'));write(resource,m);
 const bundles=rows.filter(r=>r.type==='directory'&&/\.(app|framework)$/.test(r.path)).sort((a,b)=>b.path.length-a.path.length);
 for(const r of bundles)run('/usr/bin/codesign',['--force','--sign','-','--options','runtime',...(r.path.endsWith('.app')?['--entitlements',ent]:[]),path.join(app,r.path)]);
 run('/usr/bin/codesign',['--force','--sign','-','--options','runtime','--entitlements',ent,app]);run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
}
module.exports={build,adHoc};if(require.main===module)build({sign:process.argv.includes('--ad-hoc')}).catch(e=>{console.error(e.stack);process.exitCode=1;});
