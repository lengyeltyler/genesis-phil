import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { IDBFactory } from "fake-indexeddb";
import { Wallet, id, getBytes } from "ethers";
import { deriveAccount, buildAuthorization } from "../src/protocol.mjs";
import { openStore, createJournal } from "../src/storage.mjs";
import { createExecution } from "../src/execution.mjs";

const config = JSON.parse(
  await readFile(
    new URL(
      "../../philcore-desktop/production/candidate-public-config.json",
      import.meta.url,
    ),
  ),
);
const owner = new Wallet("0x" + "11".repeat(32));
const header = {
  owner: owner.address.toLowerCase(),
  recoveryAuthority: "0x" + "22".repeat(20),
  identityCommitment: id("WEB_ATTEMPT_REMEDIATION_FIXTURE"),
};
const derived = deriveAccount(config, header, "DESKTOP_GENESIS");
let serial = 0;
function operation() {
  serial++;
  return buildAuthorization(
    derived.profile,
    {
      action: "WITHDRAW_ETH",
      amountWei: "1",
      recipient: header.recoveryAuthority,
      nonce: "0",
      authorizationId: id("web-attempt-authorization-" + serial),
      philNonce: id("web-attempt-nonce-" + serial),
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
}
const locks = { request: async (_name, _options, body) => body({}) };
function custody({ beforeClaim = false } = {}) {
  return {
    lock() {},
    async signOnce(pkg, claim) {
      if (beforeClaim) throw Error("SIGNING_CANCELLED");
      await claim();
      return owner.signMessage(getBytes(pkg.userOperationHash));
    },
  };
}
function network(pkg, overrides = {}) {
  return {
    mainnetEnabled: true,
    assertMainnet: async () => {},
    assertFresh: async () => {},
    submit: async () => ({
      status: "pending",
      userOperationHash: pkg.userOperationHash,
    }),
    reconcile: async () => ({
      status: "confirmed",
      success: true,
      userOperationHash: pkg.userOperationHash,
    }),
    ...overrides,
  };
}
async function fixture() {
  const store = await openStore(new IDBFactory());
  return { store, journal: createJournal(store) };
}

test("failure before signing creates no durable hold", async (t) => {
  const f = await fixture();
  t.after(() => f.store.close());
  const pkg = operation();
  const engine = createExecution({
    custody: custody({ beforeClaim: true }),
    journal: f.journal,
    network: network(pkg),
    locks,
  });
  engine.review({ pkg, preparedAt: Date.now() });
  await assert.rejects(engine.confirm(), /SIGNING_CANCELLED/);
  assert.equal((await f.journal.pending(pkg.profile.account)).length, 0);
});

test("signed but never submitted retires after restart and permits one newly reviewed operation", async (t) => {
  const f = await fixture();
  t.after(() => f.store.close());
  const first = operation();
  let freshness = 0;
  const firstNetwork = network(first, {
    assertFresh: async () => {
      if (++freshness === 2) throw Error("TRANSIENT_READ_FAILURE");
    },
  });
  const firstEngine = createExecution({
    custody: custody(),
    journal: f.journal,
    network: firstNetwork,
    locks,
  });
  firstEngine.review({ pkg: first, preparedAt: Date.now() });
  await assert.rejects(firstEngine.confirm(), /RECONCILIATION_REQUIRED/);
  let [record] = await f.journal.pending(first.profile.account);
  assert.equal(record.state, "signed");

  const restarted = createExecution({
    custody: custody(),
    journal: f.journal,
    network: network(first),
    locks,
  });
  assert.equal((await restarted.reconcile(record)).status, "retired");
  assert.equal((await f.journal.pending(first.profile.account)).length, 0);

  restarted.review({ pkg: first, preparedAt: Date.now() });
  await assert.rejects(restarted.confirm(), /WEB_STORAGE_TRANSACTION_FAILED/);

  const second = operation();
  let submits = 0;
  const secondEngine = createExecution({
    custody: custody(),
    journal: f.journal,
    network: network(second, {
      submit: async () => {
        submits++;
        return { status: "pending", userOperationHash: second.userOperationHash };
      },
    }),
    locks,
  });
  secondEngine.review({ pkg: second, preparedAt: Date.now() });
  assert.equal((await secondEngine.confirm()).status, "confirmed");
  assert.equal(submits, 1);
  assert.equal((await f.journal.pending(second.profile.account)).length, 0);
});

test("submission timeout remains ambiguous until conservative evidence retires it", async (t) => {
  for (const reason of [
    "nonce_advanced",
    "authorization_expired",
    "valid_account_predeployed",
  ]) {
    const f = await fixture();
    t.after(() => f.store.close());
    const pkg = operation();
    let disposition = { status: "pending", userOperationHash: pkg.userOperationHash };
    const net = network(pkg, {
      submit: async () => {
        throw Error("RPC_TIMEOUT");
      },
      reconcile: async () => disposition,
    });
    const engine = createExecution({
      custody: custody(),
      journal: f.journal,
      network: net,
      locks,
    });
    engine.review({ pkg, preparedAt: Date.now() });
    await assert.rejects(engine.confirm(), /RECONCILIATION_REQUIRED/);
    let [record] = await f.journal.pending(pkg.profile.account);
    assert.equal(record.state, "submission_started");
    assert.equal((await engine.reconcile(record)).status, "pending");
    assert.equal((await f.journal.pending(pkg.profile.account)).length, 1);
    disposition = {
      status: "retirable",
      reason,
      userOperationHash: pkg.userOperationHash,
      safeBlockNumber: "1",
      safeBlockHash: id("safe-" + reason),
    };
    assert.equal((await engine.reconcile(record)).status, "retirable");
    assert.equal((await f.journal.pending(pkg.profile.account)).length, 0);
  }
});

test("acknowledged operation stays submitted across restart and is never sent twice", async (t) => {
  const f = await fixture();
  t.after(() => f.store.close());
  const pkg = operation();
  let submits = 0;
  const net = network(pkg, {
    submit: async () => {
      submits++;
      return { status: "pending", userOperationHash: pkg.userOperationHash };
    },
    reconcile: async () => ({
      status: "pending",
      reason: "operation_found",
      userOperationHash: pkg.userOperationHash,
    }),
  });
  const engine = createExecution({
    custody: custody(),
    journal: f.journal,
    network: net,
    locks,
  });
  engine.review({ pkg, preparedAt: Date.now() });
  assert.equal((await engine.confirm()).status, "pending");
  let [record] = await f.journal.pending(pkg.profile.account);
  assert.equal(record.state, "submitted");
  engine.review({ pkg, preparedAt: Date.now() });
  await assert.rejects(engine.confirm(), /RECONCILIATION_REQUIRED/);
  assert.equal(submits, 1);

  const restarted = createExecution({
    custody: custody(),
    journal: f.journal,
    network: net,
    locks,
  });
  assert.equal((await restarted.reconcile(record)).status, "pending");
  assert.equal(submits, 1);
});
