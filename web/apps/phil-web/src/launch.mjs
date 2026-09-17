// Release rollout control only: no quotas, device identity, IP rules or admission ledger.
// Contract enforcement remains one successful mint per valid Genesis account.
export function createLaunchPolicy({
  releaseId,
  preview = false,
  fetchImpl = fetch,
}) {
  let state = { stage: "closed", acceptanceAccount: null };
  const allows = (account) =>
    !preview &&
    (state.stage === "public" ||
      (state.stage === "acceptance" &&
        typeof account === "string" &&
        account.toLowerCase() === state.acceptanceAccount));
  async function refresh() {
    state = { stage: "closed", acceptanceAccount: null };
    if (preview) return state;
    const response = await fetchImpl("/release-status.json", {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("WEB_MAINNET_DISABLED");
    const text = await response.text();
    if (text.length > 4096) throw Error("WEB_MAINNET_DISABLED");
    const next = JSON.parse(text);
    if (
      next.releaseId !== releaseId ||
      !["closed", "acceptance", "public"].includes(next.stage) ||
      (next.stage === "acceptance"
        ? !/^0x[0-9a-f]{40}$/.test(next.acceptanceAccount)
        : next.acceptanceAccount !== null)
    )
      throw Error("WEB_MAINNET_DISABLED");
    state = { stage: next.stage, acceptanceAccount: next.acceptanceAccount };
    return state;
  }
  return {
    refresh,
    allows,
    get stage() {
      return state.stage;
    },
    get enabled() {
      return !preview && state.stage !== "closed";
    },
    async assertReady(account) {
      await refresh();
      if (!allows(account)) throw Error("WEB_MAINNET_DISABLED");
    },
  };
}
