'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{pathToFileURL}=require('node:url');
const fail=code=>{throw Object.assign(Error(code),{code});};
const SIZE=2048;
function validatePNG(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<33||bytes.length>24*1024*1024||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==SIZE||bytes.readUInt32BE(20)!==SIZE)fail('GENESIS_PNG_INVALID');
 return bytes;
}
async function rasterizeSVG(svg,{BrowserWindow,session,nativeImage},resources){
 if(typeof svg!=='string'||Buffer.byteLength(svg)>2000000||!svg.startsWith('<svg '))fail('GENESIS_PNG_INVALID');
 const isolated=session.fromPartition('phil-png-'+randomUUID());
 isolated.setPermissionRequestHandler((_w,_p,cb)=>cb(false));isolated.setPermissionCheckHandler(()=>false);
 // Only the two packaged exporter files may load. All networking is denied.
 const page=pathToFileURL(path.join(resources,'ui/png-export.html')).href,script=pathToFileURL(path.join(resources,'ui/png-export.js')).href;
 isolated.webRequest.onBeforeRequest((details,cb)=>cb({cancel:![page,script].includes(details.url)&&!details.url.startsWith('data:image/svg+xml,')}));
 const win=new BrowserWindow({show:false,width:420,height:420,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false,webSecurity:true,allowRunningInsecureContent:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,target)=>{if(target!==page)event.preventDefault();});win.webContents.on('will-attach-webview',event=>event.preventDefault());
 let timer;
 try{
  const work=(async()=>{await win.loadURL(page);const data=await win.webContents.executeJavaScript('window.renderPhilPNG('+JSON.stringify(svg)+')');
   if(typeof data!=='string'||data.length>32*1024*1024||!data.startsWith('data:image/png;base64,'))fail('GENESIS_PNG_INVALID');
   const bytes=validatePNG(Buffer.from(data.slice(22),'base64')),image=nativeImage.createFromBuffer(bytes);
   if(image.isEmpty()||image.getSize().width!==SIZE||image.getSize().height!==SIZE)fail('GENESIS_PNG_INVALID');return bytes;})();
  return await Promise.race([work,new Promise((_r,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('GENESIS_PNG_FAILED'),{code:'GENESIS_PNG_FAILED'})),15000);})]);
 }finally{clearTimeout(timer);if(!win.isDestroyed())win.destroy();}
}
async function exportMintedPNG({input,owned,chooseDestination,rasterize}){
 if(!input||Object.keys(input).join('|')!=='tokenId'||typeof input.tokenId!=='string'||!/^(0|[1-9][0-9]{0,2})$/.test(input.tokenId)||BigInt(input.tokenId)>368n)fail('GENESIS_SHAPE');
 const result=await owned(),phil=result.owned.find(p=>p.tokenId===input.tokenId);
 if(!phil)fail('GENESIS_PNG_NOT_OWNED');
 // SVG, name and recipe come exclusively from the independently checked backend.
 const defaultName=phil.name.replace(/[^A-Za-z0-9 _-]/g,'').trim().slice(0,120)+'.png';
 const destination=await chooseDestination(defaultName);if(destination.canceled)return{cancelled:true};
 const file=destination.filePath;if(typeof file!=='string'||!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.png')fail('GENESIS_PNG_DESTINATION');
 try{fs.lstatSync(file);fail('GENESIS_PNG_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const bytes=validatePNG(await rasterize(phil.art.svg));let fd;
 try{fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);}catch(e){fail(e.code==='EEXIST'?'GENESIS_PNG_EXISTS':'GENESIS_PNG_WRITE_FAILED');}
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}catch{fail('GENESIS_PNG_WRITE_FAILED');}finally{fs.closeSync(fd);}
 return{saved:true,tokenId:phil.tokenId,width:SIZE,height:SIZE};
}
module.exports={exportMintedPNG,rasterizeSVG,validatePNG};
