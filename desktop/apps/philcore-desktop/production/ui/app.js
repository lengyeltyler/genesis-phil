'use strict';
const $=id=>document.getElementById(id);
let state,review,selection,fundingQuote;
let working=false,executing=false,lastTransaction=null,stage=null,submissionNeedsCheck=false,disabledBefore=new Map(),batchRolling=false,balanceRequest=0;
const messages={
  GENESIS_PNG_EXISTS:'That PNG already exists. Choose a new filename to keep both images.',
  GENESIS_PNG_DESTINATION:'Choose a writable folder and a filename ending in .png.',
  GENESIS_PNG_WRITE_FAILED:'The PNG could not be saved completely. Choose a new filename and try again.',
  GENESIS_PNG_NOT_OWNED:'This Phil is not currently owned by this account. Refresh My minted Phil.',
  GENESIS_PNG_INVALID:'The image could not be exported safely. Your Phil is unchanged.',
  GENESIS_PNG_FAILED:'The PNG could not be generated. Your Phil is unchanged; try the download again.',
  GENESIS_WITHDRAWAL:'Enter a positive ETH amount and a different nonzero Ethereum recipient address.',
  GENESIS_WITHDRAWAL_ESTIMATE_CHANGED:'The final withdrawal needs a different gas estimate. Nothing was signed. Refresh the review.',
  GENESIS_SELECTION_STORAGE:'Your saved artwork could not be safely read or written. Phil has stopped without replacing it. Keep the app open and contact support.',
  GENESIS_SELECTION_KEPT:'Your chosen Phil is protected. Choose Continue browsing before rerolling.',
  GENESIS_BACKUP_EXISTS:'That backup file already exists. Choose a new filename; Phil does not replace saved backups.',
  GENESIS_BACKUP_DESTINATION:'The backup destination could not be opened. Choose a writable folder and a new filename.',
  GENESIS_BACKUP_WRITE_FAILED:'The backup could not be saved completely. Keep your existing backups and choose a new filename.',
  GENESIS_BACKUP_BYTES:'The selected backup could not be read as a supported backup file.',
  GENESIS_BACKUP_SCHEMA:'The selected file is not a valid Phil backup. Select the encrypted backup you saved.',
  GENESIS_BACKUP_HEADER:'The backup identity record is malformed. Verification stopped.',
  GENESIS_BACKUP_ENVELOPE:'The backup encryption format is damaged or unsupported. Verification stopped.',
  GENESIS_BACKUP_AUTHENTICATION:'The backup could not be authenticated with this passphrase. Check the selected file and its original passphrase; damaged encrypted data also causes this result.',
  GENESIS_BACKUP_MATERIAL:'The decrypted backup authority records are invalid. Verification stopped.',
  GENESIS_BACKUP_VERSION:'This backup version is unsupported. It was not reinterpreted or changed.',
  GENESIS_LOCAL_CUSTODY_INVALID:'The current local custody record failed validation. Backup verification stopped.',
  GENESIS_PLATFORM_BINDING_INVALID:'The current Mac binding failed validation. Backup verification stopped.',
GENESIS_LEGACY_ACCOUNT_REQUIRED:'This older backup does not authenticate its original account policy. Enter the original Phil account address from your independent records; do not take it from an untrusted backup.',GENESIS_DEFAULT_BUNDLER_UNVERIFIED:'Public reads are available, but the default bundler has not passed Genesis execution validation. Mainnet minting remains blocked.',GENESIS_BACKUP_REQUIRED:'Save and verify an encrypted backup before funding. Rerolling is still free.',GENESIS_PLATFORM_REQUIRED:'Mac protected storage is unavailable. Signing is blocked; use your portable backup to restore into a fresh protected installation.',GENESIS_CUSTODY_INVALID:'Protected custody could not be verified. No signing authority was released.',GENESIS_LEGACY_RESTORE_REQUIRED:'This older vault needs an explicit backup restore into fresh protected storage.',GENESIS_BACKUP_SECRET:'Enter your original backup passphrase.',GENESIS_CONFIRMATION:'Mac confirmation was cancelled or unavailable. Nothing was signed.',GENESIS_RECOVERY_INVALID:'Recovery records or the backup could not be verified. Funding and execution are blocked.',GENESIS_RESTORE_REQUIRES_FRESH_STATE:'Restore requires fresh Phil storage. Existing identities and journals will not be overwritten.',GENESIS_PROVIDER_SETUP_REQUIRED:'Open Provider setup and add your own Alchemy and Infura credentials.',
  GENESIS_IDENTITY_OR_RECOVERY_REQUIRED:'Your session is locked. Unlock Phil again to continue.',
  GENESIS_PROVIDER_UNAVAILABLE:'A provider is unavailable or rate-limited. No automatic retry will occur. Wait, then refresh manually.',
  GENESIS_PROVIDER_DISAGREEMENT:'The independent providers disagree. Phil has stopped. Refresh later.',
  GENESIS_DEPLOYMENT_PENDING:'Collection deployment is pending. Do not fund until deployment is verified. Rerolling remains free.',
  GENESIS_PHONE_ENROLLMENT_REQUIRED:'This identity requires authenticated phone enrollment. Protected Mac confirmation cannot replace it.',
  GENESIS_FUNDING:'Insufficient ETH for the requested amount plus the maximum network fee. Fund the Phil account on Ethereum Mainnet and refresh the review.',
  GENESIS_FEE_DATA_UNAVAILABLE:'The fee estimate expired or could not be verified. Refresh before funding or authorizing.',
  GENESIS_MINT_UNAVAILABLE:'This recipe is no longer available, this account has already minted, or all 369 Phils have been minted. Refresh ownership or reroll.',
  GENESIS_PRIVATE_MINT_WINDOW:'Public minting opens September 16 at 9:36 p.m. Denver time. Until then, an approved early wallet must register this Genesis account.',
  GENESIS_PUBLIC_ALLOCATION_EXHAUSTED:'All 336 general mint slots have been used. A reserved mint requires a grant from the deployer to this Genesis account.',
  GENESIS_BOUNDS:'Current gas requirements exceed the account policy. Wait for lower fees; Phil will not weaken the fee ceiling.',
  GENESIS_RECONCILIATION_REQUIRED:'Submission status needs reconciliation. Do not submit again. Use “Check pending submission” in My minted Phil.',
  GENESIS_NONCE_ATTEMPT_ALREADY_EXISTS:'A durable attempt already exists for this account nonce. Check the pending submission; do not retry it.',
  GENESIS_NAME_TAKEN:'Someone already minted this name. This artwork/name pair is saved, but cannot be minted. Close the review and roll a new Phil; names cannot be changed separately.',
  GENESIS_REVIEW_STALE:'This review expired or changed. Review your Phil again.',
  GENESIS_UNLOCK_FAILED:'The identity could not be unlocked. The passphrase may not match, or the saved identity may be damaged.',
  GENESIS_UNLOCK_PLATFORM_REQUIRED:'Your passphrase was accepted, but protected Mac storage could not be opened. Use your verified encrypted backup to restore this identity in a fresh installation. No signing authority was released.',
  GENESIS_IDENTITY_CREATION_FAILED:'Identity creation failed. Use at least 12 characters with uppercase, lowercase, a number and a symbol.',
  GENESIS_BUSY:'Phil is still completing the previous request.',GENESIS_CANCELLED:'The review was cancelled.',
  GENESIS_CODE_CHANGED:'The deployed collection or account differs from the pinned release. Phil has stopped.',
  GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED:'The identity/account binding needs review. Phil will not create a substitute account.',
  GENESIS_STATE_REFRESH_REQUIRED:'Network verification took too long. Your Phil is saved; wait a moment and try again.',GENESIS_OWNER_CHANGED:'This Phil is no longer owned by this account.'};
let sessionRolls=0;
function countRoll(){sessionRolls++;$('rollCount').textContent='Rolls: '+sessionRolls;}
function notice(text){$('notice').textContent=text;}
const progressLabels={checking:'Verifying current Mainnet state…',approval:'Awaiting your protected Mac approval…',signing:'Preparing the authorized transaction…',submitting:'Submitting once to Ethereum…',waiting:'Submitted — waiting for Ethereum confirmation…'};
function progress(value,help=''){
  $('operationStatus').hidden=false;$('operationText').textContent=value;$('operationHelp').textContent=help;$('operationSpinner').hidden=!working;
  $('copyTransaction').hidden=!lastTransaction;
}
function setWorking(value){working=value;document.body.setAttribute('aria-busy',String(value));
 if(value){disabledBefore=new Map();for(const element of document.querySelectorAll('button,input,select')){if(element.id==='lock')continue;disabledBefore.set(element,element.disabled);element.disabled=true;}}
 else{for(const [element,disabled]of disabledBefore)element.disabled=disabled;disabledBefore.clear();$('operationSpinner').hidden=true;updateSelection();}
}
window.phil.onProgress?.(value=>{if(value.stage==='rolling'){if(batchRolling){countRoll();showArt({...value.art,kept:false,canUndo:false});progress('Rolling '+value.index+' of '+value.count+'…','Only the final Phil will be kept. Intermediate rolls cannot be recovered.');}return;}if(!executing)return;stage=value.stage;progress(progressLabels[stage]||'Working…',stage==='waiting'?'Do not authorize again. Confirmation may take a moment.':'Your chosen artwork is saved.');$('reviewFunding').textContent=progressLabels[stage]||'Working…';$('reviewProgress').textContent=progressLabels[stage]||'Working…';});
function updateSelection(){if(!working){$('mint').disabled=submissionNeedsCheck;$('transferForm').querySelector('button').disabled=submissionNeedsCheck;$('withdrawForm').querySelector('button').disabled=submissionNeedsCheck;}if(!selection)return;$('selectionStatus').textContent=selection.kept?'Kept on this Mac. Safe through locking and reopening. This is not an on-chain reservation.':'Latest roll saved on this Mac. Use Keep this Phil to protect it from accidental rerolls.';if(!working){$('keepSelection').disabled=selection.kept;$('undoSelection').disabled=selection.kept||!selection.canUndo;$('reroll').textContent=selection.kept?'Continue browsing':'Reroll';}}
function sessionWarning(){const until=state?.sessionExpiresAt;if(state?.lockState!=='unlocked'||!until){$('sessionWarning').hidden=true;return;}const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));$('sessionWarning').hidden=seconds>120;$('sessionWarning').textContent='Your protected session locks in '+Math.ceil(seconds/60)+' minute(s). Your artwork choice is saved. Unlock again to continue; no transaction is retried automatically.';}

async function call(action,input={}){const response=await window.phil[action](input);if(!response.ok)throw Error(messages[response.error]||('Phil stopped safely: '+response.error));if(action==='reroll')countRoll();return response.value;}
function eth(wei){const n=BigInt(wei),whole=n/10n**18n,fraction=(n%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');return whole+(fraction?'.'+fraction:'')+' ETH';}
function pairs(element,rows){element.replaceChildren();for(const [key,value]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=String(value);element.append(dt,dd);}}
function traitName(value){return value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');}
function showArt(art){selection=art;fundingQuote=null;$('fundingDetails').hidden=true;$('fundingQuote').textContent='Refresh the funding estimate for this Phil.';$('philArt').src=art.image;$('philArt').alt=art.name||'Your selected Phil';$('philName').textContent=art.name||'A Phil for you.';pairs($('traits'),art.traits.map(t=>[traitName(t.category),traitName(t.name)]));updateSelection();}
function tab(name){for(const id of ['discover','owned','account'])$(id+'Panel').hidden=id!==name;for(const [id,target]of [['discoverTab','discover'],['ownedTab','owned'],['fundingTab','account']])$(id).classList.toggle('active',target===name);}
async function refresh(){state=await call('state');if(state.pendingSubmission)submissionNeedsCheck=true;const unlocked=state.lockState==='unlocked';$('welcome').hidden=unlocked;$('workspace').hidden=!unlocked;$('lock').hidden=!unlocked;
  if(!unlocked){balanceRequest++;$('walletBalance').textContent='Loading balance…';$('walletDeposit').textContent='';$('balanceStatus').textContent='';selection=null;review=null;$('review').close();$('replaceSelection').close();$('artworkViewer').close();}
  $('backupPanel').hidden=!unlocked;$('backupPanel').open=!state.recovery?.backupVerified;$('restorePanel').hidden=state.identities.length>0;
  if(unlocked)$('recoveryStatus').textContent=state.recovery?.configured?(state.recovery.backupVerified?'Encrypted backup verified. ':'Required: save and verify an encrypted backup. ')+'Distinct authorities and Mac platform binding are verified. Network readiness is checked separately.':'Recovery configuration is missing or invalid. Do not fund.';
  $('identityForm').hidden=state.identities.length>0;$('unlockForm').hidden=state.identities.length===0;
  if(state.identities.length)$('identityName').textContent=state.identities[0].label;
  $('providerStatus').textContent=state.providers.userSupplied?'Advanced configuration saved: Alchemy primary + bundler; independent Infura verification.':'Default: dRPC + independent PublicNode reads; Candide public bundler. No developer account required. Public service limits apply.';
  if(unlocked){const account=await call('account');$('accountAddress').textContent=account.address;$('accountExplanation').textContent=account.deployment;
    if($('walletBalance').textContent==='Loading balance…')await refreshBalance();
    $('policyLabel').textContent=account.mode==='PHONE_REQUIRED'?'Phone-required authorization. No Desktop fallback.':'Protected Mac authorization. Mint Phil, transfer Phil, and withdraw ETH. Every operation requires your approval.';
    if(!selection)showArt((await call('selection'))||await call('reroll'));if(submissionNeedsCheck)progress('A previous attempt needs checking.','Use Check pending submission in My minted Phil. Mint, transfer and withdrawal authorization are paused.');}
}
function handler(id,event,fn){$(id).addEventListener(event,async e=>{e.preventDefault();if(working&&id!=='lock')return;const target=e.submitter||e.currentTarget;
  if(target instanceof HTMLButtonElement)target.disabled=true;
  try{await fn(e);}catch(error){notice(error.message);}finally{if(target instanceof HTMLButtonElement)target.disabled=target.id==='authorize'&&(!review||Date.now()>review.feeQuote.expiresAtMs||!review.feeQuote.withinCap||BigInt(review.feeQuote.availableWei)<BigInt(review.maximumFeeWei)+BigInt(review.principalWei||"0"));updateSelection();}});}
handler('identityForm','submit',async()=>{
  const passphrase=$('createPassphrase').value;if(passphrase!==$('confirmPassphrase').value)throw Error('The passphrases do not match.');
  await call('createIdentity',{label:$('identityLabel').value,passphrase,mode:$('mode').value});
  $('createPassphrase').value='';$('confirmPassphrase').value='';await refresh();notice('Phil Identity created. Unlock it to prepare your one Phil account. No on-chain account has been deployed.');
});
handler('unlockForm','submit',async()=>{const passphrase=$('unlockPassphrase').value;$('unlockPassphrase').value='';await call('unlock',{identityId:state.identities[0].identityId,passphrase});await refresh();notice('Your Phil account address is ready. On-chain setup happens with your first mint or withdrawal.');});
handler('providerForm','submit',async()=>{const input={alchemy:$('alchemy').value.trim(),infura:$('infura').value.trim()};$('alchemy').value='';$('infura').value='';await call('providers',input);await refresh();notice('Provider settings saved through macOS protected storage.');});
handler('lock','click',async()=>{await call('lock');selection=null;review=null;$('review').close();await refresh();notice('Phil is locked.');});
handler('reroll','click',async()=>{if(selection?.kept){$('replaceSelection').showModal();return;}showArt(await call('reroll'));notice('New Phil saved on this Mac. Undo last reroll returns to the previous one.');});
handler('keepSelection','click',async()=>{showArt(await call('keepSelection'));notice('This Phil is kept on this Mac. It is not reserved on-chain.');});
handler('undoSelection','click',async()=>{showArt(await call('undoSelection'));notice('Previous Phil restored and kept.');});
handler('staySelection','click',async()=>{$('replaceSelection').close();});
handler('allowReroll','click',async()=>{showArt(await call('releaseSelection'));$('replaceSelection').close();notice('Browsing enabled. Your existing choice stays selected until you reroll.');});
handler('copyTransaction','click',async()=>{await call('copyTransaction',{transactionHash:lastTransaction});notice('Etherscan transaction link copied.');});
handler('home','click',()=>{if(state?.lockState==='unlocked')tab('discover');window.scrollTo({top:0,behavior:'instant'});});
handler('expand','click',()=>{if(!selection)return;$('enlargedArt').src=selection.image;$('enlargedArt').alt=selection.name||'Your selected Phil';$('artworkViewerTitle').textContent=selection.name||'Your Phil';$('artworkViewer').showModal();});
handler('closeArtwork','click',()=>{$('artworkViewer').close();});
$('artworkViewer').addEventListener('click',event=>{if(event.target!==$('artworkViewer'))return;const box=$('artworkViewer').getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)$('artworkViewer').close();});
handler('copyAccount','click',async()=>{await call('copyAccount');notice('Phil account address copied. Ethereum Mainnet only.');});
handler('donation','click',async()=>{await call('copyDonation');notice('tylerlengyel.eth copied. Donations are optional and sent outside the Genesis action policy.');});
handler('discoverTab','click',async()=>tab('discover'));handler('ownedTab','click',async()=>tab('owned'));handler('fundingTab','click',async()=>{tab('account');await refreshBalance();});
async function refreshBalance(){
 const request=++balanceRequest,address=$('accountAddress').textContent;
 $('balanceStatus').textContent='Checking both Mainnet providers…';
 try{const value=await call('balance');if(request!==balanceRequest||state?.lockState!=='unlocked'||value.account!==address)return;
  $('walletBalance').textContent=eth(value.balanceWei);$('walletDeposit').textContent='EntryPoint deposit: '+eth(value.depositWei)+' · Total available: '+eth(value.availableWei);
  $('balanceStatus').textContent='Verified at '+new Date(value.observedAtMs).toLocaleTimeString()+' · Block '+value.block;
 }catch(error){if(request!==balanceRequest)return;$('walletBalance').textContent='Balance unavailable';$('walletDeposit').textContent='';$('balanceStatus').textContent=error.message;}
}
handler('refreshBalance','click',refreshBalance);
async function rollBatch(count){
 if(selection?.kept){$('replaceSelection').showModal();return;}
 batchRolling=true;setWorking(true);progress('Starting '+count+' rolls…','Only the final Phil will be kept.');
 try{showArt(await call('rerollBatch',{count}));notice(count+' rolls complete. The final artwork and name are saved; intermediate rolls cannot be recovered.');progress('Batch complete.');}
 catch(error){const saved=await call('selection').catch(()=>null);if(saved)showArt(saved);progress(error.message,'Your last saved Phil is preserved.');throw error;}
 finally{batchRolling=false;setWorking(false);}
}
handler('reroll10','click',()=>rollBatch(10));handler('reroll100','click',()=>rollBatch(100));
function feeRows(q,action='MINT_PHIL'){
  return [[action==='WITHDRAW_ETH'?'Withdrawal service charge':action==='TRANSFER_PHIL'?'Collection transfer charge':'Mint price','0 ETH'],['Current base / network fee',gwei(q.baseFeeWei)],['Bundler priority recommendation',gwei(q.priorityFeeWei)],['Bundler maximum gas-price recommendation',gwei(q.maxFeePerGasWei)],['Account-deployment estimate',eth(q.setupWei)],[action==='WITHDRAW_ETH'?'Withdrawal network estimate':action==='TRANSFER_PHIL'?'Transfer estimate':'Mint estimate',eth(q.mintWei)],['Required prefund',eth(q.requiredPrefundWei)],['Safety margin ('+q.marginPercent+'%)',eth(q.safetyMarginWei)],['Recommended balance',eth(q.recommendedWei)],['Current account ETH balance',eth(q.balanceWei)],['Existing EntryPoint deposit',eth(q.depositWei)],['Available total',eth(q.availableWei)],['Funding shortfall',eth(q.additionalWei)],['Refreshed',new Date(q.observedAtMs).toLocaleString()]];
}
function gwei(value){const n=BigInt(value),f=(n%1000000000n).toString().padStart(9,'0').replace(/0+$/,'');return(n/1000000000n)+(f?'.'+f:'')+' gwei';}
function displayFunding(q,action){fundingQuote=q;$('fundingDetails').hidden=false;pairs($('fundingDetails'),feeRows(q,action));$('fundingQuote').classList.remove('quote-expired');$('fundingQuote').textContent='Current estimate. Mint price: 0 ETH. Network fees are separate. Unused ETH can be withdrawn after approval; withdrawals also cost network fees.';}
handler('refreshNetwork','click',async()=>{
  setWorking(true);progress('Checking balance and network fees…');
  fundingQuote=null;$('fundingDetails').hidden=true;$('fundingQuote').textContent='Checking current fees…';
  try{const data=await call('network');$('networkData').textContent=data.status+' Block '+data.block+' · '+data.timestamp+' · Base fee: '+gwei(data.baseFeeWei)+' · Maximum gas price: '+gwei(data.maxFeePerGasWei)+'.';
  if(!data.ready){$('fundingQuote').textContent=data.status;return;}
  showArt(await call('keepSelection'));const value=await call('reviewMint');await call('cancel');displayFunding(value.feeQuote,value.action);progress(BigInt(value.feeQuote.additionalWei)===0n?'Account funded for this estimate.':'Funding shortfall shown below.');
  }catch(error){$('fundingQuote').textContent='No current estimate. '+error.message;progress(error.message);throw error;}finally{setWorking(false);}
});
async function showReview(value){review=value;const withdrawing=value.action==='WITHDRAW_ETH';$('authorize').textContent='Authorize with protected Mac confirmation';$('reviewProgress').hidden=true;
  $('reviewTitle').textContent=withdrawing?'Withdraw ETH':value.action==='MINT_PHIL'?'Mint '+(value.art.name||'this Phil'):'Transfer '+(value.art.name||'Phil')+' #'+value.tokenId;
  $('reviewArt').hidden=withdrawing;if(!withdrawing)$('reviewArt').src=value.art.image;
  pairs($('reviewDetails'),[...(!withdrawing?[['Phil',value.art.name+(value.action==='TRANSFER_PHIL'?' #'+value.tokenId:' — number assigned at mint')]]:[]),['Network','Ethereum Mainnet'],['Action',value.action],['Phil account',value.account],['Recipient',value.recipient],[withdrawing?'Exact ETH sent to recipient':value.action==='TRANSFER_PHIL'?'Collection transfer charge':'Mint price',eth(value.principalWei)],['Maximum Ethereum network fee',eth(value.maximumFeeWei)],['Maximum total debit',eth(BigInt(value.principalWei)+BigInt(value.maximumFeeWei))],['Review expires',new Date(Math.min(Number(value.validUntil)*1000,value.feeQuote.expiresAtMs)).toLocaleString()]]);
  $('reviewPolicy').textContent=value.mode==='PHONE_REQUIRED'?'Authenticated phone approval and protected Mac confirmation are required.':'Fresh protected Mac confirmation is required.';
  const q=value.feeQuote;displayFunding(q,value.action);pairs($('reviewFeeDetails'),feeRows(q,value.action));$('reviewFunding').classList.remove('quote-expired');$('reviewFunding').textContent=withdrawing?'The recipient receives exactly the amount shown. Unused fee refunds can remain in your account afterward. Check the full recipient address.':'Gas limits are conservative budgets validated by the bundler. Actual network fees can be lower. Unused ETH can be withdrawn after approval.';
  $('authorize').disabled=Date.now()>q.expiresAtMs||!q.withinCap||BigInt(q.availableWei)<BigInt(value.maximumFeeWei)+BigInt(value.principalWei);
  $('review').showModal();
}
async function startReview(action,input={}){lastTransaction=null;setWorking(true);progress(action==='reviewMint'?'Checking mint eligibility and fees…':action==='reviewWithdrawal'?'Checking withdrawal amount, recipient and fees…':'Checking transfer ownership and fees…','Your selected artwork stays saved if this check fails.');
 try{if(action==='reviewMint')showArt(await call('keepSelection'));const value=await call(action,input);setWorking(false);await showReview(value);notice('Review ready. Nothing has been signed.');progress('Review ready. Nothing has been signed.',action==='reviewWithdrawal'?'Check the exact amount, recipient and maximum fee before authorizing.':'Check the artwork, recipient and maximum fee before authorizing.');}
 catch(error){progress(error.message,'Your choice is saved. No transaction was submitted by this review.');throw error;}finally{setWorking(false);}}
handler('mint','click',async()=>{await startReview('reviewMint');});
handler('closeReview','click',async()=>{await call('cancel');review=null;$('review').close();});
$('review').addEventListener('cancel',event=>{if(executing){event.preventDefault();return;}review=null;void call('cancel').catch(e=>notice(e.message));});
handler('authorize','click',async()=>{
 if(!review||Date.now()>review.feeQuote.expiresAtMs)throw Error('This fee estimate expired. Refresh the review.');
 $('reviewProgress').hidden=false;$('reviewProgress').textContent=progressLabels.checking;$('authorize').textContent='In progress — do not submit again';$('review').scrollTop=0;
 const id=review.reviewId,action=review.action;review=null;executing=true;stage='checking';setWorking(true);lastTransaction=null;progress(progressLabels.checking,'Your artwork remains saved.');
 try{const result=await call('confirm',{reviewId:id});lastTransaction=result.transactionHash;$('review').close();progress(action==='MINT_PHIL'?'Mint confirmed on Ethereum.':action==='WITHDRAW_ETH'?'ETH withdrawal confirmed on Ethereum.':'Transfer confirmed on Ethereum.','Transaction: '+result.transactionHash);notice('Confirmed on Ethereum: '+result.transactionHash);tab(action==='WITHDRAW_ETH'?'account':'owned');
  try{if(action==='WITHDRAW_ETH')await refreshBalance();else await refreshOwned();}catch{notice('Transaction confirmed: '+result.transactionHash+'. Ownership display could not refresh. Refresh ownership manually; do not submit again.');}
 }catch(error){$('review').close();const uncertain=['signing','submitting','waiting'].includes(stage);if(uncertain)submissionNeedsCheck=true;progress(error.message,uncertain?'Do not authorize again. Use Check pending submission in My minted Phil; a signed attempt may need reconciliation.':'Your Phil is saved. Review again after resolving this error.');throw error;}
 finally{executing=false;setWorking(false);$('authorize').disabled=true;}
});
async function refreshOwned(){const data=await call('owned');$('ownedList').replaceChildren();$('transferToken').replaceChildren();
  for(const phil of data.owned){const card=document.createElement('article'),img=document.createElement('img'),title=document.createElement('h3');img.src=phil.art.image;img.alt=phil.name;title.textContent=phil.name;const download=document.createElement('button');download.type='button';download.textContent='Download PNG';download.addEventListener('click',async()=>{download.disabled=true;progress('Preparing your PNG…','Verifying the minted artwork, then opening the save dialog.');try{const result=await call('downloadPNG',{tokenId:phil.tokenId});progress(result.cancelled?'PNG download cancelled.':'PNG saved — 2048 × 2048.');notice(result.cancelled?'Nothing was saved.':'Your minted Phil was saved as a PNG.');}catch(error){progress(error.message);notice(error.message);}finally{download.disabled=false;}});card.append(img,title,download);$('ownedList').append(card);const option=document.createElement('option');option.value=phil.tokenId;option.textContent=phil.name;$('transferToken').append(option);}
  $('ownedStatus').textContent=data.owned.length?'Ownership verified using both Mainnet providers.':'No Genesis Phil is currently owned by this account.';$('transferForm').hidden=data.owned.length===0;
}
handler('refreshOwned','click',async()=>{setWorking(true);progress('Checking ownership with both Mainnet providers…');try{await refreshOwned();progress('Ownership refreshed.');}catch(error){progress(error.message);throw error;}finally{setWorking(false);}});
function updateWithdrawalMode(){const all=$('withdrawMax').checked;$('withdrawAmountLabel').hidden=all;$('withdrawAmount').disabled=all;$('withdrawAmount').required=!all;$('reviewWithdrawal').textContent=all?'Review withdraw all':'Review withdrawal';}
$('withdrawMax').addEventListener('change',updateWithdrawalMode);
$('withdrawCustom').addEventListener('change',updateWithdrawalMode);
updateWithdrawalMode();
handler('withdrawForm','submit',async()=>{
 const recipient=$('withdrawRecipient').value.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(recipient)||/^0x0{40}$/.test(recipient))throw Error('Enter a nonzero Ethereum address.');
 let amountWei='max';if(!$('withdrawMax').checked){const entered=$('withdrawAmount').value.trim(),value=entered.startsWith('.')?'0'+entered:entered;if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value))throw Error('Enter an ETH amount such as 0.001 (up to 18 decimal places).');const [whole,fraction='']=value.split('.');amountWei=String(BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0')));if(amountWei==='0')throw Error('Enter a positive ETH amount.');}
 await startReview('reviewWithdrawal',{recipient,amountWei});
});
handler('transferForm','submit',async()=>{const recipient=$('recipient').value.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(recipient)||/^0x0{40}$/.test(recipient))throw Error('Enter a nonzero Ethereum address.');await startReview('reviewTransfer',{tokenId:$('transferToken').value,recipient});});
handler('reconcile','click',async()=>{setWorking(true);progress('Checking the recorded attempt…','Read-only check. Nothing will be signed or resubmitted.');try{const data=await call('reconcile'),latest=await call('state');submissionNeedsCheck=Boolean(latest.pendingSubmission)||data.results.some(x=>x.status!=='confirmed');const message=data.results.length?data.results.map(x=>x.status==='confirmed'?(x.success?'Confirmed: ':'Reverted: ')+x.transactionHash:'Pending: '+x.userOperationHash).join(' · '):submissionNeedsCheck?'A signing attempt is held without a recorded submission. Keep it intact and contact support.':'No recorded submission for this account.';notice(message);progress(message,submissionNeedsCheck?'Do not authorize again until this attempt is resolved.':'Status checked. No transaction was retried.');}catch(error){progress(error.message,'Keep the existing attempt intact. Do not submit again.');throw error;}finally{setWorking(false);}});
refresh().catch(error=>notice(error.message));
setInterval(()=>{if(fundingQuote&&Date.now()>fundingQuote.expiresAtMs){$('fundingQuote').textContent='Estimate expired. Refresh before funding or authorizing.';$('fundingQuote').classList.add('quote-expired');$('fundingDetails').hidden=true;}if(review&&Date.now()>review.feeQuote.expiresAtMs){$('authorize').disabled=true;$('reviewFunding').textContent='Estimate expired. Close this review and refresh before authorizing.';$('reviewFunding').classList.add('quote-expired');$('reviewFeeDetails').replaceChildren();}},1000);
// Session status is local only. Keep the visible vault state in step with the
// protected host's automatic lock without issuing background provider requests.
setInterval(async()=>{try{const latest=await call('state');if(latest.lockState!==state?.lockState){await refresh();if(latest.lockState==='locked')notice('Phil locked to protect your account. Your artwork choice is saved on this Mac. Unlock to continue.');}else state=latest;if(latest.pendingSubmission)submissionNeedsCheck=true;updateSelection();sessionWarning();}catch{}},5000);

handler('saveBackup','click',async()=>{const passphrase=$('backupPassphrase').value;$('backupPassphrase').value='';const result=await call('saveBackup',{passphrase});if(result.saved)notice('Encrypted backup saved. Store it offline, then open and verify it below. No plaintext private keys were exported.');});
handler('verifyBackupForm','submit',async()=>{const passphrase=$('backupPassphrase').value;$('backupPassphrase').value='';const result=await call('verifyBackup',{passphrase});if(!result.cancelled){await refresh();notice('Portable backup verified against this identity and account. Platform binding and network readiness are checked separately.');}});
handler('restoreBackupForm','submit',async()=>{const passphrase=$('restorePassphrase').value;$('restorePassphrase').value='';const result=await call('restoreBackup',{passphrase,expectedAccount:$('restoreAccount').value.trim()});if(result.restored)notice('Encrypted identity restored to the same account. Quit and reopen Phil. The same account has a new local platform binding. The restored backup is verified. Unlock and check network readiness before funding.');});
