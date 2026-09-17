// Read-only public compatibility and unsigned fee estimate; never signs or sends.
import { readFile, writeFile } from "node:fs/promises";
import { keccak256, toUtf8Bytes } from "ethers";
import { createNetwork, ENDPOINTS } from "../src/network.mjs";
import rpc from "../../../genesis/production/rpc.cjs";
const config = JSON.parse(
    await readFile(
      new URL(
        "../../philcore-desktop/production/candidate-public-config.json",
        import.meta.url,
      ),
    ),
  ),
  calls = [];
const apis = Object.fromEntries(
  Object.entries(ENDPOINTS).map(([name, url]) => [
    name,
    rpc.createReadRpc(url, {
      fetchImpl: async (input, options) => {
        const method = JSON.parse(options.body).method;
        if (method === "eth_sendUserOperation") throw Error("READ_ONLY");
        const res = await fetch(input, {
          ...options,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: {
            ...options.headers,
            Origin: "https://phil.tylerlengyel.com",
          },
        });
        const clone = await res
          .clone()
          .json()
          .catch(() => ({}));
        calls.push({
          provider: name,
          method,
          http: res.status,
          cors: res.headers.get("access-control-allow-origin"),
          error: clone.error
            ? {
                code: clone.error.code,
                message: String(clone.error.message).slice(0, 180),
              }
            : null,
        });
        return res;
      },
    }),
  ]),
);
const identity = {
  owner: "0x0000000000000000000000000000000000000001",
  recoveryAuthority: "0x0000000000000000000000000000000000000002",
  identityCommitment: keccak256(
    toUtf8Bytes("PHIL_WEB_COMPATIBILITY_READ_ONLY_FIXTURE_2026_09_17"),
  ),
};
const result = {
  observedAt: new Date().toISOString(),
  publicSubmission: false,
  signatureProduced: false,
};
try {
  const quote = await createNetwork(config, { apis }).prepare(
    identity,
    "MINT_PHIL",
    { recipeId: "987654321", nameId: "8000" },
  );
  Object.assign(result, {
    account: quote.pkg.profile.account,
    operationHash: quote.pkg.userOperationHash,
    feeQuote: quote.feeQuote,
  });
} catch (error) {
  result.failure = error.message;
  process.exitCode = 1;
}
result.calls = calls;
await writeFile(
  "./public-unsigned-quote.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      ...result,
      calls: undefined,
      callCount: calls.length,
      failures: calls.filter((x) => x.error),
      cors: [...new Set(calls.map((x) => x.provider + ":" + x.cors))],
    },
    null,
    2,
  ),
);
