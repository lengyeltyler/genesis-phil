import test from "node:test";
import assert from "node:assert/strict";
import { p256 } from "@noble/curves/p256";
import { createPasskeyProvider, assertOrigin } from "../src/passkey.mjs";
import { b64, random, utf8, sha, encrypt, decrypt } from "../src/bytes.mjs";
const origin = "https://phil.tylerlengyel.com",
  rpId = "phil.tylerlengyel.com";
async function fakeAuthenticator() {
  const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    ),
    publicKey = await crypto.subtle.exportKey("spki", pair.publicKey),
    rawId = random(32),
    prf = random(32);
  let override = {};
  async function response(options, type) {
    const p = options.publicKey,
      clientDataJSON = utf8(
        JSON.stringify({
          type,
          challenge: b64(p.challenge),
          origin,
          ...override.client,
        }),
      );
    const auth = new Uint8Array(37);
    auth.set(await sha(utf8(rpId)));
    auth[32] = override.flags ?? 5;
    if (type === "webauthn.create")
      return {
        type: "public-key",
        rawId,
        response: {
          clientDataJSON,
          getPublicKeyAlgorithm: () => -7,
          getPublicKey: () => publicKey,
          getAuthenticatorData: () => auth,
        },
        getClientExtensionResults: () => ({
          prf: { enabled: override.prf !== false },
        }),
      };
    const signed = new Uint8Array(69);
    signed.set(auth);
    signed.set(await sha(clientDataJSON), 37);
    const compact = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      signed,
    );
    const signature = p256.Signature.fromCompact(
      new Uint8Array(compact),
    ).toDERRawBytes();
    if (override.signature) signature[signature.length - 1] ^= 1;
    return {
      type: "public-key",
      rawId,
      response: { clientDataJSON, authenticatorData: auth, signature },
      getClientExtensionResults: () =>
        override.prf === false
          ? {}
          : { prf: { results: { first: prf.slice().buffer } } },
    };
  }
  return {
    credentials: {
      create: (o) => response(o, "webauthn.create"),
      get: (o) => response(o, "webauthn.get"),
    },
    set: (value) => (override = value),
  };
}
test("valid signed UV assertion yields stable nonextractable PRF wrapping key", async () => {
  const auth = await fakeAuthenticator(),
    provider = createPasskeyProvider({ credentials: auth.credentials, origin }),
    { credential, key } = await provider.register("test");
  assert.equal(key.extractable, false);
  const encrypted = await encrypt(key, { test: true }, { role: "test" }),
    again = await provider.authorize(credential, { action: "TEST" });
  assert.deepEqual(await decrypt(again, encrypted, { role: "test" }), {
    test: true,
  });
  for (const change of [
    { flags: 1 },
    { client: { origin: "https://tylerlengyel.com" } },
    { client: { challenge: "wrong" } },
    { client: { crossOrigin: true } },
    { signature: true },
    { prf: false },
  ]) {
    auth.set(change);
    await assert.rejects(provider.authorize(credential, { action: "TEST" }));
  }
});
test("wrong origin, non-PRF registration and missing UV have no fallback", async () => {
  for (const value of [
    "https://tylerlengyel.com",
    "https://phil.tylerlengyel.com.evil.test",
    "http://phil.tylerlengyel.com",
    "http://localhost:4173",
  ])
    assert.throws(() => assertOrigin(value), /ORIGIN_INVALID/);
  const auth = await fakeAuthenticator(),
    provider = createPasskeyProvider({ credentials: auth.credentials, origin });
  auth.set({ prf: false });
  await assert.rejects(provider.register("test"), /PRF_UNSUPPORTED/);
  auth.set({ flags: 1 });
  await assert.rejects(provider.register("test"), /USER_VERIFICATION/);
});

test("cancellation aborts an outstanding authenticator request and cannot release a key", async () => {
  let entered;
  const pending = new Promise((resolve) => (entered = resolve));
  const provider = createPasskeyProvider({
    origin,
    credentials: {
      get: (options) =>
        new Promise((resolve, reject) => {
          entered();
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Cancelled", "AbortError")),
          );
        }),
    },
  });
  const request = provider.authorize(
    { id: b64(random(32)), salt: b64(random(32)), publicKey: b64(random(91)) },
    { action: "TEST" },
  );
  await pending;
  provider.cancel();
  await assert.rejects(request, (error) => error.name === "AbortError");
});
