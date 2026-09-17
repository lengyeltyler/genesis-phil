'use strict';
// Deterministic independent LZ4 blocks; no external compressor/runtime dependency.
function compress(input,minMatch=4){const b=Buffer.from(input),out=[],table=new Int32Array(65536).fill(-1);const prev=new Int32Array(b.length).fill(-1);let anchor=0,p=0;
 const hash=i=>Math.imul(b.readUInt32LE(i),2654435761)>>>16;
 const extension=n=>{while(n>=255){out.push(255);n-=255;}out.push(n);};
 while(p+12<=b.length){const h=hash(p);let r=table[h],best=-1,length=3,tries=64;prev[p]=r;table[h]=p;while(r>=0&&p-r<=65535&&tries--){if(b.readUInt32LE(r)===b.readUInt32LE(p)){let n=4;while(p+n<b.length-5&&b[r+n]===b[p+n])n++;if(n>length){best=r;length=n;}}r=prev[r];}r=best;if(r<0||length<minMatch){p++;continue;}
 const literal=p-anchor,match=length-4;out.push((Math.min(literal,15)<<4)|Math.min(match,15));if(literal>=15)extension(literal-15);for(let i=anchor;i<p;i++)out.push(b[i]);out.push((p-r)&255,(p-r)>>8);if(match>=15)extension(match-15);
 const end=p+length;for(let i=p+1;i<end&&i+4<=b.length;i++){const h=hash(i);prev[i]=table[h];table[h]=i;}p=end;anchor=p;
 }
 const literal=b.length-anchor;out.push(Math.min(literal,15)<<4);if(literal>=15)extension(literal-15);for(let i=anchor;i<b.length;i++)out.push(b[i]);return Buffer.from(out);
}
function decompress(data,size){const out=Buffer.alloc(size);let p=0,q=0,ops=0,copies=0,extensionBytes=0;while(p<data.length){const t=data[p++];let literal=t>>4;if(literal===15){let x;do{if(p>=data.length)throw Error('LZ4_TRUNCATED');x=data[p++];extensionBytes++;literal+=x;}while(x===255);}if(q+literal>size||p+literal>data.length)throw Error('LZ4_BOUNDS');data.copy(out,q,p,p+literal);p+=literal;q+=literal;ops++;if(p===data.length)break;if(p+2>data.length)throw Error('LZ4_TRUNCATED');const offset=data[p]|data[p+1]<<8;p+=2;let match=t&15;if(match===15){let x;do{if(p>=data.length)throw Error('LZ4_TRUNCATED');x=data[p++];extensionBytes++;match+=x;}while(x===255);}match+=4;if(offset===0||offset>q||q+match>size)throw Error('LZ4_MATCH');for(let i=0;i<match;i++)out[q+i]=out[q+i-offset];let n=match;while(n){const k=Math.min(n,offset);n-=k;copies++;}q+=match;}
 if(q!==size)throw Error('LZ4_LENGTH');return {out,ops,copies,extensionBytes};}
module.exports={compress,decompress};
