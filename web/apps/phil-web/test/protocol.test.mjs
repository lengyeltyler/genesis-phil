import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  deriveAccount,
  buildAuthorization,
  encodeChoice,
  decodeChoice,
  recipe,
  generatedName,
} from "../src/protocol.mjs";

const require = createRequire(import.meta.url);
const config = JSON.parse(
  await readFile(
    new URL(
      "../../philcore-desktop/production/candidate-public-config.json",
      import.meta.url,
    ),
  ),
);
const { keccak256, toUtf8Bytes, Interface } = require("ethers");
const identity = {
  owner: "0x0000000000000000000000000000000000000001",
  recoveryAuthority: "0x0000000000000000000000000000000000000002",
  identityCommitment: keccak256(
    toUtf8Bytes("PHIL_WEB_COMPATIBILITY_READ_ONLY_FIXTURE_2026_09_17"),
  ),
};

test("portable account derivation matches the two-provider live factory audit", () => {
  assert.equal(
    deriveAccount(config, identity, "DESKTOP_GENESIS").profile.account,
    "0xf1a20749e642d109ba4bbb40cf2fd7d5cf9fdb4a",
  );
  assert.equal(
    deriveAccount(config, identity, "PHONE_REQUIRED").profile.account,
    "0xe88bc641b5af9cabd04b8e9caabab1c09fded773",
  );
  assert.throws(() => deriveAccount(config, identity, "WEB"), /GENESIS_MODE/);
});

test("shared mint operation preserves account, name/recipe encoding, and fee ceiling", () => {
  const { profile, creation } = deriveAccount(
    config,
    identity,
    "DESKTOP_GENESIS",
  );
  const pkg = buildAuthorization(
    profile,
    {
      action: "MINT_PHIL",
      nameId: "160",
      tokenId: "1",
      recipient: profile.account,
      nonce: "0",
      authorizationId: "0x" + "ab".repeat(32),
      philNonce: "0x" + "cd".repeat(32),
      validAfter: "1789659600",
      validUntil: "1789659900",
      callGasLimit: "500000",
      verificationGasLimit: "3000000",
      preVerificationGas: "100000",
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000",
    },
    creation,
  );
  const abi = new Interface([
    "function mintPhil((bytes32,bytes32,bytes32,uint256,uint64,uint48,uint48,uint256),uint256)",
  ]);
  const decoded = abi.decodeFunctionData("mintPhil", pkg.op.callData);
  assert.equal(decoded[1], encodeChoice(1n, 160n));
  assert.deepEqual(decodeChoice(decoded[1]), { recipeId: 1n, nameId: 160n });
  assert.equal(pkg.op.sender, profile.account);
  assert.equal(pkg.op.initCode, creation.initCode);
  assert.equal(pkg.op.signature, "0x");
  assert.equal(pkg.op.paymasterAndData, "0x");
  assert.equal(pkg.authorization.maximumFeeWei, "3600000000000000");
  assert.equal(pkg.presentation.name, generatedName(160n));
  assert.deepEqual(pkg.presentation.recipe, recipe(1n));
});

test("Desktop entry point delegates to the same derivation without browser custody", () => {
  const desktop = require("../../philcore-desktop/production/account.cjs");
  assert.deepEqual(
    desktop.deriveAccount(config, identity, "DESKTOP_GENESIS"),
    deriveAccount(config, identity, "DESKTOP_GENESIS"),
  );
});
