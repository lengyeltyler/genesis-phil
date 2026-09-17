'use strict';
const fs=require('node:fs'),path=require('node:path');
const fail=code=>{throw Object.assign(Error(code),{code});};
function requireNewDestination(file){
 if(typeof file!=='string'||!path.isAbsolute(file))fail('GENESIS_BACKUP_DESTINATION');
 try{fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return;fail('GENESIS_BACKUP_DESTINATION');}
 fail('GENESIS_BACKUP_EXISTS');
}
async function saveEncryptedBackup({chooseDestination,exportEncrypted}){
 const selected=await chooseDestination();if(selected.canceled)return{cancelled:true};
 // Check before protected export; the exclusive open also closes the race.
 requireNewDestination(selected.filePath);
 const bytes=await exportEncrypted();
 let fd;
 try{fd=fs.openSync(selected.filePath,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);}
 catch(e){fail(e.code==='EEXIST'?'GENESIS_BACKUP_EXISTS':'GENESIS_BACKUP_WRITE_FAILED');}
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}catch{fail('GENESIS_BACKUP_WRITE_FAILED');}finally{fs.closeSync(fd);}
 const parent=fs.openSync(path.dirname(selected.filePath),'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
 return{saved:true};
}
module.exports={saveEncryptedBackup};
