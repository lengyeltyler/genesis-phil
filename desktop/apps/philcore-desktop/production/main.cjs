'use strict';
const {app,BrowserWindow,ipcMain,safeStorage,session,clipboard,dialog,powerMonitor,nativeImage} = require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {productionNamespace}=require('./namespace.cjs');
const {createProviderStore}=require('./provider-store.cjs');
const {createBackend}=require('./backend.cjs');
const {createProductionCustodyHost}=require('./custody-host.cjs');
const {saveEncryptedBackup}=require('./backup-file.cjs');
const {exportMintedPNG,rasterizeSVG}=require('./png-export.cjs');
const {createMacOsLocalAuthenticationProvider}=require('../src/main/macos-user-presence.cjs');
const {createArtReader}=require('../../../genesis/production/art.cjs');
const resources=__dirname;
const metadata=JSON.parse(fs.readFileSync(path.join(resources,'release.json'),'utf8'));
const root=productionNamespace(app,metadata);
if(!app.requestSingleInstanceLock())app.quit();
let backend,window,pngBusy=false;
const actions=new Set(['state','providers','createIdentity','unlock','lock','account','balance','selection','keepSelection','releaseSelection','undoSelection','reroll','rerollBatch','reviewMint','reviewTransfer','reviewWithdrawal','confirm','cancel','network','owned','reconcile']);
app.whenReady().then(()=>{
  const config=JSON.parse(fs.readFileSync(path.join(resources,'public-config.json'),'utf8'));
  const providerStore=createProviderStore(path.join(root,'providers'),safeStorage);
  const helper=path.join(resources,'native','PhilUserPresence');
  const host=createProductionCustodyHost({root,config,safeStorage,
    presence:createMacOsLocalAuthenticationProvider({helperPath:helper,expectedSha256:metadata.helperSHA256})});
  for(const event of ['suspend','lock-screen','shutdown'])powerMonitor.on(event,()=>host.teardown());
  const artReader=createArtReader({catalog:fs.readFileSync(path.join(resources,'catalog.bin')),
    manifest:JSON.parse(fs.readFileSync(path.join(resources,'catalog-manifest.json'),'utf8'))});
  backend=createBackend({host,root,providers:providerStore,config,artReader,onProgress:value=>{if(window&&!window.isDestroyed())window.webContents.send('phil:progress',value);}});
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window=new BrowserWindow({width:1180,height:840,minWidth:880,minHeight:650,title:'Phil',backgroundColor:'#08080b',
    webPreferences:{preload:path.join(resources,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false,webSecurity:true,allowRunningInsecureContent:false}});
  const index=path.join(resources,'ui','index.html'),url=pathToFileURL(index).href;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  ipcMain.handle('phil:production',async(event,action,input)=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==url)return{ok:false,error:'GENESIS_ORIGIN'};
    try{
      if(typeof action!=='string'||!input||Object.getPrototypeOf(input)!==Object.prototype||Buffer.byteLength(JSON.stringify(input))>4096)throw Error('GENESIS_SHAPE');
      if(action==='copyAccount'){if(Object.keys(input).length)throw Error('GENESIS_SHAPE');const account=await backend.invoke('account',{});clipboard.writeText(account.address);return{ok:true,value:{copied:true}};}
      if(action==='copyTransaction'){if(Object.keys(input).join('|')!=='transactionHash'||!/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash))throw Error('GENESIS_SHAPE');clipboard.writeText('https://etherscan.io/tx/'+input.transactionHash);return{ok:true,value:{copied:true}};}
      if(action==='copyDonation'){if(Object.keys(input).length)throw Error('GENESIS_SHAPE');clipboard.writeText('tylerlengyel.eth');return{ok:true,value:{copied:true}};}
      if(action==='downloadPNG'){
        if(pngBusy)throw Error('GENESIS_BUSY');pngBusy=true;
        try{return{ok:true,value:await exportMintedPNG({input,owned:()=>backend.invoke('owned',{}),chooseDestination:defaultPath=>dialog.showSaveDialog(window,{title:'Download your minted Phil as PNG',defaultPath,filters:[{name:'PNG image',extensions:['png']}],buttonLabel:'Save PNG'}),rasterize:svg=>rasterizeSVG(svg,{BrowserWindow,session,nativeImage},resources)})};}finally{pngBusy=false;}
      }
      if(['saveBackup','verifyBackup','restoreBackup'].includes(action)){
        const keys=Object.keys(input).sort().join('|');if((action==='restoreBackup'?keys!=='expectedAccount|passphrase':keys!=='passphrase')||typeof input.passphrase!=='string'||input.passphrase.length>1024||(action==='restoreBackup'&&(typeof input.expectedAccount!=='string'||input.expectedAccount.length>42)))throw Error('GENESIS_SHAPE');
        if(action==='saveBackup'){
          const value=await saveEncryptedBackup({
            chooseDestination:()=>dialog.showSaveDialog(window,{title:'Save a new encrypted Phil backup',defaultPath:'Phil-backup-'+Date.now()+'.philbackup',filters:[{name:'Encrypted Phil backup',extensions:['philbackup']}],buttonLabel:'Save new backup'}),
            exportEncrypted:()=>backend.recovery.exportEncrypted(input.passphrase)
          });return{ok:true,value};
        }
        const selected=await dialog.showOpenDialog(window,{title:action==='verifyBackup'?'Verify your saved encrypted backup':'Restore an encrypted Phil backup',properties:['openFile'],filters:[{name:'Encrypted Phil backup',extensions:['philbackup']}]});
        if(selected.canceled)return{ok:true,value:{cancelled:true}};
        const fd=fs.openSync(selected.filePaths[0],fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let bytes;
        try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>8000000)throw Error('GENESIS_RECOVERY_INVALID');bytes=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
        const value=await backend.recovery[action==='verifyBackup'?'verifySaved':'restore'](bytes,input.passphrase,input.expectedAccount);return{ok:true,value};
      }
      if(!actions.has(action))throw Error('GENESIS_ACTION');
      return{ok:true,value:await backend.invoke(action,input)};
    }catch(e){return{ok:false,error:/^GENESIS_[A-Z_]+$/.test(e.code||e.message)?(e.code||e.message):'GENESIS_REQUEST_FAILED'};}
  });
  window.loadFile(index);
}).catch(()=>{dialog.showErrorBox('Phil could not open','Production resources or protected storage could not be verified. No transaction was sent.');app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>backend?.teardown());
