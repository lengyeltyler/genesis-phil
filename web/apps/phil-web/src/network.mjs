import {
  Interface,
  keccak256,
  getAddress,
  getCreateAddress,
  verifyMessage,
  getBytes,
  hexlify,
} from "ethers";
import rpc from "../../../genesis/production/rpc.cjs";
import state from "../../../genesis/production/state.cjs";
import funding from "../../../genesis/production/funding.cjs";
import fees from "../../../genesis/production/bundler-fees.cjs";
import reconciliation from "../../../genesis/production/reconciliation.cjs";
import { buildAuthorization, deriveAccount } from "./protocol.mjs";
import { random } from "./bytes.mjs";

export const ENDPOINTS = Object.freeze({
  primary: "https://eth.drpc.org",
  independent: "https://ethereum.publicnode.com",
  bundler: "https://api.candide.dev/public/v3/1",
});
const ep = new Interface([
  "function getNonce(address,uint192) view returns(uint256)",
]);
const nft = new Interface([
  "function totalMinted() view returns(uint256)",
  "function ownerOf(uint256) view returns(address)",
  "function recipeIdOf(uint256) view returns(uint256)",
  "function catalogHash() view returns(bytes32)",
  "function accountFactory() view returns(address)",
]);
const names = new Interface([
  "function nameIdOf(uint256) view returns(uint256)",
]);
const readRpc = (url) =>
  rpc.createReadRpc(url, {
    fetchImpl: (input, options) =>
      fetch(input, {
        ...options,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
      }),
  });
const CLOSED_LAUNCH = {
  enabled: false,
  allows: () => false,
  assertReady: async () => {
    throw Error("WEB_MAINNET_DISABLED");
  },
};

export function createNetwork(
  config,
  { apis: injected, launch = CLOSED_LAUNCH } = {},
) {
  // Production constructs this with the pinned, credential-free read providers.
  const apis = injected ?? {
    primary: readRpc(ENDPOINTS.primary),
    independent: readRpc(ENDPOINTS.independent),
    bundler: readRpc(ENDPOINTS.bundler),
  };
  async function same(method, params) {
    const [a, b] = await Promise.all([
      apis.primary(method, params),
      apis.independent(method, params),
    ]);
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw Error("GENESIS_PROVIDER_DISAGREEMENT");
    return a;
  }
  async function call(to, abi, name, args, tag) {
    return abi.decodeFunctionResult(
      name,
      await same("eth_call", [
        { to, data: abi.encodeFunctionData(name, args) },
        tag,
      ]),
    );
  }
  async function infrastructure() {
    const head = await rpc.checkedHead(apis.primary, apis.independent);
    for (const key of ["entryPoint", "genesis", "factory"])
      if (
        keccak256(await same("eth_getCode", [config[key], head.number])) !==
        config[key + "CodeHash"]
      )
        throw Error("GENESIS_CODE_CHANGED");
    if (
      (await call(config.genesis, nft, "catalogHash", [], head.number))[0] !==
        config.catalogCommitment ||
      (
        await call(config.genesis, nft, "accountFactory", [], head.number)
      )[0].toLowerCase() !== config.factory
    )
      throw Error("GENESIS_ART_CHANGED");
    const [chain, entryPoints] = await Promise.all([
      apis.bundler("eth_chainId"),
      apis.bundler("eth_supportedEntryPoints"),
    ]);
    if (
      chain !== "0x1" ||
      !entryPoints.some((x) => x.toLowerCase() === config.entryPoint)
    )
      throw Error("GENESIS_BUNDLER_CHAIN_OR_ENTRYPOINT");
    return head;
  }
  async function prepare(header, action, choice) {
    if (!["MINT_PHIL", "TRANSFER_PHIL"].includes(action))
      throw Error("WEB_ACTION_FORBIDDEN");
    const { profile, creation } = deriveAccount(
        config,
        header,
        "DESKTOP_GENESIS",
      ),
      head = await infrastructure();
    const code = await same("eth_getCode", [profile.account, head.number]),
      deployed = code !== "0x";
    if (deployed && keccak256(code) !== profile.accountCodeHash)
      throw Error("GENESIS_CODE_CHANGED");
    if (!deployed && action !== "MINT_PHIL")
      throw Error("GENESIS_OWNER_CHANGED");
    const nonce = String(
      (
        await call(
          config.entryPoint,
          ep,
          "getNonce",
          [profile.account, 0],
          head.number,
        )
      )[0],
    );
    const quote = (
      await fees.bundlerFees(apis.bundler, "public-candide", head.baseFeePerGas)
    ).standard;
    const input = {
      action,
      ...(action === "MINT_PHIL"
        ? { tokenId: choice.recipeId, nameId: choice.nameId }
        : { tokenId: choice.tokenId }),
      recipient:
        action === "MINT_PHIL"
          ? profile.account
          : getAddress(choice.recipient).toLowerCase(),
      nonce,
      authorizationId: hexlify(random(32)),
      philNonce: hexlify(random(32)),
      validAfter: String(BigInt(head.timestamp)),
      validUntil: String(BigInt(head.timestamp) + 300n),
      callGasLimit: "450000",
      verificationGasLimit: deployed ? "350000" : "2300000",
      preVerificationGas: "100000",
      maxFeePerGas: String(BigInt(quote.maxFeePerGas)),
      maxPriorityFeePerGas: String(BigInt(quote.maxPriorityFeePerGas)),
    };
    const provisional = buildAuthorization(
        profile,
        input,
        deployed ? null : creation,
      ),
      reader = state.createStateReader({ ...apis, profile });
    await reader.read(provisional, { requireFunds: false });
    const feeQuote = await funding.liveFunding({
      ...apis,
      profile,
      operation: provisional.op,
      accountDeployed: deployed,
      bundlerKind: "public-candide",
      action,
    });
    if (!feeQuote.withinCap) throw Error("GENESIS_FUNDING");
    const pkg = buildAuthorization(
      profile,
      { ...input, ...feeQuote.gas },
      deployed ? null : creation,
    );
    await reader.read(pkg, { requireFunds: false });
    return Object.freeze({ pkg, feeQuote, preparedAt: feeQuote.observedAtMs });
  }
  async function owned(header) {
    const head = await infrastructure(),
      total = Number(
        (await call(config.genesis, nft, "totalMinted", [], head.number))[0],
      );
    if (total < 0 || total > 369) throw Error("GENESIS_STATE_CHANGED");
    const result = [];
    for (let id = 0; id < total; id++)
      if (
        (
          await call(config.genesis, nft, "ownerOf", [id], head.number)
        )[0].toLowerCase() === header.account
      ) {
        const recipeId = String(
          (await call(config.genesis, nft, "recipeIdOf", [id], head.number))[0],
        );
        const nameId = String(
          (
            await call(
              getCreateAddress({ from: config.genesis, nonce: 1 }),
              names,
              "nameIdOf",
              [id],
              head.number,
            )
          )[0],
        );
        result.push({ tokenId: String(id), recipeId, nameId });
      }
    return result;
  }
  const assertFresh = (pkg) =>
    state.createStateReader({ ...apis, profile: pkg.profile }).assertFresh(pkg);
  async function submit(operation, pkg) {
    if (!launch.enabled) throw Error("WEB_MAINNET_DISABLED");
    await launch.assertReady(pkg.profile.account);
    if (
      verifyMessage(
        getBytes(pkg.userOperationHash),
        operation.signature,
      ).toLowerCase() !== pkg.profile.owner
    )
      throw Error("GENESIS_SIGNER");
    // Single attempt; no failover or retry on a lost response.
    const response = await fetch(ENDPOINTS.bundler, {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [rpc.unpack(operation), config.entryPoint],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("GENESIS_RECONCILIATION_REQUIRED");
    const reader = response.body?.getReader();
    if (!reader) throw Error("GENESIS_RECONCILIATION_REQUIRED");
    let size = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) throw Error("GENESIS_RECONCILIATION_REQUIRED");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const data = JSON.parse(text);
    if (
      data.error ||
      data.id !== 1 ||
      data.jsonrpc !== "2.0" ||
      data.result !== pkg.userOperationHash
    )
      throw Error("GENESIS_RECONCILIATION_REQUIRED");
    return { status: "pending", userOperationHash: data.result };
  }
  return {
    infrastructure,
    prepare,
    owned,
    assertFresh,
    submit,
    reconcile: (pkg) => reconciliation.reconcile({ pkg, ...apis }),
    get mainnetEnabled() {
      return launch.enabled;
    },
    canExecute: (account) => launch.allows(account),
    assertMainnet: (account) => launch.assertReady(account),
  };
}
