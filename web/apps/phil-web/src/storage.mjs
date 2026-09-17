import { validatePersistedPackage } from "./persisted-package.mjs";
import { isBuiltAuthorization, canonicalJSON } from "./protocol.mjs";
// Transactions, not localStorage flags, establish exclusive nonce ownership.
export async function openStore(indexedDB = globalThis.indexedDB) {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open("phil-web-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("records");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(Error("WEB_STORAGE_UNAVAILABLE"));
  });
  const run = (mode, body) =>
    new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction("records", mode, { durability: "strict" }),
        store = tx.objectStore("records");
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(Error("WEB_STORAGE_TRANSACTION_FAILED"));
      try {
        body(
          store,
          (value) => {
            result = value;
          },
          () => tx.abort(),
        );
      } catch {
        tx.abort();
      }
    });
  return {
    get: (key) =>
      run("readonly", (s, done) => {
        const r = s.get(key);
        r.onsuccess = () => done(r.result);
      }),
    put: (key, value) =>
      run("readwrite", (s) => {
        s.put(value, key);
      }),
    add: (key, value) =>
      run("readwrite", (s) => {
        s.add(value, key);
      }),
    all: () =>
      run("readonly", (s, done) => {
        const r = s.getAll();
        r.onsuccess = () => done(r.result);
      }),
    change: (key, update) =>
      run("readwrite", (s, done, abort) => {
        const r = s.get(key);
        r.onsuccess = () => {
          try {
            const next = update(r.result);
            s.put(next, key);
            done(next);
          } catch {
            abort();
          }
        };
      }),
    close: () => db.close(),
  };
}

export function createJournal(store) {
  const key = (pkg) =>
    "attempt:" +
    pkg.profile.chainId +
    ":" +
    pkg.profile.account +
    ":" +
    pkg.op.nonce;
  async function claim(pkg) {
    if (!isBuiltAuthorization(pkg)) throw Error("WEB_UNTRUSTED_PACKAGE");
    const record = {
      kind: "attempt",
      key: key(pkg),
      state: "signing_started",
      pkg: structuredClone(pkg),
      receipt: null,
    };
    await store.add(record.key, record);
    return record;
  }
  async function transition(record, expected, next, receipt = null) {
    return store.change(record.key, (current) => {
      validatePersistedPackage(current?.pkg);
      if (
        !current ||
        current.key !== record.key ||
        current.state !== expected ||
        canonicalJSON(current.pkg) !== canonicalJSON(record.pkg)
      )
        throw Error("WEB_ATTEMPT_CHANGED");
      return { ...current, state: next, receipt };
    });
  }
  return {
    claim,
    transition,
    pending: async (account) =>
      (await store.all())
        .filter((x) => x?.kind === "attempt")
        .map((record) => {
          validatePersistedPackage(record.pkg);
          if (
            record.key !== key(record.pkg) ||
            ![
              "signing_started",
              "signed",
              "submission_started",
              "confirmed",
              "reverted",
            ].includes(record.state)
          )
            throw Error("WEB_JOURNAL_INVALID");
          return record;
        })
        .filter(
          (x) =>
            x.pkg.profile.account === account &&
            !["confirmed", "reverted"].includes(x.state),
        ),
  };
}
