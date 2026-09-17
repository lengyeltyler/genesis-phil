'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),assert=require('node:assert/strict');
const L=require('./lib.cjs');
async function main(){
 const m=L.checkSource();assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
 const dest=path.join(L.ROOT,'.reconstructed/electron.zip');fs.mkdirSync(path.dirname(dest),{recursive:true});
 function fetch(url,count=0){assert(count<8);return new Promise((resolve,reject)=>https.get(url,r=>{if([301,302,303,307,308].includes(r.statusCode)){r.resume();return resolve(fetch(new URL(r.headers.location,url).href,count+1));}if(r.statusCode!==200){r.resume();return reject(Error('ELECTRON_HTTP_'+r.statusCode));}const chunks=[];r.on('data',b=>chunks.push(b));r.on('end',()=>resolve(Buffer.concat(chunks)));r.on('error',reject);}).on('error',reject));}
 const bytes=await fetch(m.electronArchive.url);assert.equal(L.sha(bytes),m.electronArchive.sha256,'ELECTRON_ARCHIVE_HASH');fs.writeFileSync(dest,bytes);
 const dir=path.join(L.ROOT,'node_modules/electron/dist');assert(!fs.existsSync(dir),'ELECTRON_DIST_ALREADY_EXISTS');L.run('/usr/bin/ditto',['-x','-k',dest,dir]);fs.writeFileSync(path.join(L.ROOT,'node_modules/electron/path.txt'),'Electron.app/Contents/MacOS/Electron');
 console.log('PASS — pinned upstream Electron archive');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
