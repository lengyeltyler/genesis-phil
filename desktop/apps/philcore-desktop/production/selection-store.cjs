'use strict';
// Public artwork preferences only. Never a saved authorization, signer or nonce.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {privateDirectory}=require('./namespace.cjs');
const {N}=require('../../../genesis/scripts/recipes.cjs');
const {NAME_COUNT}=require('../../../genesis/production/names.cjs');
const fail=()=>{throw Object.assign(Error('GENESIS_SELECTION_STORAGE'),{code:'GENESIS_SELECTION_STORAGE'});};
function createSelectionStore(root){
 const directory=privateDirectory(path.join(root,'selections'));
 const fileFor=key=>path.join(directory,crypto.createHash('sha256').update(key).digest('hex')+'.json');
 function validate(record,key){
  if(!record||Object.keys(record).sort().join('|')!=='current|kept|key|nameId|previous|previousNameId|schema'||record.schema!==2||record.key!==key||typeof record.kept!=='boolean')fail();
  const valid=(id,max)=>typeof id==='string'&&/^[1-9][0-9]{0,77}$/.test(id)&&BigInt(id)<=max;
  if(!valid(record.current,N)||!valid(record.nameId,NAME_COUNT)||(record.previousNameId!==null&&!valid(record.previousNameId,NAME_COUNT)))fail();
  if(record.previous!==null&&(!record.previous||Object.keys(record.previous).sort().join('|')!=='nameId|recipeId'||!valid(record.previous.recipeId,N)||!valid(record.previous.nameId,NAME_COUNT)))fail();
  return record;
 }
 function read(key){privateDirectory(directory);const file=fileFor(key);let fd;try{fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);}catch(e){if(e.code==='ENOENT')return null;fail();}
  try{const st=fs.fstatSync(fd);if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||st.mode&0o077||st.size>4096)fail();return validate(JSON.parse(fs.readFileSync(fd,'utf8')),key);}catch{fail();}finally{fs.closeSync(fd);}}
 function write(key,value){const record=validate({schema:2,key,...value},key);read(key);const temp=path.join(directory,'.'+crypto.randomBytes(16).toString('hex'));let fd;
  try{fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);fs.writeFileSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,fileFor(key));const dir=fs.openSync(directory,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}catch{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch{}fail();}
 }
 return Object.freeze({read,write});
}
module.exports={createSelectionStore};
