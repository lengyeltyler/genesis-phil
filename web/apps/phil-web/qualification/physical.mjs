// Local-only physical authenticator qualification. Never included by build.mjs.
import { createPasskeyProvider } from "../src/passkey.mjs";
import { createCustody } from "../src/custody.mjs";
import { openStore, createJournal } from "../src/storage.mjs";
import { deriveAccount, buildAuthorization } from "../src/protocol.mjs";
import { verifyMessage, getBytes } from "ethers";
import publicConfig from "../../philcore-desktop/production/candidate-public-config.json";
if (location.origin !== "http://localhost:4180")
  throw Error("LOCAL_QUALIFICATION_ONLY");
const config = {
  ...publicConfig,
  factory: "0x" + "11".repeat(20),
  genesis: "0x" + "22".repeat(20),
  entryPoint: "0x" + "33".repeat(20),
};
// Explicitly disposable synthetic test identities only. This public fixture
// passphrase is not used by the production app or for a funded identity.
const testPassphrase = "DISPOSABLE PHIL WEB QUALIFICATION ONLY 2026";
const namespaced = (name) => ({
  open: (_name, version) => indexedDB.open(name, version),
});
const store = await openStore(namespaced("phil-web-physical-qualification-v1"));
const passkeys = createPasskeyProvider(),
  custody = createCustody({ store, passkeys, config });
let working = false;
const status = document.querySelector("#status"),
  report = document.querySelector("#report");
const record = async (name, result, detail) => {
  const rows = (await store.get("results")) || [];
  rows.push({ at: new Date().toISOString(), name, result, detail });
  await store.put("results", rows);
  report.textContent = JSON.stringify(rows, null, 2);
};
const state = async () => {
  const vault = await custody.read();
  document.querySelector("#account").textContent = vault
    ? vault.header.account
    : "No disposable account created yet.";
  report.textContent = JSON.stringify(
    (await store.get("results")) || [],
    null,
    2,
  );
};
await state();
function operation(header, nonce = "0") {
  const d = deriveAccount(config, header, "DESKTOP_GENESIS"),
    now = Math.floor(Date.now() / 1000);
  return buildAuthorization(
    d.profile,
    {
      action: "MINT_PHIL",
      tokenId: "1",
      nameId: "160",
      recipient: d.profile.account,
      nonce,
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
    d.creation,
  );
}
const actions = {
  async enroll() {
    await custody.create("Disposable Phil Web qualification");
    await record(
      "enrollment",
      "PASS",
      "Real authenticator; local-only fake contract addresses.",
    );
  },
  async backup() {
    const text = await custody.exportBackup(testPassphrase);
    await store.put("test-backup", text);
    await custody.verifyBackup(text, testPassphrase);
    await record(
      "encrypted-backup-and-verify",
      "PASS",
      "File format round trip with real passkey approvals; not a user-file download test.",
    );
  },
  async unlock() {
    await custody.exportBackup(testPassphrase);
    await record("unlock", "PASS", "Real passkey unlock; no secret output.");
  },
  async sign() {
    const header = (await custody.read()).header,
      pkg = operation(header),
      journal = createJournal(store),
      signature = await custody.signOnce(pkg, () => journal.claim(pkg));
    if (
      verifyMessage(
        getBytes(pkg.userOperationHash),
        signature,
      ).toLowerCase() !== header.owner
    )
      throw Error("SIGNATURE_MISMATCH");
    await record(
      "offline-approval-signature",
      "PASS",
      "Synthetic contract addresses, no submission, no signature persisted.",
    );
  },
  async repeat() {
    const pkg = operation((await custody.read()).header);
    try {
      await custody.signOnce(pkg, () => createJournal(store).claim(pkg));
      throw Error("DUPLICATE_SIGNATURE");
    } catch (error) {
      if (error.message !== "WEB_STORAGE_TRANSACTION_FAILED") throw error;
      await record(
        "repeat-approval",
        "PASS",
        "Previously claimed nonce prevented another signature.",
      );
    }
  },
  async restore() {
    const text = await store.get("test-backup"),
      restoredStore = await openStore(
        namespaced("phil-web-physical-restore-" + Date.now()),
      ),
      restored = createCustody({ store: restoredStore, passkeys, config });
    const header = await restored.restore(text, testPassphrase);
    if (header.account !== (await custody.read()).header.account)
      throw Error("ACCOUNT_CHANGED");
    const pkg = operation(header),
      signature = await restored.signOnce(pkg, () =>
        createJournal(restoredStore).claim(pkg),
      );
    if (
      verifyMessage(
        getBytes(pkg.userOperationHash),
        signature,
      ).toLowerCase() !== header.owner
    )
      throw Error("SIGNATURE_MISMATCH");
    await record(
      "fresh-store-restore-and-offline-sign",
      "PASS",
      "Same identity/account; new passkey wrapper; no submission.",
    );
    restoredStore.close();
  },
  async negatives() {
    const text = await store.get("test-backup"),
      testStore = await openStore(
        namespaced("phil-web-physical-negative-" + Date.now()),
      ),
      negative = createCustody({ store: testStore, passkeys, config });
    for (const [name, value, phrase] of [
      ["wrong-passphrase", text, "incorrect disposable phrase"],
      ["corrupt-backup", text.slice(0, -5) + "BROKEN", testPassphrase],
    ]) {
      let rejected = false;
      try {
        await negative.restore(value, phrase);
      } catch {
        rejected = true;
      }
      if (!rejected) throw Error("NEGATIVE_ACCEPTED");
      await record(name, "PASS", "Rejected without changing account.");
    }
    const source = await store.get("vault");
    source.envelopes.ready.ciphertext = "AAAA";
    await testStore.put("vault", source);
    let rejected = false;
    try {
      await negative.signOnce(operation(source.header), async () => {
        throw Error("CLAIM_REACHED");
      });
    } catch (error) {
      rejected = error.message === "WEB_VAULT_AUTHENTICATION_FAILED";
    }
    if (!rejected) throw Error("CORRUPTION_ACCEPTED");
    await record(
      "corrupt-vault",
      "PASS",
      "Authentication failed before signing. Original test vault preserved.",
    );
    testStore.close();
  },
  async cancel() {
    custody.lock();
    status.textContent = "Pending request cancelled. Nothing was signed.";
  },
  async wrongCredential() {
    const databases = (await indexedDB.databases())
      .filter(({ name }) => name?.startsWith("phil-web-physical-restore-"))
      .sort((a, b) => b.name.localeCompare(a.name));
    if (!databases.length) throw Error("RESTORE_TEST_REQUIRED");
    const alternate = await openStore(namespaced(databases[0].name));
    const other = await alternate.get("vault");
    alternate.close();
    const source = await store.get("vault");
    if (!other || other.credential.id === source.credential.id)
      throw Error("ALTERNATE_CREDENTIAL_REQUIRED");
    source.credential = other.credential;
    const testStore = await openStore(
      namespaced("phil-web-physical-wrong-" + Date.now()),
    );
    await testStore.put("vault", source);
    const negative = createCustody({ store: testStore, passkeys, config });
    let rejected = false;
    try {
      await negative.signOnce(operation(source.header), async () => {
        throw Error("CLAIM_REACHED");
      });
    } catch (error) {
      rejected = error.message === "WEB_VAULT_AUTHENTICATION_FAILED";
    }
    testStore.close();
    if (!rejected) throw Error("WRONG_CREDENTIAL_ACCEPTED");
    await record(
      "wrong-real-credential",
      "PASS",
      "Another real enrolled passkey could not decrypt the copied vault; no signature claim. This does not qualify another physical device.",
    );
  },
};
for (const button of document.querySelectorAll("[data-action]"))
  button.addEventListener("click", async () => {
    const name = button.dataset.action;
    if (name === "cancel") {
      await actions.cancel();
      return;
    }
    if (working) return;
    working = true;
    status.textContent =
      "Running " +
      name +
      ". Approve only the expected localhost device prompt.";
    try {
      await actions[name]();
      await state();
      status.textContent = name + " completed.";
    } catch (error) {
      const cancelled = ["NotAllowedError", "AbortError"].includes(error.name);
      await record(
        name,
        cancelled ? "CANCELLED" : "FAILED",
        cancelled
          ? "Device request cancelled or unavailable."
          : String(error.message),
      );
      status.textContent = cancelled
        ? "Cancelled or unavailable; no automatic retry."
        : "Stopped: " + error.message;
    } finally {
      working = false;
    }
  });
