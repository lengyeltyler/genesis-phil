'use strict';
// Separate production assembly. Frozen localalpha packaging and P.C. lanes are
// not edited. No environment/credential file is copied into application resources.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const esbuild=require('esbuild'),ts=require('typescript');
const {release,assertReleaseMetadata}=require('./release-version.cjs');
const root=path.resolve(__dirname,'../../..');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run=(cmd,args)=>cp.execFileSync(cmd,args,{cwd:root,stdio:['ignore','pipe','pipe']}).toString().trim();
function json(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
function configuration(proposal){
  const p=json(proposal),base=path.join(root,'genesis/final-art/verification-package');
  if(p.artworkVersion!=='phils-body2-v5'||!p.components?.some(x=>x.name==='PhilGenesisNames'))throw Error('PHILS_LAUNCH_DEPLOYMENT_REQUIRED');
  if(p.nameCount!==8352||p.nameCatalogSHA256!==sha(path.join(root,'genesis/unique-names/catalog.json')))throw Error('UNIQUE_NAME_CATALOG_BINDING');
  const manifest=json(path.join(base,'manifest.json')),artifact=json(path.join(base,'PhilGenesisAccountV1.artifact.json'));
  const artifactDirectory=path.join(root,'genesis/.artifacts',artifact.sourceName);
  const debug=json(path.join(artifactDirectory,artifact.contractName+'.dbg.json'));
  const build=json(path.resolve(artifactDirectory,debug.buildInfo));
  const contract=build.output.contracts[artifact.sourceName][artifact.contractName];
  if('0x'+contract.evm.bytecode.object!==artifact.bytecode||'0x'+contract.evm.deployedBytecode.object!==artifact.deployedBytecode)throw Error('ACCOUNT_COMPILER_BINDING');
  const names=new Map();function walk(node){if(!node||typeof node!=='object')return;if(node.nodeType==='VariableDeclaration')names.set(String(node.id),node.name);for(const value of Object.values(node))if(value&&typeof value==='object'){if(Array.isArray(value))value.forEach(walk);else walk(value);}}
  Object.values(build.output.sources).forEach(source=>walk(source.ast));
  const accountImmutables={};for(const [id,refs]of Object.entries(contract.evm.deployedBytecode.immutableReferences)){if(!names.has(id))throw Error('IMMUTABLE_SOURCE_BINDING');accountImmutables[names.get(id)]=refs;}
  const component=name=>{const c=p.components.find(x=>x.name===name);if(!c)throw Error('DEPLOYMENT_COMPONENT');return c.runtimeHash;};
  if(p.royalty.toLowerCase()!=='0xbd12e84ef4a0ae2acc6fbbb013ea7bd5758af4bd')throw Error('OWNER_CONFIRMED_ROYALTY_CHANGED');
  return{schema:1,bundleId:'com.philcore.desktop',chainId:1,entryPoint:manifest.entryPoint,
    entryPointCodeHash:'0x8db5ff695839d655407cc8490bb7a5d82337a86a6b39c3f0258aa6c3b582fc58',
    genesis:p.nft.toLowerCase(),factory:p.factory.toLowerCase(),genesisCodeHash:component('PhilGenesisNFT'),
    factoryCodeHash:component('PhilGenesisAccountFactoryV1'),catalogCommitment:manifest.catalogCommitment,
    feeCeilingWei:'10000000000000000',accountCreationCode:artifact.bytecode,accountRuntimeTemplate:artifact.deployedBytecode,accountImmutables,
    royaltyRecipient:p.royalty,royaltyConfirmationPending:false,donationENS:'tylerlengyel.eth',deploymentSender:p.sender};
}
async function bundleMain(outfile){
  const excluded=[];
  const blocked=/^(tsx\/cjs|.*(?:real-local-authorization-workflow|sepolia-user-operation-preparation-workflow|sepolia-mint-composed-workflow|sepolia-user-operation-signing-workflow|ethereum-gateway-resolution-runtime-config|ethereum-gateway-resolution-workflow|ethereum-gateway-execution-workflow|ethereum-gateway-exact-signer|ethereumAuthorizationGatewayV1|controlled-beta-release-state)\.(?:cjs|ts))$/;
  const boundary={name:'production-module-boundary',setup(builder){
    builder.onResolve({filter:blocked},args=>{excluded.push(args.path);return{path:args.path,namespace:'excluded'};});
    builder.onLoad({filter:/.*/,namespace:'excluded'},args=>{
      if(args.path==='tsx/cjs')return{contents:'module.exports={};',loader:'js'};
      if(args.path.includes('real-local-authorization-workflow'))return{contents:"module.exports={sanitizeWorkflow(value){if(value)throw Error('GENESIS_LEGACY_DISABLED');return undefined;},auditCurrentDesktopDemoStages(){return [];}};",loader:'js'};
      if(args.path.includes('controlled-beta-release-state'))return{contents:'module.exports={controlledBetaReleaseState(){return {};}};',loader:'js'};
      return{contents:"module.exports=new Proxy({}, {get(){return ()=>{throw Error('GENESIS_LEGACY_DISABLED');};}});",loader:'js'};
    });
    builder.onLoad({filter:/(runtime-host|macos-user-presence)\.cjs$/},args=>{
      const source=fs.readFileSync(args.path,'utf8'),ast=ts.createSourceFile(args.path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
      const removals=[];for(const statement of ast.statements)if(ts.isFunctionDeclaration(statement)&&['createFixturePlatformKeyAdapter','createFixtureMacOsUserPresenceProvider'].includes(statement.name?.text))removals.push([statement.pos,statement.end]);
      let result=source;for(const [start,end]of removals.reverse())result=result.slice(0,start)+result.slice(end);
      result=result.replace(/^  createFixture(?:PlatformKeyAdapter|MacOsUserPresenceProvider),\n/gm,'');
      return{contents:result,loader:'js',resolveDir:path.dirname(args.path)};
    });
  }};
  const bundled=await esbuild.build({entryPoints:[path.join(__dirname,'main.cjs')],bundle:true,preserveSymlinks:true,platform:'node',format:'cjs',target:'node22',outfile,external:['electron'],plugins:[boundary],metafile:true,legalComments:'external'});
  if(Object.keys(bundled.metafile.inputs).some(p=>/runtime-host\.cjs|custody-test-support|\.test\.cjs/.test(p)))throw Error('PRODUCTION_CUSTODY_BOUNDARY');
  return{bundled,excluded};
}
async function build(output,proposal){
  output=require('../../../scripts/phil-dev-storage.cjs').externalBuildOutput(output);
  if(!path.isAbsolute(output)||fs.existsSync(output))throw Error('NEW_ABSOLUTE_OUTPUT_DIRECTORY_REQUIRED');
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  run(process.execPath,[path.join(root,'genesis/unique-names/generate-catalog.cjs'),'--check']);
  run(process.execPath,[path.join(root,'genesis/unique-names/gas-proof/verify.cjs'),path.join(output,'renderer-proof')]);
  const app=path.join(output,'Phil.app'),electron=path.join(path.dirname(require.resolve('electron')),'dist/Electron.app');
  cp.execFileSync('/usr/bin/ditto',[electron,app]);
  const appResources=path.join(app,'Contents/Resources');
  const defaultAsar=path.join(appResources,'default_app.asar');if(fs.existsSync(defaultAsar))fs.unlinkSync(defaultAsar);
  const resources=path.join(appResources,'app');fs.mkdirSync(resources);fs.mkdirSync(path.join(resources,'native'));
  const plist=path.join(app,'Contents/Info.plist');
  fs.renameSync(path.join(app,'Contents/MacOS/Electron'),path.join(app,'Contents/MacOS/Phil'));
  fs.copyFileSync(path.join(__dirname,'assets/Phil.icns'),path.join(appResources,'Phil.icns'));
  for(const [key,value]of Object.entries({CFBundleIdentifier:'com.philcore.desktop',CFBundleExecutable:'Phil',CFBundleName:'Phil',CFBundleDisplayName:'Phil',CFBundleIconFile:'Phil.icns',CFBundleShortVersionString:release.version,CFBundleVersion:release.build,LSMinimumSystemVersion:'12.0',LSApplicationCategoryType:'public.app-category.graphics-design'})){
    try{run('/usr/libexec/PlistBuddy',['-c','Set :'+key+' '+value,plist]);}catch{run('/usr/libexec/PlistBuddy',['-c','Add :'+key+' string '+value,plist]);}
  }
  for(const entry of fs.readdirSync(path.join(app,'Contents/Frameworks')).filter(x=>x.endsWith('.app'))){
    const helperPlist=path.join(app,'Contents/Frameworks',entry,'Contents/Info.plist');
    const previous=run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',helperPlist]);
    if(!previous.startsWith('com.github.Electron.helper'))throw Error('ELECTRON_HELPER_IDENTITY');
    run('/usr/libexec/PlistBuddy',['-c','Set :CFBundleIdentifier '+previous.replace('com.github.Electron','com.philcore.desktop'),helperPlist]);
    for(const [key,value]of Object.entries({CFBundleShortVersionString:release.version,CFBundleVersion:release.build})){
      try{run('/usr/libexec/PlistBuddy',['-c','Set :'+key+' '+value,helperPlist]);}
      catch{run('/usr/libexec/PlistBuddy',['-c','Add :'+key+' string '+value,helperPlist]);}
    }
  }
  write(path.join(resources,'package.json'),{name:'phil-desktop',productName:'Phil',version:release.version,buildNumber:release.build,main:'main.cjs',private:true});
  const {bundled,excluded}=await bundleMain(path.join(resources,'main.cjs'));
  fs.copyFileSync(path.join(__dirname,'preload.cjs'),path.join(resources,'preload.cjs'));fs.cpSync(path.join(__dirname,'ui'),path.join(resources,'ui'),{recursive:true});
  for(const [from,to]of [['catalog.bin','catalog.bin'],['catalog-manifest.json','catalog-manifest.json']])fs.copyFileSync(path.join(root,'genesis/final-art/verification-package',from),path.join(resources,to));
  const publicConfig=configuration(proposal);
  if(JSON.stringify(publicConfig)!==JSON.stringify(json(path.join(__dirname,'candidate-public-config.json'))))throw Error('CANDIDATE_CONFIGURATION_CHANGED');
  write(path.join(resources,'public-config.json'),publicConfig);
  const helper=path.join(resources,'native/PhilUserPresence');
  run('/usr/bin/xcrun',['swiftc','-target','arm64-apple-macos12.0','-O','-framework','LocalAuthentication',path.join(root,'apps/philcore-desktop/native/macos-user-presence/PhilCoreUserPresenceHelper.swift'),'-o',helper]);
  const helperBuild=run('/usr/bin/xcrun',['vtool','-show-build',helper]);
  if(!/minos 12\.0(?:\s|$)/.test(helperBuild))throw Error('HELPER_DEPLOYMENT_TARGET');
  const head=run('git',['rev-parse','HEAD']),tree=run('git',['rev-parse','HEAD^{tree}']);
  const metadata={schema:1,bundleId:'com.philcore.desktop',production:true,version:release.version,build:release.build,sourceHead:head,sourceTree:tree,sourceDirty:Boolean(run('git',['status','--porcelain'])),helperSHA256:sha(helper)};
  write(path.join(resources,'release.json'),metadata);
  assertReleaseMetadata({metadata:json(path.join(resources,'release.json')),packageMetadata:json(path.join(resources,'package.json')),plist:Object.fromEntries(['CFBundleShortVersionString','CFBundleVersion'].map(key=>[key,run('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist])]))});
  for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(root,name),path.join(resources,name));
  fs.copyFileSync(path.join(root,'genesis/THIRD_PARTY_NOTICES.md'),path.join(resources,'GENESIS-THIRD-PARTY-NOTICES.md'));
  const licenses=path.join(resources,'licenses');fs.mkdirSync(licenses);
  for(const name of ['LICENSE','LICENSES.chromium.html']){const location=path.join(path.dirname(require.resolve('electron')),'dist',name);if(fs.existsSync(location))fs.copyFileSync(location,path.join(licenses,name));}
  const packageRoots=new Set();
  for(const input of Object.keys(bundled.metafile.inputs)){
    if(!input.includes('node_modules/'))continue;
    let dir=path.dirname(path.resolve(root,input));
    while(dir!==path.dirname(dir)){
      if(fs.existsSync(path.join(dir,'package.json'))&&json(path.join(dir,'package.json')).name)break;
      dir=path.dirname(dir);
    }
    if(fs.existsSync(path.join(dir,'package.json'))&&json(path.join(dir,'package.json')).name)packageRoots.add(dir);
  }
  const dependencyNotices=[];
  for(const dir of packageRoots){const p=json(path.join(dir,'package.json')),licenseFile=fs.readdirSync(dir).find(n=>/^licen[sc]e(?:\..*)?$/i.test(n));
    if(!licenseFile)throw Error('DEPENDENCY_LICENSE_MISSING: '+p.name);
    const target=p.name.replaceAll('/','_')+'-'+p.version+'.txt';fs.copyFileSync(path.join(dir,licenseFile),path.join(licenses,target));dependencyNotices.push({name:p.name,version:p.version,license:p.license,file:target});
  }
  write(path.join(licenses,'dependency-notices.json'),dependencyNotices);
  write(path.join(output,'build-evidence.json'),{...metadata,appPath:app,excludedModules:excluded,inputs:Object.keys(bundled.metafile.inputs).map(p=>p.replace(root+'/','')),artSHA256:sha(path.join(resources,'catalog.bin')),publicConfigurationSHA256:sha(path.join(resources,'public-config.json')),fixtureExportsRemoved:['createFixturePlatformKeyAdapter','createFixtureMacOsUserPresenceProvider']});
  console.log(JSON.stringify({app,head,tree,dirty:metadata.sourceDirty,bytes:fs.statSync(path.join(resources,'main.cjs')).size}));
}
module.exports={configuration,bundleMain};
if(require.main===module)build(process.argv[2],process.argv[3]).catch(error=>{console.error(error.message);process.exitCode=1;});
