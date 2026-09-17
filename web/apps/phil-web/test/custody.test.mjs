import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { IDBFactory } from "fake-indexeddb";
import { Wallet, getBytes, verifyMessage } from "ethers";
import { createCustody } from "../src/custody.mjs";
import { openStore, createJournal } from "../src/storage.mjs";
import { deriveAccount, buildAuthorization } from "../src/protocol.mjs";
import { b64, random } from "../src/bytes.mjs";
import { createExecution } from "../src/execution.mjs";
const config = JSON.parse(
  await readFile(
    new URL(
      "../../philcore-desktop/production/candidate-public-config.json",
      import.meta.url,
    ),
  ),
);
const password = "a unique recovery phrase used only in tests";
async function fixture(factory = new IDBFactory()) {
  const store = await openStore(factory),
    key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  let approvals = 0;
  const credential = {
    id: b64(random(32)),
    salt: b64(random(32)),
    publicKey: b64(random(91)),
  };
  const passkeys = {
    origin: "https://phil.tylerlengyel.com",
    register: async () => ({ credential, key }),
    authorize: async () => {
      approvals++;
      return key;
    },
  };
  const custody = createCustody({ store, passkeys, config });
  return {
    store,
    key,
    passkeys,
    custody,
    factory,
    get approvals() {
      return approvals;
    },
  };
}
function operation(header) {
  const { profile, creation } = deriveAccount(
      config,
      header,
      "DESKTOP_GENESIS",
    ),
    now = Math.floor(Date.now() / 1000);
  return buildAuthorization(
    profile,
    {
      action: "MINT_PHIL",
      tokenId: "1",
      nameId: "160",
      recipient: profile.account,
      nonce: "0",
      authorizationId: "0x" + "ab".repeat(32),
      philNonce: "0x" + "cd".repeat(32),
      validAfter: String(now - 10),
      validUntil: String(now + 300),
      callGasLimit: "500000",
      verificationGasLimit: "3000000",
      preVerificationGas: "100000",
      maxFeePerGas: "1000000000",
      maxPriorityFeePerGas: "1000000",
    },
    creation,
  );
}

test("encrypted vault survives reopening; verified backup restores the identical account", async () => {
  const f = await fixture();
  const header = await f.custody.create("<img src=x onerror=alert(1)>");
  const raw = await f.store.get("vault");
  assert.deepEqual(Object.keys(raw.envelopes).sort(), [
    "identity",
    "recovery",
    "validator",
  ]);
  assert(!JSON.stringify(raw).includes("privateKey"));
  const pkg = operation(header);
  await assert.rejects(
    f.custody.signOnce(pkg, async () => {}),
    /BACKUP_REQUIRED/,
  );
  const backup = await f.custody.exportBackup(password);
  assert(!backup.includes("privateKey"));
  await assert.rejects(
    f.custody.verifyBackup(backup, "wrong phrase at least sixteen"),
    /./,
  );
  await f.custody.verifyBackup(backup, password);
  assert((await f.custody.read()).envelopes.ready);
  f.store.close();
  const reopened = await openStore(f.factory),
    custody = createCustody({ store: reopened, passkeys: f.passkeys, config });
  assert.deepEqual((await custody.read()).header, header);
  const journal = createJournal(reopened);
  let claimReached = false;
  const sig = await custody.signOnce(pkg, async () => {
    await journal.claim(pkg);
    claimReached = true;
  });
  assert(claimReached);
  assert.equal(
    verifyMessage(getBytes(pkg.userOperationHash), sig).toLowerCase(),
    header.owner,
  );
  await assert.rejects(
    custody.signOnce(pkg, () => journal.claim(pkg)),
    /STORAGE_TRANSACTION_FAILED/,
  );
  const restore = await fixture();
  assert.deepEqual(await restore.custody.restore(backup, password), header);
  assert((await restore.custody.read()).envelopes.ready);
  await assert.rejects(
    restore.custody.restore(backup, password),
    /FRESH_STORAGE/,
  );
  const corrupt = JSON.parse(backup);
  corrupt.header.label = "changed";
  await assert.rejects(
    (await fixture()).custody.restore(JSON.stringify(corrupt), password),
    /./,
  );
  reopened.close();
  restore.store.close();
});

test("wrong passkey wrapping, ciphertext tamper, cancellation and forged package fail before signature", async () => {
  const f = await fixture(),
    header = await f.custody.create("test");
  const backup = await f.custody.exportBackup(password);
  await f.custody.verifyBackup(backup, password);
  const pkg = operation(header);
  let claims = 0;
  await assert.rejects(
    f.custody.signOnce(structuredClone(pkg), async () => claims++),
    /UNTRUSTED_PACKAGE/,
  );
  const authorize = f.passkeys.authorize;
  f.passkeys.authorize = async () => {
    f.custody.lock();
    return f.key;
  };
  await assert.rejects(
    f.custody.signOnce(pkg, async () => claims++),
    /SESSION_CHANGED/,
  );
  assert.equal(claims, 0);
  f.passkeys.authorize = async () =>
    crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
  await assert.rejects(f.custody.signOnce(pkg, async () => claims++));
  assert.equal(claims, 0);
  f.passkeys.authorize = authorize;
  const value = await f.store.get("vault");
  value.header.account = Wallet.createRandom().address.toLowerCase();
  await f.store.put("vault", value);
  await assert.rejects(f.custody.read(), /VAULT_BINDING/);
  f.store.close();
});

test("nonce claim is atomic between connections and remains after restart", async () => {
  const f = await fixture(),
    header = await f.custody.create("test"),
    peer = await openStore(f.factory),
    pkg = operation(header),
    a = createJournal(f.store),
    b = createJournal(peer);
  const results = await Promise.allSettled([a.claim(pkg), b.claim(pkg)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await b.pending(header.account)).length, 1);
  f.store.close();
  peer.close();
  const again = await openStore(f.factory);
  assert.equal((await createJournal(again).pending(header.account)).length, 1);
  again.close();
});

test("Mainnet gate blocks before approval; successful fixture submits once and lost response holds nonce", async () => {
  for (const lost of [false, true]) {
    const f = await fixture(),
      header = await f.custody.create("test"),
      backup = await f.custody.exportBackup(password);
    await f.custody.verifyBackup(backup, password);
    const pkg = operation(header),
      journal = createJournal(f.store);
    let submits = 0;
    const network = {
      mainnetEnabled: false,
      assertMainnet: async () => {},
      assertFresh: async () => {},
      submit: async () => {
        submits++;
        if (lost) throw Error("lost response");
      },
      reconcile: async () => ({ status: "confirmed", success: true }),
    };
    const engine = createExecution({
      custody: f.custody,
      journal,
      network,
      locks: { request: async (_n, _o, fn) => fn({}) },
    });
    engine.review({ pkg, preparedAt: Date.now() });
    const before = f.approvals;
    await assert.rejects(engine.confirm(), /MAINNET_DISABLED/);
    assert.equal(f.approvals, before);
    assert.equal(submits, 0);
    network.mainnetEnabled = true;
    engine.review({ pkg, preparedAt: Date.now() });
    if (lost) {
      await assert.rejects(engine.confirm(), /RECONCILIATION_REQUIRED/);
      assert.equal((await journal.pending(header.account)).length, 1);
    } else {
      assert.equal((await engine.confirm()).success, true);
      assert.equal((await journal.pending(header.account)).length, 0);
    }
    await assert.rejects(engine.confirm(), /REVIEW_STALE/);
    assert.equal(submits, 1);
    engine.review({ pkg, preparedAt: Date.now() });
    await assert.rejects(engine.confirm());
    assert.equal(submits, 1);
    f.store.close();
  }
});

test("release changes during device approval deny signing before the durable claim", async () => {
  const f = await fixture(),
    header = await f.custody.create("release gate test"),
    backup = await f.custody.exportBackup(password);
  await f.custody.verifyBackup(backup, password);
  let checks = 0,
    claims = 0;
  const custody = createCustody({
    store: f.store,
    passkeys: f.passkeys,
    config,
    assertCurrentRelease: async () => {
      if (++checks > 1) throw Error("WEB_STALE_RELEASE");
    },
  });
  await assert.rejects(
    custody.signOnce(operation(header), async () => claims++),
    /STALE_RELEASE/,
  );
  assert.equal(claims, 0);
  f.store.close();
});

test("vault ciphertext and IV corruption authenticate before a validator signature", async () => {
  const f = await fixture(),
    header = await f.custody.create("ciphertext test"),
    backup = await f.custody.exportBackup(password);
  await f.custody.verifyBackup(backup, password);
  const initial = await f.store.get("vault");
  for (const field of ["iv", "ciphertext"]) {
    const changed = structuredClone(initial);
    const text = changed.envelopes.ready[field];
    changed.envelopes.ready[field] =
      (text[0] === "A" ? "B" : "A") + text.slice(1);
    await f.store.put("vault", changed);
    let claims = 0;
    await assert.rejects(
      f.custody.signOnce(operation(header), async () => claims++),
      /AUTHENTICATION_FAILED/,
    );
    assert.equal(claims, 0);
  }
  f.store.close();
});

test("invalid export passphrase is rejected before device approval or decryption", async () => {
  const f = await fixture();
  await f.custody.create("passphrase validation");
  for (const value of ["", "too short", "x".repeat(1025)])
    await assert.rejects(
      f.custody.exportBackup(value),
      /WEB_BACKUP_PASSPHRASE/,
    );
  assert.equal(f.approvals, 0);
  f.store.close();
});

test("rollout closing before approval denies a passkey; closing before submission preserves the nonce hold", async () => {
  for (const closeAt of ["approval", "submission"]) {
    const f = await fixture();
    const header = await f.custody.create("rollout boundary");
    const backup = await f.custody.exportBackup(password);
    await f.custody.verifyBackup(backup, password);
    const journal = createJournal(f.store),
      pkg = operation(header);
    let submits = 0;
    const network = {
      mainnetEnabled: true,
      assertMainnet: async (account) => {
        assert.equal(account, header.account);
        if (closeAt === "approval") throw Error("WEB_MAINNET_DISABLED");
      },
      assertFresh: async () => {},
      submit: async () => {
        throw Error("WEB_MAINNET_DISABLED");
      },
      reconcile: async () => {
        submits++;
      },
    };
    const engine = createExecution({
      custody: f.custody,
      journal,
      network,
      locks: { request: async (_n, _o, fn) => fn({}) },
    });
    engine.review({ pkg, preparedAt: Date.now() });
    const before = f.approvals;
    await assert.rejects(
      engine.confirm(),
      closeAt === "approval" ? /MAINNET_DISABLED/ : /RECONCILIATION_REQUIRED/,
    );
    assert.equal(f.approvals, before + (closeAt === "approval" ? 0 : 1));
    assert.equal(
      (await journal.pending(header.account)).length,
      closeAt === "approval" ? 0 : 1,
    );
    assert.equal(submits, 0);
    await assert.rejects(engine.confirm(), /REVIEW_STALE/);
    f.store.close();
  }
});
