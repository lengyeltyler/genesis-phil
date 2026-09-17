'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),L=require('./lib.cjs');
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phil-verifier-test-'));for(const [n,s]of Object.entries({'main.cjs':'module.exports=1','public-config.json':'{"chainId":1}','catalog.bin':'ART','helper':'EXEC','extra-parent/kept':'x'})){fs.mkdirSync(path.dirname(path.join(dir,n)),{recursive:true});fs.writeFileSync(path.join(dir,n),s);}fs.symlinkSync('main.cjs',path.join(dir,'link'));return dir;}
for(const [name,change]of [
 ['packaged JavaScript',d=>fs.appendFileSync(path.join(d,'main.cjs'),'\nchanged')],
 ['configuration',d=>fs.writeFileSync(path.join(d,'public-config.json'),'{}')],
 ['catalog',d=>fs.appendFileSync(path.join(d,'catalog.bin'),'x')],
 ['executable helper',d=>fs.appendFileSync(path.join(d,'helper'),'x')],
 ['extra file',d=>fs.writeFileSync(path.join(d,'unexpected'),'x')],
 ['missing file',d=>fs.unlinkSync(path.join(d,'main.cjs'))],
 ['symlink target',d=>{fs.unlinkSync(path.join(d,'link'));fs.symlinkSync('helper',path.join(d,'link'));}],
 ['escaping symlink',d=>{fs.unlinkSync(path.join(d,'link'));fs.symlinkSync('/etc/passwd',path.join(d,'link'));}],
 ['executable mode',d=>fs.chmodSync(path.join(d,'helper'),0o755)]
])test('reject '+name,()=>{const d=fixture();try{const expected=L.inventory(d);change(d);assert.throws(()=>L.checkInventory(d,expected));}finally{fs.rmSync(d,{recursive:true});}});
test('reject DMG hash change',()=>{const d=fixture();try{const p=path.join(d,'catalog.bin'),h=L.hash(p);fs.appendFileSync(p,'altered');assert.throws(()=>L.assertHash(p,h));}finally{fs.rmSync(d,{recursive:true});}});
test('reject altered inventory',()=>{const d=fixture();try{const p=path.join(d,'inventory.json');L.write(p,L.inventory(d));const h=L.hash(p);fs.appendFileSync(p,' ');assert.throws(()=>L.assertHash(p,h));}finally{fs.rmSync(d,{recursive:true});}});
test('reject other publisher and team',()=>{const m={signingIdentity:'Developer ID Application: Tyler Lengyel (B342738S82)',teamId:'B342738S82'},valid='Authority='+m.signingIdentity+'\nTeamIdentifier='+m.teamId+'\nflags=0x10000(runtime)\nTimestamp=t';L.signatureText(valid,m);assert.throws(()=>L.signatureText(valid.replace('Tyler Lengyel','Someone Else'),m));assert.throws(()=>L.signatureText(valid.replace('TeamIdentifier=B342738S82','TeamIdentifier=OTHER'),m));});
test('normalizer retains instructions and UUID',()=>{const p=path.join(L.ROOT,'.reconstructed/PhilUserPresence');assert(fs.existsSync(p),'Run npm run reconstruct first');const b=fs.readFileSync(p),expected=L.sha(L.normalizeMachO(b));const changed=Buffer.from(b);changed[16384]^=1;assert.notEqual(L.sha(L.normalizeMachO(changed)),expected);let at=32;for(let i=0;i<b.readUInt32LE(16);i++){if(b.readUInt32LE(at)===0x1b){const u=Buffer.from(b);u[at+8]^=1;assert.notEqual(L.sha(L.normalizeMachO(u)),expected);return;}at+=b.readUInt32LE(at+4);}assert.fail('Expected UUID');});
test('normalizer rejects malformed signature layout',()=>{const b=fs.readFileSync(path.join(L.ROOT,'.reconstructed/PhilUserPresence'));assert.throws(()=>L.normalizeMachO(Buffer.concat([b,Buffer.from('hidden')])));});
