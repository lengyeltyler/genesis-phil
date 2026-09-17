import test from "node:test";
import assert from "node:assert/strict";
import { validateRelease } from "../src/release.mjs";
import {
  createReadRpc,
  checkedHead,
} from "../../../genesis/production/rpc.cjs";
import { validatePersistedPackage } from "../src/persisted-package.mjs";
import { deriveAccount, buildAuthorization } from "../src/protocol.mjs";
import { readFile } from "node:fs/promises";
const c = JSON.parse(
  await readFile(
    new URL(
      "../../philcore-desktop/production/candidate-public-config.json",
      import.meta.url,
    ),
  ),
);
test("mixed, stale, preview or enabled release manifest fails closed", () => {
  const expected = {
      sourceDigest: "a".repeat(64),
      commit: "b".repeat(40),
      preview: false,
    },
    release = {
      format: "phil-web-release-v1",
      ...expected,
      mainnetEnabled: false,
    };
  assert.equal(validateRelease(release, expected), release);
  for (const change of [
    { sourceDigest: "c".repeat(64) },
    { commit: "c".repeat(40) },
    { preview: true },
    { mainnetEnabled: true },
    { format: "other" },
  ])
    assert.throws(
      () => validateRelease({ ...release, ...change }, expected),
      /STALE_RELEASE/,
    );
});
test("RPC read adapter refuses submission and wrong chain before requests proceed", async () => {
  let called = false;
  const rpc = createReadRpc("https://eth.drpc.org", {
    fetchImpl: async () => {
      called = true;
      throw Error();
    },
  });
  await assert.rejects(rpc("eth_sendUserOperation", []), /READ_ONLY/);
  assert.equal(called, false);
  await assert.rejects(
    checkedHead(
      async () => "0xaa36a7",
      async () => "0x1",
    ),
    /GENESIS_CHAIN/,
  );
});
test("restored journal reconstructs semantic package and detects recipe, recipient and fee corruption", () => {
  const d = deriveAccount(
      c,
      {
        owner: "0x" + "11".repeat(20),
        recoveryAuthority: "0x" + "22".repeat(20),
        identityCommitment: "0x" + "33".repeat(32),
      },
      "DESKTOP_GENESIS",
    ),
    p = buildAuthorization(
      d.profile,
      {
        action: "MINT_PHIL",
        tokenId: "1",
        nameId: "160",
        recipient: d.profile.account,
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
      d.creation,
    );
  assert.deepEqual(validatePersistedPackage(structuredClone(p)), p);
  for (const change of [
    (x) => (x.presentation.recipeId = "2"),
    (x) => (x.presentation.recipient = "0x" + "44".repeat(20)),
    (x) => (x.authorization.maximumFeeWei = "1"),
    (x) => (x.op.nonce = "1"),
    (x) => (x.profile.chainId = "31337"),
  ]) {
    const altered = structuredClone(p);
    change(altered);
    assert.throws(() => validatePersistedPackage(altered), /JOURNAL_INVALID/);
  }
});

test("current-release guard rejects an updated server, service worker, failure and redirect", async () => {
  const { createReleaseGuard } = await import("../src/release.mjs");
  const expected = {
      sourceDigest: "a".repeat(64),
      commit: "b".repeat(40),
      preview: false,
    },
    release = {
      format: "phil-web-release-v1",
      ...expected,
      mainnetEnabled: false,
    };
  let observed;
  const response = (value) =>
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    });
  const guard = createReleaseGuard(expected, {
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return response(release);
    },
  });
  await guard();
  assert.equal(observed.options.cache, "no-store");
  assert.equal(observed.options.redirect, "error");
  assert.equal(observed.options.credentials, "omit");
  await assert.rejects(
    createReleaseGuard(expected, {
      fetchImpl: async () =>
        response({ ...release, sourceDigest: "c".repeat(64) }),
    })(),
    /STALE_RELEASE/,
  );
  await assert.rejects(
    createReleaseGuard(expected, {
      serviceWorker: { controller: {} },
      fetchImpl: async () => {
        throw Error("must not fetch");
      },
    })(),
    /STALE_RELEASE/,
  );
  await assert.rejects(
    createReleaseGuard(expected, {
      fetchImpl: async () => new Response("", { status: 503 }),
    })(),
    /STALE_RELEASE/,
  );
});

test("direct production network submission is blocked without a request, even with a forged config", async () => {
  const { createNetwork } = await import("../src/network.mjs");
  let calls = 0;
  const apis = {
    primary: async () => {
      calls++;
    },
    independent: async () => {
      calls++;
    },
    bundler: async () => {
      calls++;
    },
  };
  for (const chainId of [1, 31337])
    await assert.rejects(
      createNetwork(
        { ...c, chainId },
        { apis, submit: async () => calls++ },
      ).submit({}, {}),
      /MAINNET_DISABLED/,
    );
  assert.equal(calls, 0);
});
