'use strict';
// Public source-only reconstruction. No credentials, RPC, signing or publishing.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const L=require('./lib.cjs'),{ROOT,run,hash,json,write,assertHash,checkSource}=L;
async function reconstruct(){
 process.chdir(ROOT);const m=checkSource();assert.equal(process.version,'v26.0.0');
 const out=path.join(ROOT,'.reconstructed');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(ROOT,'genesis/optimization/evidence'),{recursive:true});
 run(process.execPath,['genesis/body2-correction/compile.cjs']);
 assertHash(path.join(ROOT,'genesis/optimization/.generated/catalog.bin'),m.catalogSHA256);
 assertHash(path.join(ROOT,'genesis/optimization/evidence/optimized-manifest.json'),m.catalogManifestSHA256);
 const vm=json(path.join(ROOT,'verification/manifest.json')),solc=require('solc');assert.equal(solc.version(),m.toolchain.solc);
 const compiled=new Map();for(const spec of vm.contracts){
  if(!compiled.has(spec.standardInput)){
   const input=json(path.join(ROOT,'verification',spec.standardInput));
   const result=JSON.parse(solc.compile(JSON.stringify(input)));assert(!result.errors?.some(e=>e.severity==='error'));compiled.set(spec.standardInput,result);
  }
  const a=json(path.join(ROOT,'verification',spec.artifact)),c=compiled.get(spec.standardInput).contracts[a.sourceName][a.contractName];
  const input=json(path.join(ROOT,'verification',spec.standardInput)),result=compiled.get(spec.standardInput),seen=new Set();function visit(p){if(seen.has(p))return;seen.add(p);assert(input.sources[p]&&result.sources[p]?.ast,'COMPILER_CLOSURE');if(p.startsWith('genesis/'))assert.equal(fs.readFileSync(path.join(ROOT,p),'utf8'),input.sources[p].content,'COMPILER_DEPENDENCY: '+p);for(const n of result.sources[p].ast.nodes)if(n.nodeType==='ImportDirective')visit(n.absolutePath);}visit(a.sourceName);
  assert.equal('0x'+c.evm.bytecode.object,a.bytecode,'CREATION: '+spec.name);assert.equal('0x'+c.evm.deployedBytecode.object,a.deployedBytecode,'RUNTIME: '+spec.name);
 }
 const config=json(path.join(ROOT,'apps/philcore-desktop/production/candidate-public-config.json'));
 assertHash(path.join(ROOT,'apps/philcore-desktop/production/candidate-public-config.json'),m.configurationSHA256);
 const account=json(path.join(ROOT,'verification/PhilGenesisAccountV1.artifact.json'));assert.equal(config.accountCreationCode,account.bytecode);assert.equal(config.accountRuntimeTemplate,account.deployedBytecode);
 const {bundleMain}=require('../../../apps/philcore-desktop/production/build.cjs');await bundleMain(path.join(out,'main.cjs'));assertHash(path.join(out,'main.cjs'),m.mainSHA256);
 assertHash(path.join(out,'main.cjs.LEGAL.txt'),m.mainLegalSHA256);
 for(const r of m.staticResources)assertHash(path.join(ROOT,r.source),r.sha256);
 // Compile the exact shipped native source with the same flags. Comparison is
 // strict and fails on a different SDK/compiler output; never silently skip it.
 run('/usr/bin/xcrun',['swiftc','-target','arm64-apple-macos12.0','-O','-framework','LocalAuthentication','apps/philcore-desktop/native/macos-user-presence/PhilCoreUserPresenceHelper.swift','-o',path.join(out,'PhilUserPresence')]);
 const normalized=L.sha(L.normalizeMachO(fs.readFileSync(path.join(out,'PhilUserPresence'))));assert.equal(normalized,m.native.normalizedSHA256,'NATIVE_SOURCE_RECONSTRUCTION');
 const result={passed:true,sourceHead:m.applicationSourceHead,contracts:vm.contracts.length,catalog:m.catalogSHA256,main:m.mainSHA256,nativeNormalizedSHA256:normalized};write(path.join(out,'result.json'),result);console.log('PASS — reproducible source-derived contents');return result;
}
module.exports={reconstruct};if(require.main===module)reconstruct().catch(e=>{console.error(e.message);process.exitCode=1;});
