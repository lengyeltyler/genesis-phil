import test from "node:test";
import assert from "node:assert/strict";
import { createLaunchPolicy } from "../src/launch.mjs";
import worker from "../hosting/worker.mjs";
const releaseId = "a".repeat(40) + ":" + "b".repeat(64),
  account = "0x" + "11".repeat(20),
  other = "0x" + "22".repeat(20);
function fixture() {
  let value = { releaseId, stage: "closed", acceptanceAccount: null };
  const policy = createLaunchPolicy({
    releaseId,
    fetchImpl: async (url, options) => {
      assert.equal(url, "/release-status.json");
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      return new Response(JSON.stringify(value));
    },
  });
  return { policy, set: (v) => (value = v) };
}
test("closed rollout refuses every account; acceptance allows only designated account; public allows valid accounts", async () => {
  const f = fixture();
  await assert.rejects(f.policy.assertReady(account), /MAINNET_DISABLED/);
  f.set({ releaseId, stage: "acceptance", acceptanceAccount: account });
  await f.policy.assertReady(account);
  assert.equal(f.policy.allows(other), false);
  await assert.rejects(f.policy.assertReady(other), /MAINNET_DISABLED/);
  f.set({ releaseId, stage: "public", acceptanceAccount: null });
  await f.policy.assertReady(other);
});
test("stale release, invalid mode/account and failure close previously open policy", async () => {
  for (const value of [
    { releaseId: "stale", stage: "public", acceptanceAccount: null },
    { releaseId, stage: "override", acceptanceAccount: null },
    { releaseId, stage: "acceptance", acceptanceAccount: "<script>" },
    { releaseId, stage: "public", acceptanceAccount: account },
  ]) {
    const f = fixture();
    f.set({ releaseId, stage: "public", acceptanceAccount: null });
    await f.policy.assertReady(account);
    f.set(value);
    await assert.rejects(f.policy.assertReady(account));
    assert.equal(f.policy.enabled, false);
  }
});
test("preview can never execute even if the server is public", async () => {
  const p = createLaunchPolicy({
    releaseId,
    preview: true,
    fetchImpl: () => {
      throw Error("must not fetch");
    },
  });
  await assert.rejects(p.assertReady(account), /MAINNET_DISABLED/);
});
test("rollout closure is checked again at each sensitive boundary", async () => {
  const f = fixture();
  f.set({ releaseId, stage: "acceptance", acceptanceAccount: account });
  await f.policy.assertReady(account);
  f.set({ releaseId, stage: "closed", acceptanceAccount: null });
  await assert.rejects(f.policy.assertReady(account), /MAINNET_DISABLED/);
});
test("Worker rollout has no client-supplied admission or persistent ledger", async () => {
  for (const [stage, address, expected] of [
    ["closed", "", "closed"],
    ["acceptance", account, "acceptance"],
    ["acceptance", "bad", "closed"],
    ["public", "", "public"],
    ["bad", account, "closed"],
  ]) {
    const env = {
      PHIL_RELEASE_ID: releaseId,
      PHIL_MINT_STAGE: stage,
      PHIL_ACCEPTANCE_ACCOUNT: address,
      ASSETS: {
        fetch: () => {
          throw Error("not an asset");
        },
      },
    };
    const r = await worker.fetch(
      new Request(
        "https://phil.tylerlengyel.com/release-status.json?stage=public&account=" +
          other,
      ),
      env,
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store, no-transform");
    const body = await r.json();
    assert.deepEqual(body, {
      releaseId,
      stage: expected,
      acceptanceAccount: expected === "acceptance" ? account : null,
    });
  }
});
