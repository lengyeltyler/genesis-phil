import { p256 } from "@noble/curves/p256";
import { b64, unb64, random, utf8, sha, equal, jsonBytes } from "./bytes.mjs";

export function assertOrigin(origin = globalThis.location?.origin) {
  const u = new URL(origin);
  const local =
    typeof __PHIL_LOCAL_PREVIEW__ !== "undefined" &&
    __PHIL_LOCAL_PREVIEW__ === true &&
    u.hostname === "localhost" &&
    u.protocol === "http:";
  if (!local && origin !== "https://phil.tylerlengyel.com")
    throw Error("WEB_ORIGIN_INVALID");
  if (globalThis.window && window.top !== window.self)
    throw Error("WEB_FRAMED");
  return { origin, rpId: u.hostname };
}

export async function checkClient(
  response,
  challenge,
  type,
  origin,
  rpId,
  authData,
) {
  const client = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(response.clientDataJSON),
  );
  if (
    client.type !== type ||
    client.origin !== origin ||
    client.challenge !== b64(challenge) ||
    client.crossOrigin === true ||
    client.topOrigin !== undefined
  )
    throw Error("WEB_PASSKEY_CONTEXT");
  const auth = new Uint8Array(authData);
  if (
    auth.length < 37 ||
    !equal(auth.slice(0, 32), await sha(utf8(rpId))) ||
    (auth[32] & 5) !== 5
  )
    throw Error("WEB_USER_VERIFICATION_REQUIRED");
  return auth;
}

export function createPasskeyProvider({
  credentials = navigator.credentials,
  origin = location.origin,
} = {}) {
  const { rpId } = assertOrigin(origin);
  let activeRequest = null;
  function cancel() {
    activeRequest?.abort();
  }
  async function credentialRequest(method, options) {
    if (activeRequest) throw Error("WEB_BUSY");
    const controller = new AbortController();
    activeRequest = controller;
    try {
      return await credentials[method]({
        ...options,
        signal: controller.signal,
      });
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }
  async function authorize(credential, purpose) {
    assertOrigin(origin);
    const challenge = await sha(
      jsonBytes({
        domain: "PHIL_WEB_APPROVAL_V1",
        purpose,
        nonce: b64(random(32)),
      }),
    );
    const result = await credentialRequest("get", {
      publicKey: {
        rpId,
        challenge,
        timeout: 60000,
        userVerification: "required",
        allowCredentials: [{ type: "public-key", id: unb64(credential.id) }],
        extensions: {
          prf: {
            evalByCredential: {
              [credential.id]: { first: unb64(credential.salt, 32) },
            },
          },
        },
      },
    });
    if (
      !result ||
      result.type !== "public-key" ||
      b64(result.rawId) !== credential.id
    )
      throw Error("WEB_PASSKEY_MISMATCH");
    const auth = await checkClient(
      result.response,
      challenge,
      "webauthn.get",
      origin,
      rpId,
      result.response.authenticatorData,
    );
    const clientHash = await sha(result.response.clientDataJSON),
      signed = new Uint8Array(auth.length + 32);
    signed.set(auth);
    signed.set(clientHash, auth.length);
    const key = await crypto.subtle.importKey(
      "spki",
      unb64(credential.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    let signature;
    try {
      signature = p256.Signature.fromDER(
        new Uint8Array(result.response.signature),
      ).toCompactRawBytes();
    } catch {
      throw Error("WEB_PASSKEY_SIGNATURE");
    }
    if (
      !(await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        signature,
        signed,
      ))
    )
      throw Error("WEB_PASSKEY_SIGNATURE");
    const output = result.getClientExtensionResults()?.prf?.results?.first;
    if (!output || output.byteLength !== 32) throw Error("WEB_PRF_UNSUPPORTED");
    const prf = new Uint8Array(output);
    try {
      const base = await crypto.subtle.importKey("raw", prf, "HKDF", false, [
        "deriveKey",
      ]);
      return await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: unb64(credential.salt, 32),
          info: utf8("PHIL_WEB_VAULT_V1:" + origin),
        },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    } finally {
      prf.fill(0);
    }
  }
  async function register(label) {
    assertOrigin(origin);
    const challenge = random(32);
    const result = await credentialRequest("create", {
      publicKey: {
        rp: { id: rpId, name: "Phil Web" },
        user: { id: random(32), name: label, displayName: label },
        challenge,
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        // First-time platform setup can include device/account verification.
        // No Phil signing secret exists yet during fresh enrollment.
        timeout: 300000,
        attestation: "none",
        extensions: { prf: {} },
      },
    });
    if (
      !result ||
      result.type !== "public-key" ||
      result.response.getPublicKeyAlgorithm?.() !== -7 ||
      !result.response.getPublicKey?.()
    )
      throw Error("WEB_PRF_UNSUPPORTED");
    await checkClient(
      result.response,
      challenge,
      "webauthn.create",
      origin,
      rpId,
      result.response.getAuthenticatorData(),
    );
    if (result.getClientExtensionResults()?.prf?.enabled !== true)
      throw Error("WEB_PRF_UNSUPPORTED");
    const credential = {
      id: b64(result.rawId),
      publicKey: b64(result.response.getPublicKey()),
      salt: b64(random(32)),
    };
    const key = await authorize(credential, { action: "ENROLL_DEVICE" });
    return { credential, key };
  }
  return { register, authorize, cancel, origin };
}
