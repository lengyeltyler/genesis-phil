'use strict';
const fs=require('node:fs'),path=require('node:path');
// Presentation-only warning. This never settles a journal or permits signing.
function hasUnresolvedAttempt(directory,account){
 for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.jsonl'))){let fd;try{
  fd=fs.openSync(path.join(directory,name),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);const st=fs.fstatSync(fd);if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||st.mode&0o077||st.size>16384)return true;
  const bytes=fs.readFileSync(fd,'utf8');if(!bytes.endsWith('\n'))return true;const rows=bytes.trimEnd().split('\n').map(JSON.parse),first=rows[0],last=rows.at(-1);
  if(first?.format!=='phil-genesis-local-execution-attempt-v1')return true;if(first.account!==account)continue;
  if(rows.length!==4||rows[1].state!=='signed'||rows[2].state!=='submission_started'||!/^0x[0-9a-f]{64}$/.test(last.receipt?.transactionHash)||!((last.state==='confirmed'&&last.receipt?.success===true)||(last.state==='failed'&&last.receipt?.success===false&&last.diagnostic==='confirmed_execution_revert')))return true;
 }catch{return true;}finally{if(fd!==undefined)fs.closeSync(fd);}}
 return false;
}
module.exports={hasUnresolvedAttempt};
