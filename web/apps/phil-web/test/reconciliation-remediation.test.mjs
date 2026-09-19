import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Interface, Wallet, id, keccak256 } from "ethers";
import { deriveAccount, buildAuthorization } from "../src/protocol.mjs";

const require = createRequire(import.meta.url);
const { reconcile } = require("../../../genesis/production/reconciliation.cjs");
const config = JSON.parse(
  await readFile(
    new URL(
      "../../philcore-desktop/production/candidate-public-config.json",
      import.meta.url,
    ),
  ),
);
const wallet = new Wallet("0x" + "33".repeat(32));
const derived = deriveAccount(
  config,
  {
    owner: wallet.address.toLowerCase(),
    recoveryAuthority: "0x" + "44".repeat(20),
    identityCommitment: id("WEB_RECONCILIATION_REMEDIATION_FIXTURE"),
  },
  "DESKTOP_GENESIS",
);
const pkg = buildAuthorization(
  derived.profile,
  {
    action: "WITHDRAW_ETH",
    amountWei: "1",
    recipient: derived.profile.recoveryAuthority,
    nonce: "0",
    authorizationId: id("reconcile-authorization"),
    philNonce: id("reconcile-nonce"),
    validAfter: "100",
    validUntil: "400",
    callGasLimit: "450000",
    verificationGasLimit: "2300000",
    preVerificationGas: "100000",
    maxFeePerGas: "1000000000",
    maxPriorityFeePerGas: "1000000",
  },
  derived.creation,
);
const entryPoint = new Interface([
  "function getNonce(address,uint192) view returns(uint256)",
]);
const factory = new Interface([
  "function getAddress(address,address,bytes32,uint8) view returns(address)",
  "function identityOf(address) view returns(bytes32)",
  "function isGenesisAccount(address) view returns(bool)",
]);
const account = new Interface([
  "function identityCommitment() view returns(bytes32)",
  "function owner() view returns(address)",
  "function recoveryAuthority() view returns(address)",
  "function genesis() view returns(address)",
  "function entryPoint() view returns(address)",
  "function authorityEpoch() view returns(uint64)",
  "function authorizationMode() view returns(uint8)",
]);
const safeHash = id("safe-block");

function services({ nonce = 0n, timestamp = 200n, found = null, code = "0x" } = {}) {
  const provider = async (method, params) => {
    if (method === "eth_getBlockByNumber" && params[0] === "safe")
      return {
        number: "0x10",
        hash: safeHash,
        timestamp: "0x" + timestamp.toString(16),
      };
    if (method === "eth_call")
      return entryPoint.encodeFunctionResult("getNonce", [nonce]);
    if (method === "eth_getCode") return code;
    throw Error("UNEXPECTED_" + method);
  };
  const bundler = async (method) => {
    if (method === "eth_getUserOperationReceipt") return null;
    if (method === "eth_getUserOperationByHash") return found;
    throw Error("UNEXPECTED_" + method);
  };
  return { primary: provider, independent: provider, bundler };
}

test("unsubmitted hash remains pending while nonce and validity window remain live", async () => {
  const result = await reconcile({ pkg, ...services() });
  assert.deepEqual(result, {
    status: "pending",
    userOperationHash: pkg.userOperationHash,
    reason: "not_found_unexpired",
  });
});

test("located operation remains pending and is never classified for retry", async () => {
  const result = await reconcile({
    pkg,
    ...services({ found: { userOperationHash: pkg.userOperationHash } }),
  });
  assert.equal(result.status, "pending");
  assert.equal(result.reason, "operation_found");
});

test("safe nonce advancement and safe expiry make the old operation unusable", async () => {
  const advanced = await reconcile({ pkg, ...services({ nonce: 1n }) });
  assert.equal(advanced.status, "retirable");
  assert.equal(advanced.reason, "nonce_advanced");
  assert.equal(advanced.safeBlockHash, safeHash);
  const expired = await reconcile({ pkg, ...services({ timestamp: 401n }) });
  assert.equal(expired.status, "retirable");
  assert.equal(expired.reason, "authorization_expired");
});

test("invalid predeployed code fails closed instead of clearing stale initCode", async () => {
  await assert.rejects(
    reconcile({ pkg, ...services({ code: "0x6000" }) }),
    /GENESIS_RECONCILIATION_REQUIRED/,
  );
});

test("fully bound permissionless predeployment retires only the stale initCode", async () => {
  const candidate = structuredClone(pkg);
  const codes = {
    [candidate.profile.account]: "0x6000",
    [candidate.profile.factory]: "0x6001",
    [candidate.profile.entryPoint]: "0x6002",
    [candidate.profile.genesis]: "0x6003",
  };
  candidate.profile.accountCodeHash = keccak256(codes[candidate.profile.account]);
  candidate.profile.factoryCodeHash = keccak256(codes[candidate.profile.factory]);
  candidate.profile.entryPointCodeHash = keccak256(codes[candidate.profile.entryPoint]);
  candidate.profile.genesisCodeHash = keccak256(codes[candidate.profile.genesis]);
  const values = {
    getAddress: candidate.profile.account,
    identityOf: candidate.profile.identityCommitment,
    isGenesisAccount: true,
    identityCommitment: candidate.profile.identityCommitment,
    owner: candidate.profile.owner,
    recoveryAuthority: candidate.profile.recoveryAuthority,
    genesis: candidate.profile.genesis,
    entryPoint: candidate.profile.entryPoint,
    authorityEpoch: 1n,
    authorizationMode: 1n,
  };
  const provider = async (method, params) => {
    if (method === "eth_getBlockByNumber")
      return { number: "0x10", hash: safeHash, timestamp: "0xc8" };
    if (method === "eth_getCode") return codes[params[0]] ?? "0x";
    if (method === "eth_call") {
      const target = params[0].to;
      if (target === candidate.profile.entryPoint)
        return entryPoint.encodeFunctionResult("getNonce", [0n]);
      const abi = target === candidate.profile.factory ? factory : account;
      const parsed = abi.parseTransaction({ data: params[0].data });
      return abi.encodeFunctionResult(parsed.name, [values[parsed.name]]);
    }
    throw Error("UNEXPECTED_" + method);
  };
  const bundler = async (method) => {
    if (method === "eth_getUserOperationReceipt") return null;
    if (method === "eth_getUserOperationByHash") return null;
    throw Error("UNEXPECTED_" + method);
  };
  const result = await reconcile({
    pkg: candidate,
    primary: provider,
    independent: provider,
    bundler,
  });
  assert.equal(result.status, "retirable");
  assert.equal(result.reason, "valid_account_predeployed");

  values.isGenesisAccount = false;
  await assert.rejects(
    reconcile({
      pkg: candidate,
      primary: provider,
      independent: provider,
      bundler,
    }),
    /GENESIS_RECONCILIATION_REQUIRED/,
  );
});

test("missing safe-block support preserves the ambiguous hold", async () => {
  const base = services();
  const unavailable = async (method, params) => {
    if (method === "eth_getBlockByNumber" && params[0] === "safe")
      throw Error("UNSUPPORTED");
    return base.primary(method, params);
  };
  const result = await reconcile({
    pkg,
    primary: unavailable,
    independent: unavailable,
    bundler: base.bundler,
  });
  assert.equal(result.status, "pending");
  assert.equal(result.reason, "safe_block_unavailable");
});
