"use strict";
const {
  AbiCoder,
  Interface,
  keccak256,
  getAddress,
  getBytes,
  toBeHex,
  concat,
  verifyMessage,
} = require("ethers");
const { p256 } = require("@noble/curves/p256");
const abi = AbiCoder.defaultAbiCoder();
const ACCOUNT = new Interface([
  "function mintPhil((bytes32 authorizationId,bytes32 philNonce,bytes32 presentationDigest,uint256 accountNonce,uint64 authorityEpoch,uint48 validAfter,uint48 validUntil,uint256 maximumFeeWei) authorization,uint256 selectedRecipeId)",
  "function withdrawETH((bytes32 authorizationId,bytes32 philNonce,bytes32 presentationDigest,uint256 accountNonce,uint64 authorityEpoch,uint48 validAfter,uint48 validUntil,uint256 maximumFeeWei) authorization,uint256 amount,address recipient)",
  "function transferPhil((bytes32 authorizationId,bytes32 philNonce,bytes32 presentationDigest,uint256 accountNonce,uint64 authorityEpoch,uint48 validAfter,uint48 validUntil,uint256 maximumFeeWei) authorization,uint256 tokenId,address recipient)",
]);
const built = new WeakSet();
const freeze = (x) => {
  if (x && typeof x === "object") {
    Object.values(x).forEach(freeze);
    Object.freeze(x);
  }
  return x;
};
function fail(code) {
  throw Object.assign(Error(code), { code });
}
function exact(x, keys) {
  if (
    !x ||
    Object.getPrototypeOf(x) !== Object.prototype ||
    Reflect.ownKeys(x).some((k) => typeof k !== "string") ||
    Reflect.ownKeys(x).sort().join("|") !== keys.slice().sort().join("|")
  )
    fail("GENESIS_SHAPE");
  for (const d of Object.values(Object.getOwnPropertyDescriptors(x)))
    if (!("value" in d)) fail("GENESIS_ACCESSOR");
}
function uint(x, bits = 256) {
  if (
    typeof x !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(x) ||
    x.length > 78 ||
    BigInt(x) >= 1n << BigInt(bits)
  )
    fail("GENESIS_UINT");
  return x;
}
function address(x) {
  if (
    typeof x !== "string" ||
    getAddress(x).toLowerCase() !== x ||
    /^0x0{40}$/.test(x)
  )
    fail("GENESIS_ADDRESS");
  return x;
}
function hash(x) {
  if (
    typeof x !== "string" ||
    !/^0x[0-9a-f]{64}$/.test(x) ||
    /^0x0{64}$/.test(x)
  )
    fail("GENESIS_HASH");
  return x;
}
function canonicalJSON(value) {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonicalJSON(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function digest(value) {
  return keccak256(Buffer.from(canonicalJSON(value)));
}
function validateProfile(p) {
  exact(p, [
    "version",
    "identityCommitment",
    "account",
    "factory",
    "entryPoint",
    "chainId",
    "genesis",
    "accountCodeHash",
    "factoryCodeHash",
    "entryPointCodeHash",
    "genesisCodeHash",
    "rendererCodeHash",
    "catalogCommitment",
    "owner",
    "recoveryAuthority",
    "mode",
    "authorityEpoch",
    "policyEpoch",
    "feeCeilingWei",
    "device",
  ]);
  if (
    p.version !== "phil-genesis-profile-v1" ||
    !["DESKTOP_GENESIS", "PHONE_REQUIRED"].includes(p.mode)
  )
    fail("GENESIS_PROFILE");
  for (const k of [
    "account",
    "factory",
    "entryPoint",
    "genesis",
    "owner",
    "recoveryAuthority",
  ])
    address(p[k]);
  for (const k of [
    "identityCommitment",
    "accountCodeHash",
    "factoryCodeHash",
    "entryPointCodeHash",
    "genesisCodeHash",
    "rendererCodeHash",
    "catalogCommitment",
  ])
    hash(p[k]);
  uint(p.chainId);
  if (!["1", "31337"].includes(p.chainId)) fail("GENESIS_CHAIN");
  uint(p.authorityEpoch, 64);
  uint(p.policyEpoch, 64);
  uint(p.feeCeilingWei);
  if (
    BigInt(p.authorityEpoch) === 0n ||
    BigInt(p.policyEpoch) === 0n ||
    BigInt(p.feeCeilingWei) === 0n ||
    p.owner === p.recoveryAuthority
  )
    fail("GENESIS_PROFILE");
  if (p.mode === "DESKTOP_GENESIS") {
    if (p.device !== null) fail("GENESIS_MODE");
  } else {
    exact(p.device, ["deviceId", "keyId", "epoch", "publicKey"]);
    hash(p.device.deviceId);
    hash(p.device.keyId);
    uint(p.device.epoch, 64);
    if (
      typeof p.device.publicKey !== "string" ||
      !/^0x04[0-9a-f]{128}$/.test(p.device.publicKey) ||
      BigInt(p.device.epoch) === 0n
    )
      fail("GENESIS_DEVICE");
  }
  return p;
}
function getUserOpHash(op, entryPoint, chainId) {
  const packed = keccak256(
    abi.encode(
      [
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "bytes32",
        "uint256",
        "bytes32",
        "bytes32",
      ],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.accountGasLimits,
        op.preVerificationGas,
        op.gasFees,
        keccak256(op.paymasterAndData),
      ],
    ),
  );
  return keccak256(
    abi.encode(
      ["bytes32", "address", "uint256"],
      [packed, entryPoint, chainId],
    ),
  );
}
function buildAuthorization(profile, input, creation = null) {
  const withdrawing=input.action==="WITHDRAW_ETH";
  validateProfile(profile);
  exact(input, [
    "action",
    ...(input.action === "MINT_PHIL" ? ["nameId"] : []),
    ...(withdrawing?["amountWei"]:["tokenId"]),
    "recipient",
    "nonce",
    "authorizationId",
    "philNonce",
    "validAfter",
    "validUntil",
    "callGasLimit",
    "verificationGasLimit",
    "preVerificationGas",
    "maxFeePerGas",
    "maxPriorityFeePerGas",
  ]);
  if (!["MINT_PHIL", "TRANSFER_PHIL", "WITHDRAW_ETH"].includes(input.action))
    fail("GENESIS_ACTION");
  for (const k of [
    ...(withdrawing?["amountWei"]:["tokenId"]),
    "nonce",
    "callGasLimit",
    "verificationGasLimit",
    "preVerificationGas",
    "maxFeePerGas",
    "maxPriorityFeePerGas",
    "validAfter",
    "validUntil",
  ])
    uint(
      input[k],
      ["validAfter", "validUntil"].includes(k)
        ? 48
        : [
              "callGasLimit",
              "verificationGasLimit",
              "maxFeePerGas",
              "maxPriorityFeePerGas",
            ].includes(k)
          ? 128
          : k === "nonce"
            ? 64
            : 256,
    );
  hash(input.authorizationId);
  hash(input.philNonce);
  if (input.action === "MINT_PHIL" && BigInt(input.tokenId) === 0n) fail("GENESIS_TOKEN");
  if (input.action === "MINT_PHIL") {
    if (input.recipient !== profile.account) fail("GENESIS_MINT_RECIPIENT");
  } else address(input.recipient);
  if(withdrawing&&(input.amountWei==="0"||input.recipient===profile.account))fail("GENESIS_WITHDRAWAL");
  const {generatedName,validNameId,encodeChoice}=require('../production/names.cjs');
  if(input.action==='MINT_PHIL'){uint(input.nameId);validNameId(BigInt(input.nameId));}
  const { recipe, N } = require("../scripts/recipes.cjs");
  if (!withdrawing && BigInt(input.tokenId) > (input.action === "MINT_PHIL" ? N : 368n)) fail("GENESIS_TOKEN");
  const maximum =
    (BigInt(input.callGasLimit) +
      BigInt(input.verificationGasLimit) +
      BigInt(input.preVerificationGas)) *
    BigInt(input.maxFeePerGas);
  if (
    BigInt(input.callGasLimit) === 0n ||
    BigInt(input.verificationGasLimit) === 0n ||
    maximum === 0n ||
    maximum > BigInt(profile.feeCeilingWei) ||
    BigInt(input.maxPriorityFeePerGas) > BigInt(input.maxFeePerGas) ||
    BigInt(input.validUntil) <= BigInt(input.validAfter) ||
    BigInt(input.validUntil) - BigInt(input.validAfter) > 600n ||
    BigInt(input.callGasLimit) + BigInt(input.verificationGasLimit) >
      16000000n ||
    BigInt(input.preVerificationGas) > 16000000n
  )
    fail("GENESIS_BOUNDS");
  const p = JSON.parse(JSON.stringify(profile));
  const presentation = {
    domain: "PHIL_GENESIS_REVIEW_V3",
    action: input.action,
    chainId: p.chainId,
    account: p.account,
    collection: p.genesis,
    tokenId: input.action === "TRANSFER_PHIL" ? input.tokenId : null,
    recipeId: input.action === "MINT_PHIL" ? input.tokenId : null,
    nameId: input.action === "MINT_PHIL" ? input.nameId : null,
    name: input.action === "MINT_PHIL" ? generatedName(BigInt(input.nameId)) : null,
    recipient: input.recipient,
    principalWei: withdrawing ? input.amountWei : "0",
    maximumFeeWei: String(maximum),
    mode: p.mode,
    recipe: input.action === "MINT_PHIL" ? recipe(BigInt(input.tokenId)) : null,
    profileDigest: digest(p),
  };
  const presentationDigest = digest(presentation),
    a = {
      authorizationId: input.authorizationId,
      philNonce: input.philNonce,
      presentationDigest,
      accountNonce: input.nonce,
      authorityEpoch: p.authorityEpoch,
      validAfter: input.validAfter,
      validUntil: input.validUntil,
      maximumFeeWei: String(maximum),
    };
  const callData = ACCOUNT.encodeFunctionData(
    input.action === "MINT_PHIL" ? "mintPhil" : withdrawing ? "withdrawETH" : "transferPhil",
    input.action === "MINT_PHIL"
      ? [a, encodeChoice(BigInt(input.tokenId),BigInt(input.nameId))]
      : [a, withdrawing ? input.amountWei : input.tokenId, input.recipient],
  );
  let initCode="0x";
  if(creation!==null){
    exact(creation,["initCode"]);
    const factory=new Interface(["function createAccount(address owner,address recovery,bytes32 identity,uint8 mode)"]);
    const expected=concat([p.factory,factory.encodeFunctionData("createAccount",[p.owner,p.recoveryAuthority,p.identityCommitment,p.mode==="PHONE_REQUIRED"?2:1])]).toLowerCase();
    if((input.action!=="MINT_PHIL"&&!withdrawing)||input.nonce!=="0"||creation.initCode!==expected)fail("GENESIS_CREATION_BINDING");
    initCode=expected;
  }
  const op = {
    sender: p.account,
    nonce: input.nonce,
    initCode,
    callData,
    accountGasLimits: toBeHex(
      (BigInt(input.verificationGasLimit) << 128n) | BigInt(input.callGasLimit),
      32,
    ),
    preVerificationGas: input.preVerificationGas,
    gasFees: toBeHex(
      (BigInt(input.maxPriorityFeePerGas) << 128n) | BigInt(input.maxFeePerGas),
      32,
    ),
    paymasterAndData: "0x",
    signature: "0x",
  };
  const userOperationHash = getUserOpHash(op, p.entryPoint, p.chainId),
    phoneDigest = digest({
      domain: "PHIL_GENESIS_PHONE_APPROVAL_V1",
      userOperationHash,
      presentationDigest,
      profileDigest: digest(p),
      authorizationId: a.authorizationId,
      device: p.device,
      validAfter: a.validAfter,
      validUntil: a.validUntil,
    });
  const pkg = freeze({
    profile: p,
    presentation,
    presentationDigest,
    authorization: a,
    op,
    userOperationHash,
    phoneDigest,
  });
  built.add(pkg);
  return pkg;
}
function verifyPhoneApproval(pkg, response) {
  if (pkg.profile.mode !== "PHONE_REQUIRED") fail("GENESIS_PHONE_MODE");
  exact(response, ["decision", "digest", "signature"]);
  if (
    response.decision !== "approve" ||
    response.digest !== pkg.phoneDigest ||
    !/^0x[0-9a-f]{128}$/.test(response.signature)
  )
    fail("GENESIS_PHONE_APPROVAL");
  try {
    if (
      !p256.verify(
        response.signature.slice(2),
        pkg.phoneDigest.slice(2),
        pkg.profile.device.publicKey.slice(2),
        { lowS: true, prehash: false },
      )
    )
      fail("GENESIS_PHONE_SIGNATURE");
  } catch {
    fail("GENESIS_PHONE_SIGNATURE");
  }
}
async function execute(pkg, host, mainnet) {
  if (!built.has(pkg)) fail("GENESIS_UNTRUSTED_PACKAGE");
  // This branch is selected by the trusted host, never by renderer IPC.
  if (
    !["31337", "1"].includes(pkg.profile.chainId) ||
    (mainnet ? (host.networkName !== "ethereum-mainnet" || pkg.profile.chainId !== "1") : host.networkName !== "hardhat") ||
    (await host.chainId()) !== BigInt(pkg.profile.chainId)
  )
    fail("GENESIS_LOCAL_ONLY");
  for (const k of [
    "assertFresh",
    "assertSession",
    "protectedConfirmation",
    "claimAttempt",
    "signHash",
    "submit",
    "now",
  ])
    if (typeof host[k] !== "function") fail("GENESIS_HOST");
  const current = async () => {
    await host.assertSession(pkg);
    const now = BigInt(host.now());
    if (
      now < BigInt(pkg.authorization.validAfter) ||
      now > BigInt(pkg.authorization.validUntil)
    )
      fail("GENESIS_EXPIRED");
  };
  let attempt;
  try {
    await current();
    await host.assertFresh(pkg);
    if (pkg.profile.mode === "PHONE_REQUIRED") {
      if (typeof host.phoneApproval !== "function")
        fail("GENESIS_PHONE_REQUIRED");
      verifyPhoneApproval(pkg, await host.phoneApproval(pkg));
    }
    await current();
    if (
      (await host.protectedConfirmation(
        pkg.presentation,
        pkg.presentationDigest,
      )) !== true
    )
      fail("GENESIS_CONFIRMATION");
    await current();
    await host.assertFresh(pkg);
    attempt = host.claimAttempt(pkg);
    await current();
    const signature = await host.signHash(
      getBytes(pkg.userOperationHash),
      pkg.profile.owner,
    );
    await current();
    if (
      verifyMessage(
        getBytes(pkg.userOperationHash),
        signature,
      ).toLowerCase() !== pkg.profile.owner
    )
      fail("GENESIS_SIGNER");
    attempt.markSigned();
    await host.assertFresh(pkg);
    await current();
    attempt.markSubmissionStarted();
    let acknowledged = false;
    const lifecycle = Object.freeze({
      markSubmitted() {
        if (acknowledged) fail("GENESIS_ATTEMPT_TRANSITION_REJECTED");
        attempt.markSubmitted();
        acknowledged = true;
      },
    });
    const receipt = await host.submit(
      freeze({ ...pkg.op, signature }),
      pkg,
      lifecycle,
    );
    // Local and test hosts may return a receipt directly. Production calls the
    // lifecycle hook immediately after the exact bundler acknowledgement.
    if (!acknowledged) lifecycle.markSubmitted();
    if (receipt?.success === false) {
      attempt.markReverted(receipt);
      fail("GENESIS_EXECUTION_REVERTED");
    }
    attempt.markConfirmed(receipt);
    return receipt;
  } catch (e) {
    if (attempt) attempt.fail();
    fail(
      typeof e?.code === "string" && /^GENESIS_[A-Z_]+$/.test(e.code)
        ? e.code
        : "GENESIS_RECONCILIATION_REQUIRED",
    );
  }
}
const executeLocal=(pkg,host)=>execute(pkg,host,false);
const executeMainnet=(pkg,host)=>execute(pkg,host,true);
function isBuiltAuthorization(pkg){return built.has(pkg);}

module.exports = {
  buildAuthorization,
  validateProfile,
  getUserOpHash,
  verifyPhoneApproval,
  executeLocal,
  executeMainnet,
  isBuiltAuthorization,
  ACCOUNT,
  digest,
  canonicalJSON,
};
