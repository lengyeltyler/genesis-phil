'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const api={};
for(const action of ['downloadPNG','saveBackup','verifyBackup','restoreBackup','state','providers','createIdentity','unlock','lock','account','balance','selection','keepSelection','releaseSelection','undoSelection','reroll','rerollBatch','reviewMint','reviewTransfer','reviewWithdrawal','confirm','cancel','network','owned','reconcile','copyAccount','copyDonation','copyTransaction'])
  api[action]=(input={})=>ipcRenderer.invoke('phil:production',action,input);
api.onProgress=listener=>{if(typeof listener!=='function')return;const receive=(_event,value)=>{if(value?.stage==='rolling'&&[10,100].includes(value.count)&&Number.isInteger(value.index)&&value.index>0&&value.index<=value.count){listener({stage:'rolling',index:value.index,count:value.count,art:value.art});return;}if(value&&['checking','approval','signing','submitting','waiting'].includes(value.stage))listener({stage:value.stage,action:value.action});};ipcRenderer.on('phil:progress',receive);return()=>ipcRenderer.removeListener('phil:progress',receive);};
contextBridge.exposeInMainWorld('phil',Object.freeze(api));
