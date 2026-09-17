import { verifyMessage, getBytes } from "ethers";
import { isBuiltAuthorization } from "./protocol.mjs";

export function createExecution({
  custody,
  journal,
  network,
  locks = globalThis.navigator?.locks,
}) {
  let active = null,
    generation = 0;
  function cancel() {
    generation++;
    active = null;
    custody.lock();
  }
  function review(value) {
    cancel();
    if (!isBuiltAuthorization(value.pkg)) throw Error("WEB_UNTRUSTED_PACKAGE");
    active = { ...value, generation };
    return value.pkg.presentation;
  }
  async function confirm() {
    const current = active;
    active = null;
    if (!current || current.generation !== generation)
      throw Error("WEB_REVIEW_STALE");
    if (!network.mainnetEnabled) throw Error("WEB_MAINNET_DISABLED");
    await network.assertMainnet(current.pkg.profile.account);
    if (!locks?.request) throw Error("WEB_LOCKS_UNSUPPORTED");
    return locks.request(
      "phil-execution:" + current.pkg.profile.account,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw Error("WEB_BUSY");
        const { pkg } = current;
        let record;
        const fresh = () => {
          if (
            current.generation !== generation ||
            Date.now() - current.preparedAt > 30000
          )
            throw Error("WEB_REVIEW_STALE");
        };
        try {
          fresh();
          if ((await journal.pending(pkg.profile.account)).length)
            throw Error("WEB_RECONCILIATION_REQUIRED");
          await network.assertFresh(pkg);
          fresh();
          const signature = await custody.signOnce(pkg, async () => {
            fresh();
            record = await journal.claim(pkg);
          });
          if (
            verifyMessage(
              getBytes(pkg.userOperationHash),
              signature,
            ).toLowerCase() !== pkg.profile.owner
          )
            throw Error("GENESIS_SIGNER");
          fresh();
          await journal.transition(record, "signing_started", "signed");
          await network.assertFresh(pkg);
          fresh();
          await journal.transition(record, "signed", "submission_started");
          await network.submit({ ...pkg.op, signature }, pkg);
          return await reconcile(record);
        } catch (error) {
          // A claimed nonce is deliberately left blocked after every ambiguity.
          if (record) throw Error("WEB_RECONCILIATION_REQUIRED");
          throw error;
        }
      },
    );
  }
  async function reconcile(record) {
    const result = await network.reconcile(record.pkg);
    if (result.status === "confirmed")
      await journal.transition(
        record,
        "submission_started",
        result.success ? "confirmed" : "reverted",
        result,
      );
    return result;
  }
  return { review, cancel, confirm, reconcile };
}
