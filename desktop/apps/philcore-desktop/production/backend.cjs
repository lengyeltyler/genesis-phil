'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomBytes } = require('node:crypto');
const { Interface, keccak256, getAddress, getCreateAddress } = require('ethers');
const { createReadRpc, checkedHead, unpack } = require('../../../genesis/production/rpc.cjs');
const { createProductionController } = require('../../../genesis/production/controller.cjs');
const { createStateReader } = require('../../../genesis/production/state.cjs');
const { liveFunding } = require('../../../genesis/production/funding.cjs');
const { bundlerFees } = require('../../../genesis/production/bundler-fees.cjs');
const { buildAuthorization } = require('../../../genesis/runtime/authorization.cjs');
const { bindIdentityAccount } = require('../../../genesis/runtime/profile-store.cjs');
const { claimGenesisExecutionAttempt } = require('../../../genesis/runtime/attempt.cjs');
const { reconcile } = require('../../../genesis/production/reconciliation.cjs');
const { settleReconciledAttempt } = require('../../../genesis/production/settle-attempt.cjs');
const { deriveAccount } = require('./account.cjs');
const { inspectPrivateTree } = require('./namespace.cjs');
const { CHANNELS } = require('../src/shared/bridge-contract.cjs');
const ep = new Interface(['function getNonce(address,uint192) view returns(uint256)']);
const names = new Interface(['function nameIdOf(uint256) view returns(uint256)']);
const nft = new Interface(['function recipeIdOf(uint256) view returns(uint256)', 'function ownerOf(uint256) view returns(address)', 'function totalMinted() view returns(uint256)']);
const fail = code => { throw Object.assign(Error(code), {code}); };
const noInput = x => { if (!x || Object.keys(x).length) fail('GENESIS_SHAPE'); };
function createBackend({ host, root, providers, config, artReader, onProgress=()=>{} }) {
  let busy = false, current = null, lastReview = null;
  const recovery=host.recovery;
  const selectionStore=require('./selection-store.cjs').createSelectionStore(root);
  const progress=(stage,action)=>{try{onProgress({stage,action});}catch{}};
  function policy(identityId) {
    const c=host._genesisIdentityContext();
    if(c.identityId!==identityId)fail('GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED');
    return c.binding.mode;
  }
  function context() {
    const identity = host._genesisIdentityContext(), mode = policy(identity.identityId);
    const derived = deriveAccount(config, identity, mode);
    if (mode === 'DESKTOP_GENESIS') bindIdentityAccount(path.join(root, 'accounts'), derived.profile);
    const key = identity.sessionId + ':' + identity.identityId + ':' + mode;
    controller.bindContext(key,derived.profile.account+':'+identity.binding.configurationHash); current = { identity, ...derived };
    return current;
  }
  function rpcs() {
    const credentials = providers.configuration();
    return { primary: createReadRpc(credentials.primaryRpcUrl), independent: createReadRpc(credentials.independentRpcUrl),
      bundler: createReadRpc(credentials.bundlerRpcUrl), credentials };
  }
  async function sameCall(apis, contract, iface, method, args, tag) {
    const params = [{to:contract,data:iface.encodeFunctionData(method,args)},tag];
    const [a,b] = await Promise.all([apis.primary('eth_call',params),apis.independent('eth_call',params)]);
    if (a !== b) fail('GENESIS_PROVIDER_DISAGREEMENT');
    return iface.decodeFunctionResult(method,a);
  }
  async function infrastructure(apis, head) {
    for (const [address, hash] of [[config.entryPoint,config.entryPointCodeHash],[config.genesis,config.genesisCodeHash],[config.factory,config.factoryCodeHash]]) {
      const [a,b] = await Promise.all([apis.primary('eth_getCode',[address,head.number]),apis.independent('eth_getCode',[address,head.number])]);
      if (a !== b) fail('GENESIS_PROVIDER_DISAGREEMENT');
      if (a === '0x') fail('GENESIS_DEPLOYMENT_PENDING');
      if (keccak256(a) !== hash) fail('GENESIS_CODE_CHANGED');
    }
  }
  async function readState(action, choice) {
    const {profile,creation} = context();
    const recoveryState=recovery.status();if(!recoveryState.readyToFund)fail(recoveryState.reason);
    if (profile.mode === 'PHONE_REQUIRED') fail('GENESIS_PHONE_ENROLLMENT_REQUIRED');
    const apis = rpcs();if(apis.credentials.bundlerQualified===false)fail('GENESIS_DEFAULT_BUNDLER_UNVERIFIED');const head = await checkedHead(apis.primary,apis.independent);
    await infrastructure(apis,head);
    const [a,b] = await Promise.all([apis.primary('eth_getCode',[profile.account,head.number]),apis.independent('eth_getCode',[profile.account,head.number])]);
    if (a !== b) fail('GENESIS_PROVIDER_DISAGREEMENT');
    const deployed = a !== '0x';
    if (deployed && keccak256(a) !== profile.accountCodeHash) fail('GENESIS_CODE_CHANGED');
    if (!deployed && !['MINT_PHIL','WITHDRAW_ETH'].includes(action)) fail('GENESIS_OWNER_CHANGED');
    const nonce = String((await sameCall(apis,profile.entryPoint,ep,'getNonce',[profile.account,0],head.number))[0]);
    const validAfter = String(BigInt(head.timestamp)), validUntil = String(BigInt(head.timestamp) + 300n);
    const recommended = (await bundlerFees(apis.bundler,apis.credentials.bundlerKind,head.baseFeePerGas)).standard;
    const gas = {callGasLimit:'450000',verificationGasLimit:deployed?'350000':'2300000',preVerificationGas:'100000',
      maxFeePerGas:String(BigInt(recommended.maxFeePerGas)), maxPriorityFeePerGas:String(BigInt(recommended.maxPriorityFeePerGas))};
    const withdrawing=action==='WITHDRAW_ETH';
    if(withdrawing&&(typeof choice.amountWei!=='string'||! /^(?:max|[1-9][0-9]{0,77})$/.test(choice.amountWei)))fail('GENESIS_WITHDRAWAL');
    const input = { action, ...(action==='MINT_PHIL'?{nameId:choice.nameId}:{}), ...(withdrawing?{amountWei:choice.amountWei==='max'?'1':choice.amountWei}:{tokenId:action === 'MINT_PHIL' ? choice.recipeId : choice.tokenId}),
      recipient: action === 'MINT_PHIL' ? profile.account : getAddress(choice.recipient).toLowerCase(), nonce,
      authorizationId:'0x'+randomBytes(32).toString('hex'),philNonce:'0x'+randomBytes(32).toString('hex'),validAfter,validUntil,...gas };
    const provisional = buildAuthorization(profile,input,deployed?null:creation);
    const reader = createStateReader({...apis,profile});
    await reader.read(provisional,{requireFunds:false});
    let feeQuote = await liveFunding({...apis,profile,operation:provisional.op,accountDeployed:deployed,bundlerKind:apis.credentials.bundlerKind,action,principalWei:provisional.presentation.principalWei});
    let amountWei=withdrawing?input.amountWei:null;
    if(withdrawing)({amountWei,feeQuote}=await require('../../../genesis/production/withdrawal.cjs').prepareWithdrawal({profile,input,choice,creation:deployed?null:creation,feeQuote,bundler:apis.bundler,reader}));
    const recipeId = withdrawing?null:action === 'MINT_PHIL' ? choice.recipeId : String((await sameCall(apis,profile.genesis,nft,'recipeIdOf',[choice.tokenId],head.number))[0]);
    const nameId = withdrawing?null:action === 'MINT_PHIL' ? choice.nameId : String((await sameCall(apis,getCreateAddress({from:profile.genesis,nonce:1}),names,'nameIdOf',[choice.tokenId],head.number))[0]);
    lastReview = { account:profile.account, action, feeQuote };
    return {profile,nonce,validAfter,validUntil,gas:feeQuote.gas,feeQuote,recipeId,nameId,amountWei,creation:deployed?null:creation};
  }
  async function completeExecution(pkg, isRequestCurrent) {
    const executionContext=host._genesisIdentityContext();
    const apis = rpcs(), reader = createStateReader({...apis,profile:pkg.profile});
    return host._completeGenesisExecution({pkg,isRequestCurrent,host:{networkName:'ethereum-mainnet',
      chainId:async()=>BigInt(await apis.primary('eth_chainId')), now:()=>Math.floor(Date.now()/1000),
      assertSession:async()=>{const c=context();if(c.identity.sessionId !== executionContext.sessionId || c.identity.identityId !== executionContext.identityId || c.profile.account !== pkg.profile.account) fail('GENESIS_IDENTITY_REQUIRED');},
      assertFresh:reader.assertFresh,
      onProgress:stage=>progress(stage,pkg.presentation.action),
      claimAttempt:p=>claimGenesisExecutionAttempt({directory:path.join(root,'attempts'),authorizationPackage:p}),
      // Phone authorization is deliberately not replaced by a Desktop callback.
      phoneApproval:async()=>fail('GENESIS_PHONE_ENROLLMENT_REQUIRED'),
      submit:async(operation,p)=>{
        progress('submitting',p.presentation.action);
        const file=path.join(root,'attempts',p.userOperationHash.slice(2)+'.operation.json');
        const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
        try {fs.writeFileSync(fd,JSON.stringify(p));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
        const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
        // One endpoint and one send, reachable only after protected confirmation,
        // exact-signature validation and the durable attempt claim above.
        let result;
        try {
          const response=await fetch(apis.credentials.bundlerRpcUrl,{method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_sendUserOperation',params:[unpack(operation),p.profile.entryPoint]}),signal:AbortSignal.timeout(15000)});
          if(!response.ok)fail('GENESIS_RECONCILIATION_REQUIRED');
          const reader=response.body?.getReader();if(!reader)fail('GENESIS_RECONCILIATION_REQUIRED');
          const chunks=[];let size=0;
          try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)fail('GENESIS_RECONCILIATION_REQUIRED');chunks.push(Buffer.from(value));}}
          catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
          const text=Buffer.concat(chunks,size).toString('utf8');
          const body=JSON.parse(text);if(body.id!==1||body.jsonrpc!=='2.0'||body.error||body.result!==p.userOperationHash)fail('GENESIS_RECONCILIATION_REQUIRED');
          progress('waiting',p.presentation.action);
          result=await reconcile({pkg:p,...apis});
          for(let poll=0;result.status==='pending'&&poll<10;poll++){
            await new Promise(resolve=>setTimeout(resolve,3000));
            result=await reconcile({pkg:p,...apis});
          }
        } catch {fail('GENESIS_RECONCILIATION_REQUIRED');}
        if(result.status!=='confirmed')fail('GENESIS_RECONCILIATION_REQUIRED');
        return result;
      }
    }});
  }
  const controller=createProductionController({artReader,readState,completeExecution,selectionStore,onBatch:async value=>{context();onProgress({stage:'rolling',...value});await new Promise(resolve=>setTimeout(resolve,120));}});
  function publicState() {
    const snapshot=host.snapshot();
    let account=null;
    if(snapshot.session.lockState==='unlocked') {const c=context();account={address:c.profile.account,mode:c.profile.mode};}
    return {identities:snapshot.localIdentities.map(x=>({identityId:x.identityId,label:x.label})),
      identity:snapshot.identity?{identityId:snapshot.identity.identityId,label:snapshot.identity.label}:null,
      pendingSubmission:account?require('./attempt-status.cjs').hasUnresolvedAttempt(path.join(root,'attempts'),account.address):false,
      lockState:snapshot.session.lockState,sessionExpiresAt:snapshot.session.expiresAt??null,account,recovery:snapshot.session.lockState==='unlocked'?recovery.status():null,providers:providers.status(),network:'Ethereum Mainnet',mintPrice:'Free',supply:369};
  }
  async function invoke(action,input={}) {
    for(const name of ['identities','accounts','attempts','providers','selections'])inspectPrivateTree(path.join(root,name));
    if(action==='cancel'){noInput(input);return controller.cancel();}
    if(action==='lock'){noInput(input);controller.cancel();await host.invoke(CHANNELS.LOCK_SESSION,{});current=null;lastReview=null;return publicState();}
    if(busy)fail('GENESIS_BUSY');busy=true;
    try {
      if(action==='state'){noInput(input);return publicState();}
      if(action==='providers'){controller.cancel();return providers.save(input);}
      if(action==='createIdentity'){
        if(Object.keys(input).sort().join('|')!=='label|mode|passphrase'||!['DESKTOP_GENESIS','PHONE_REQUIRED'].includes(input.mode))fail('GENESIS_SHAPE');
        if(host.snapshot().localIdentities.length)fail('GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED');
        const result=await host.invoke(CHANNELS.CREATE_LOCAL_IDENTITY,{label:input.label,passphrase:input.passphrase,mode:input.mode});
        if(result.status==='failed')fail('GENESIS_IDENTITY_CREATION_FAILED');
        return publicState();
      }
      if(action==='unlock'){
        if(Object.keys(input).sort().join('|')!=='identityId|passphrase')fail('GENESIS_SHAPE');
        await host.invoke(CHANNELS.OPEN_LOCAL_IDENTITY,{identityId:input.identityId});
        const result=await host.invoke(CHANNELS.AUTHENTICATE_LOCAL,{passphrase:input.passphrase});
        if(result.status!=='authenticated')fail('GENESIS_UNLOCK_FAILED');
        const unlocked=await host.invoke(CHANNELS.UNLOCK_VAULT,{});
        if(unlocked.status!=='unlocked')fail('GENESIS_UNLOCK_FAILED');
        return publicState();
      }
      if(action==='lock'){noInput(input);controller.cancel();await host.invoke(CHANNELS.LOCK_SESSION,{});current=null;return publicState();}
      if(action==='balance'){
        noInput(input);const {profile}=context(),apis=rpcs();
        const value=await require('./balance.cjs').readBalance({...apis,account:profile.account,entryPoint:profile.entryPoint});
        if(context().profile.account!==profile.account)fail('GENESIS_CANCELLED');return value;
      }
      if(action==='account'){noInput(input);const c=context();return{address:c.profile.account,mode:c.profile.mode,deployment:'Created on Ethereum with the first mint or withdrawal; local address preparation is free.'};}
      if(['reroll','rerollBatch','selection','keepSelection','releaseSelection','undoSelection'].includes(action)){context();return await controller[action](input);}
      if(action==='reviewMint')return await controller.reviewMint(input);
      if(action==='reviewWithdrawal'){
        if(Object.keys(input).sort().join('|')!=='amountWei|recipient')fail('GENESIS_SHAPE');
        return await controller.reviewWithdrawal({...input,recipient:getAddress(input.recipient).toLowerCase()});
      }
      if(action==='reviewTransfer'){
        if(Object.keys(input).sort().join('|')!=='recipient|tokenId')fail('GENESIS_SHAPE');
        return await controller.reviewTransfer({...input,recipient:getAddress(input.recipient).toLowerCase()});
      }
      if(action==='confirm'){progress('checking','GENESIS');return await controller.confirm(input);}
      if(action==='cancel'){noInput(input);return controller.cancel();}
      if(action==='network'){
        noInput(input);const apis=rpcs(),head=await checkedHead(apis.primary,apis.independent);
        const fees=(await bundlerFees(apis.bundler,apis.credentials.bundlerKind,head.baseFeePerGas)).standard;
        let ready=true;try{await infrastructure(apis,head);}catch(e){if(e.code==='GENESIS_DEPLOYMENT_PENDING')ready=false;else throw e;}
        const recoveryState=recovery.status();const infrastructureReady=ready;ready=ready&&recoveryState.readyToFund&&apis.credentials.bundlerQualified!==false;
        return{ready,infrastructureReady,recovery:recoveryState,block:String(BigInt(head.number)),timestamp:new Date(Number(BigInt(head.timestamp))*1000).toISOString(),
          baseFeeWei:String(BigInt(head.baseFeePerGas)),maxFeePerGasWei:String(BigInt(fees.maxFeePerGas)),
          status:ready?'Verified by both providers':!infrastructureReady?'Collection deployment is pending. Do not fund until deployment is verified.':'Recovery or backup verification is incomplete. Do not fund yet.',lastReview};
      }
      if(action==='owned'){
        noInput(input);const {profile}=context(),apis=rpcs(),head=await checkedHead(apis.primary,apis.independent);await infrastructure(apis,head);
        const supply=Number((await sameCall(apis,profile.genesis,nft,'totalMinted',[],head.number))[0]);
        if(supply<0||supply>369)fail('GENESIS_STATE_CHANGED');
        const owned=[];
        for(let id=0;id<supply;id++){
          const owner=(await sameCall(apis,profile.genesis,nft,'ownerOf',[id],head.number))[0].toLowerCase();
          if(owner===profile.account){const recipe=String((await sameCall(apis,profile.genesis,nft,'recipeIdOf',[id],head.number))[0]);const nameId=String((await sameCall(apis,getCreateAddress({from:profile.genesis,nonce:1}),names,'nameIdOf',[id],head.number))[0]);const art=artReader.render(BigInt(recipe),BigInt(nameId));owned.push({tokenId:String(id),name:art.name+' #'+id,art});}
        }
        return {owned};
      }
      if(action==='reconcile'){
        noInput(input);const {profile}=context(),apis=rpcs(),results=[];
        for(const name of fs.readdirSync(path.join(root,'attempts')).filter(n=>/^[0-9a-f]{64}\.operation\.json$/.test(n))){
          const file=path.join(root,'attempts',name),st=fs.lstatSync(file);
          if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.mode&0o077||st.size>100000)fail('GENESIS_RECONCILIATION_REQUIRED');
          const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
          if(pkg.profile.account===profile.account){
            if(name !== pkg.userOperationHash.slice(2)+'.operation.json')fail('GENESIS_RECONCILIATION_REQUIRED');
            const receipt=await reconcile({pkg,...apis});
            settleReconciledAttempt({directory:path.join(root,'attempts'),pkg,receipt});
            results.push(receipt);
          }
        }
        return {results};
      }
      fail('GENESIS_ACTION');
    } finally {busy=false;}
  }
  return Object.freeze({invoke,recovery,teardown:()=>{controller.cancel();host.teardown();}});
}
module.exports={createBackend};
