'use strict';
// PG06 is unchanged. Retain existing data payloads and global tokens; replace
// only metadata and approved Body2 programs. No RPC or deployment capability.
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),e=require('ethers');
const {compress,decompress}=require('../optimization/scripts/lz4.cjs'),{encode}=require('../optimization/scripts/compile.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'genesis/optimization/.generated');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=fs.readFileSync(path.join(__dirname,'inputs/base-catalog.bin')),bm=require('./inputs/base-catalog-manifest.json'),m=require('../final-art/canonical-manifest.json'),approval=require('./owner-approval.json');
if(sha(base)!=='995806c83e9fbfb1847bed21a2f539dd8865cced5d8e0a672354de5e79bce6c3'||sha(base)!==bm.blobSHA256||m.traitCount!==896||approval.status!=='BODY2_APPROVED_HOODIES_CANCELLED')throw Error('APPROVED_BASE_REQUIRED');
const oldTC=base.readUInt16BE(4),oldBC=base.readUInt16BE(6),oldTD=base.readUInt32BE(12),oldBD=base.readUInt32BE(16),oldLL=base.readUInt32BE(24),oldDL=base.readUInt32BE(20);
const blockRaws=Array.from({length:oldBC},(_,i)=>decompress(base.subarray(base.readUInt32BE(oldBD+i*12),base.readUInt32BE(oldBD+i*12)+base.readUInt32BE(oldBD+i*12+4)),base.readUInt32BE(oldBD+i*12+8)).out);
let dictionary=Buffer.concat(blockRaws),literal=Buffer.from(base.subarray(oldBD+oldBC*12,oldBD+oldBC*12+oldLL));if(dictionary.length!==oldDL)throw Error('BASE_DICTIONARY');
const strings=new Map(),tokens=[],tokenByString=new Map();
function sourceValue(at){const off=base.readUIntBE(at,3),len=base.readUInt16BE(at+3),s=(off&0x800000?dictionary:literal).subarray(off&0x7fffff,(off&0x7fffff)+len).toString();if(Buffer.byteLength(s)!==len)throw Error('TOKEN_ASCII');strings.set(s,{off,len});return s;}
for(let i=0;i<oldTC;i++){const raw=sourceValue(32+i*10),encoded=sourceValue(37+i*10);if(encode(raw)!==encoded)throw Error('BASE_ENCODE');tokens.push({raw,encoded,record:Buffer.from(base.subarray(32+i*10,42+i*10))});tokenByString.set(raw,i);}
const emitted=JSON.parse(cp.execFileSync('python3',[path.join(__dirname,'emit.py')],{maxBuffer:8*1024*1024})),changed=new Map();
// Reuse the accepted compiler's already-fused literal runs where possible.
for(const item of emitted){const original=item.parts,parts=[];for(let i=0;i<original.length;){let joined='',best=null,end=i+1;for(let j=i;j<original.length;j++){joined+=original[j];if(joined.length>=64)break;if(tokenByString.has(joined)){best=joined;end=j+1;}}parts.push(best??original[i]);i=best?end:i+1;}if(parts.join('')!==original.join(''))throw Error('LITERAL_FUSION_CHANGED_SVG');item.parts=parts;}
// Split only newly introduced short values into existing literal tokens.
// This preserves token-table length and avoids shifting 300 KB of literals.
const starts=new Map();for(const value of tokenByString.keys())if(value.length&&value.length<64){const list=starts.get(value[0])||[];list.push(value);starts.set(value[0],list);}for(const list of starts.values())list.sort((a,b)=>b.length-a.length||(a<b?-1:1));
for(const item of emitted){const before=item.parts.join(''),parts=[];for(const value of item.parts){if(tokenByString.has(value)||value.length>=64){parts.push(value);continue;}for(let at=0;at<value.length;){const match=(starts.get(value[at])||[]).find(s=>value.startsWith(s,at))||value[at];parts.push(match);at+=match.length;}}if(parts.join('')!==before)throw Error('LITERAL_SPLIT_CHANGED_SVG');item.parts=parts;}
const replacing=new Set(emitted.map(x=>x.index)),live=new Set();
for(let i=0;i<896;i++)if(!replacing.has(i)){const at=oldTD+i*40,off=base.readUInt32BE(at+28),len=base.readUInt32BE(at+32);for(let j=0;j<len;j+=2)live.add(base.readUInt16BE(off+j));}
for(const {parts} of emitted)for(const s of parts)if(tokenByString.has(s))live.add(tokenByString.get(s));
const occupiedLiteral=new Uint8Array(literal.length),occupiedDictionary=new Uint8Array(dictionary.length);
function reserve({off,len}){(off&0x800000?occupiedDictionary:occupiedLiteral).fill(1,off&0x7fffff,(off&0x7fffff)+len);}
const neededStrings=new Set();for(const id of live){neededStrings.add(tokens[id].raw);neededStrings.add(tokens[id].encoded);}for(const {parts}of emitted)for(const s of parts){neededStrings.add(s);neededStrings.add(encode(s));}
for(const s of neededStrings)if(strings.has(s))reserve(strings.get(s));
for(const s of [...strings.keys()])if(!neededStrings.has(s))strings.delete(s);
const free=[];for(let id=0;id<oldTC;id++)if(!live.has(id)){free.push(id);if(tokenByString.get(tokens[id].raw)===id)tokenByString.delete(tokens[id].raw);}
function holes(mask){const out=[];for(let i=0;i<mask.length;){if(mask[i]){i++;continue;}const start=i;while(i<mask.length&&!mask[i])i++;out.push({start,length:i-start});}return out;}
if(process.env.BODY2_INSPECT_TOKENS){const values=[...new Set(emitted.flatMap(x=>x.parts))].filter(s=>!tokenByString.has(s));console.log(JSON.stringify(values));process.exit(0);}
const litHoles=holes(occupiedLiteral),dictHoles=holes(occupiedDictionary),dirtyBlocks=new Set();console.error(JSON.stringify({freeTokenSlots:free.length,newStrings:[...new Set(emitted.flatMap(x=>x.parts))].filter(s=>!tokenByString.has(s)).length,literalHoles:litHoles.reduce((n,x)=>n+x.length,0),dictionaryHoles:dictHoles.reduce((n,x)=>n+x.length,0)}));
function allocate(s,long){const data=Buffer.from(s),pool=long?dictionary:literal,available=long?dictHoles:litHoles;
 const fits=available.filter(h=>h.length>=data.length).sort((a,b)=>{const dirty=h=>{let n=0;for(let i=h.start>>>16;i<=(h.start+data.length-1)>>>16;i++)if(!dirtyBlocks.has(i))n++;return n;};return (long?dirty(a)-dirty(b):0)||a.length-b.length||a.start-b.start;});
 if(!fits.length&&!long){const at=literal.length;literal=Buffer.concat([literal,data]);return at;}if(!fits.length){const at=dictionary.length;if(at+data.length>oldBC*65536)throw Error('NO_UNUSED_DICTIONARY_SPACE_'+data.length);dictionary=Buffer.concat([dictionary,data]);return at;}
 const h=fits[0],at=h.start;data.copy(pool,at);h.start+=data.length;h.length-=data.length;if(long)for(let i=at>>>16;i<=(at+data.length-1)>>>16;i++)dirtyBlocks.add(i);return at;
}
function store(s){if(strings.has(s))return strings.get(s);if(Buffer.byteLength(s)!==s.length||s.length>65535)throw Error('TOKEN_RANGE');const long=s.length>=64,at=allocate(s,long),value={off:at|(long?0x800000:0),len:s.length};strings.set(s,value);return value;}
function token(s){if(tokenByString.has(s))return tokenByString.get(s);if(!free.length)throw Error('TOKEN_SLOT_LIMIT');const record=Buffer.alloc(10);[s,encode(s)].forEach((v,i)=>{const {off,len}=store(v);record.writeUIntBE(off,i*5,3);record.writeUInt16BE(len,i*5+3);});const id=free.shift();tokens[id]={raw:s,encoded:encode(s),record};tokenByString.set(s,id);return id;}
for(const item of emitted){const program=item.parts.map(token),refs=[...new Set(program)],local=new Map(refs.map((v,i)=>[v,i])),words=[];for(let i=0;i<program.length;i++){if(/^ [A-Za-z:-]+='$/.test(tokens[program[i]].raw)&&tokens[program[i+2]]?.raw==="'"){if(tokens[program[i]].raw.length>=64)throw Error('ATTRIBUTE_PREFIX');words.push(local.get(program[i])|0x8000,local.get(program[i+1]));i+=2;}else words.push(local.get(program[i]));}const raw=Buffer.alloc(words.length*2);words.forEach((v,i)=>raw.writeUInt16BE(v,i*2));const mapping=Buffer.alloc(refs.length*2);refs.forEach((v,i)=>mapping.writeUInt16BE(v,i*2));changed.set(item.index,{program,raw,mapping,data:compress(raw,8),svg:item.parts.join(''),encoded:item.parts.map(encode).join('')});}
if(changed.size!==39||tokens.length>=32768)throw Error('APPROVED_SCOPE');
const bc=Math.ceil(dictionary.length/65536),td=32+tokens.length*10,bd=td+896*40,metadataLength=bd+bc*12+literal.length;if(bc>64)throw Error('BLOCK_LIMIT');
const firstLabel=base.readUInt32BE(oldTD+36);const pieces=[Buffer.from(base.subarray(0,firstLabel))];let length=pieces[0].length;
function append(data){const offset=length;pieces.push(data);length+=data.length;return offset;}
const relocated=new Map();function retain(off,len){if(off>=metadataLength&&off+len<=firstLabel)return off;const key=off+':'+len;if(!relocated.has(key))relocated.set(key,append(base.subarray(off,off+len)));return relocated.get(key);}
const directories=Buffer.alloc(896*40),blocks=Buffer.alloc(bc*12),traits=[];
function nodes(p,mode){return p.reduce((n,id)=>{const r=tokens[id].record,off=r.readUIntBE(mode*5,3),len=r.readUInt16BE(mode*5+3);return n+((off&0x800000)?1+Number((off&65535)+len>65536):0);},0);}
for(let i=0;i<896;i++){
 const at=i*40,p=changed.get(i);base.copy(directories,at,oldTD+at,oldTD+at+40);
 if(p){directories.writeUInt32BE(append(p.data),at);directories.writeUInt32BE(p.data.length,at+4);directories.writeUInt32BE(p.raw.length/2,at+8);directories.writeUInt32BE(Buffer.byteLength(p.svg),at+12);directories.writeUInt32BE(Buffer.byteLength(p.encoded),at+16);directories.writeUInt32BE(nodes(p.program,0),at+20);directories.writeUInt32BE(nodes(p.program,1),at+24);directories.writeUInt32BE(append(p.mapping),at+28);directories.writeUInt32BE(p.mapping.length,at+32);}
 else{directories.writeUInt32BE(retain(directories.readUInt32BE(at),directories.readUInt32BE(at+4)),at);directories.writeUInt32BE(retain(directories.readUInt32BE(at+28),directories.readUInt32BE(at+32)),at+28);if(sha(fs.readFileSync(path.join(root,'genesis/final-art/canonical-traits',m.traits[i].filename)))!==bm.traits[i].sourceSHA256)throw Error('UNAPPROVED_TRAIT_CHANGE');}
}
for(let i=0;i<bc;i++){const raw=dictionary.subarray(i*65536,(i+1)*65536);let off,data;if(i<oldBC&&raw.equals(blockRaws[i])){off=retain(base.readUInt32BE(oldBD+i*12),base.readUInt32BE(oldBD+i*12+4));data=base.subarray(base.readUInt32BE(oldBD+i*12),base.readUInt32BE(oldBD+i*12)+base.readUInt32BE(oldBD+i*12+4));}else{data=compress(raw,32);off=append(data);}if(!decompress(data,raw.length).out.equals(raw))throw Error('DICTIONARY_ROUNDTRIP');blocks.writeUInt32BE(off,i*12);blocks.writeUInt32BE(data.length,i*12+4);blocks.writeUInt32BE(raw.length,i*12+8);}
// All labels remain a single tail so the renderer's bounded metadata read is unchanged.
for(let i=0;i<896;i++){const label=base.readUInt32BE(oldTD+i*40+36),size=base.readUInt16BE(label);directories.writeUInt32BE(append(base.subarray(label,label+size+2)),i*40+36);}
const blob=Buffer.concat(pieces),header=Buffer.from(base.subarray(0,32));header.writeUInt16BE(tokens.length,4);header.writeUInt16BE(bc,6);header.writeUInt32BE(td,12);header.writeUInt32BE(bd,16);header.writeUInt32BE(dictionary.length,20);header.writeUInt32BE(literal.length,24);
Buffer.concat([header,...tokens.map(t=>t.record),directories,blocks,literal]).copy(blob,0);
// Rehydrate the final serialized pools, independently of the construction buffers.
const serializedDictionary=Buffer.concat(Array.from({length:bc},(_,i)=>{const at=bd+i*12,off=blob.readUInt32BE(at),len=blob.readUInt32BE(at+4),raw=blob.readUInt32BE(at+8);if(off+len>blob.length)throw Error('SERIALIZED_BLOCK_BOUNDS');return decompress(blob.subarray(off,off+len),raw).out;}));
const serializedLiteral=blob.subarray(bd+bc*12,bd+bc*12+literal.length);
if(!serializedDictionary.equals(dictionary)||!serializedLiteral.equals(literal))throw Error('SERIALIZED_POOL_MISMATCH');
// Independent serialized execution, both SVG and double-encoded SVG, every trait.
function decode(i,mode){const at=td+i*40,po=blob.readUInt32BE(at),pl=blob.readUInt32BE(at+4),program=decompress(blob.subarray(po,po+pl),blob.readUInt32BE(at+8)*2).out,ro=blob.readUInt32BE(at+28),rl=blob.readUInt32BE(at+32),parts=[];let used=0;
 const read=local=>{if(local*2+2>rl)throw Error('LOCAL_TOKEN');const id=blob.readUInt16BE(ro+local*2);if(id>=tokens.length)throw Error('GLOBAL_TOKEN');const tokenAt=32+id*10+mode*5,off=blob.readUIntBE(tokenAt,3),size=blob.readUInt16BE(tokenAt+3),pool=off&0x800000?serializedDictionary:serializedLiteral,pos=off&0x7fffff;if(pos+size>pool.length)throw Error('TOKEN_BOUNDS');if(off&0x800000)used+=1+Number((pos%65536)+size>65536);return pool.subarray(pos,pos+size);};
 for(let q=0;q<program.length;q+=2){const word=program.readUInt16BE(q);if(word&0x8000){parts.push(read(word&0x7fff));q+=2;parts.push(read(program.readUInt16BE(q)),Buffer.from("'"));}else parts.push(read(word));}const result=Buffer.concat(parts);if(result.length!==blob.readUInt32BE(at+(mode?16:12))||used!==blob.readUInt32BE(at+(mode?24:20)))throw Error('SERIALIZED_BOUNDS');return result;}
for(let i=0;i<896;i++){const raw=decode(i,0),encoded=decode(i,1),p=changed.get(i);if(sha(raw)!==(p?sha(p.svg):bm.traits[i].canonicalSHA256)||sha(encoded)!==(p?sha(p.encoded):bm.traits[i].encodedSHA256))throw Error('ROUNDTRIP_TRAIT_'+i);const at=td+i*40;traits.push({...bm.traits[i],index:i,sourceSHA256:m.traits[i].canonicalSHA256,canonicalSHA256:sha(raw),encodedSHA256:sha(encoded),svgBytes:raw.length,encodedBytes:encoded.length,programOffset:blob.readUInt32BE(at),programWordCount:blob.readUInt32BE(at+8),labelOffset:blob.readUInt32BE(at+36),referenceMapOffset:blob.readUInt32BE(at+28),referenceMapBytes:blob.readUInt32BE(at+32),rawCopyNodes:blob.readUInt32BE(at+20),encodedCopyNodes:blob.readUInt32BE(at+24)});}
const pages=[];for(let i=0;i<blob.length;i+=24000)pages.push(blob.subarray(i,i+24000));const unchanged=pages.map((p,i)=>p.equals(base.subarray(i*24000,(i+1)*24000))?i:null).filter(i=>i!==null);
const commitment=e.keccak256(e.AbiCoder.defaultAbiCoder().encode(['uint256','bytes32[]'],[blob.length,pages.map(p=>e.keccak256(e.concat(['0x00',p])))]));
const manifest={...bm,masterSHA256:m.masterSHA256,sourceManifestSHA256:sha(fs.readFileSync(path.join(root,'genesis/final-art/canonical-manifest.json'))),sourceConcatenatedSHA256:m.canonicalConcatenatedSHA256,blobSHA256:sha(blob),runtimeCommitment:commitment,catalogBytes:blob.length,tokenCount:tokens.length,dictionaryBytes:dictionary.length,literalBytes:literal.length,traits,pages:pages.map((p,index)=>({index,bytes:p.length,sha256:sha(p)})),layout:'PG06 incremental Body2 correction',baseBlobSHA256:sha(base)};
manifest.dictionarySHA256=sha(dictionary);manifest.literalSHA256=sha(literal);manifest.tokenTableSHA256=sha(blob.subarray(32,td));
manifest.blockStats=Array.from({length:bc},(_,i)=>{const at=bd+i*12;return {rawBytes:blob.readUInt32BE(at+8),compressedBytes:blob.readUInt32BE(at+4)};});
manifest.compressedDictionaryBytes=manifest.blockStats.reduce((n,b)=>n+b.compressedBytes,0);
manifest.compressedProgramBytes=traits.reduce((n,t)=>n+blob.readUInt32BE(td+t.index*40+4),0);
manifest.rawReferenceMapBytes=traits.reduce((n,t)=>n+t.referenceMapBytes,0);
for(const t of traits){t.refs=t.referenceMapBytes/2;t.programCompressedBytes=blob.readUInt32BE(td+t.index*40+4);delete t.templateId;delete t.programOps;delete t.programCopies;delete t.programExtensionBytes;}

manifest.literalPacking='Existing PG06 offsets retained; unused ranges reused without changing live strings';
manifest.geometryOrdering='Existing dictionary blocks retained; approved Body2 strings reuse unused ranges and tail';
delete manifest.templates;
fs.writeFileSync(path.join(out,'catalog.bin'),blob);fs.writeFileSync(path.join(root,'genesis/optimization/evidence/optimized-manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(root,'genesis/contracts/PhilGenesisArtCommitment.sol'),'// SPDX-License-Identifier: MIT\npragma solidity 0.8.27;\n// Owner-approved Body2 correction; existing PG06 format and 896-trait domain.\nlibrary PhilGenesisArtCommitment { bytes32 internal constant EXPECTED = '+commitment+'; }\n');
const report={catalogBytes:blob.length,baseCatalogBytes:base.length,metadataBytes:metadataLength,tokenCount:tokens.length,oldTokenCount:oldTC,dictionaryBlocks:bc,changedTraits:39,unchangedTraits:857,roundtripTraitsBothModes:896,pages:pages.length,retainedPageIndices:unchanged,newPageIndices:pages.map((_,i)=>i).filter(i=>!unchanged.includes(i)),newDataBytes:pages.filter((_,i)=>!unchanged.includes(i)).reduce((n,p)=>n+p.length,0),catalogSHA256:sha(blob),runtimeCommitment:commitment,publicMutation:false};fs.writeFileSync(path.join(__dirname,'catalog-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
