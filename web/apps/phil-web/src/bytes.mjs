import { canonicalJSON } from "./protocol.mjs";
export const utf8 = (value) => new TextEncoder().encode(value);
export const random = (n) => crypto.getRandomValues(new Uint8Array(n));
export const jsonBytes = (value) => utf8(canonicalJSON(value));
export const b64 = (value) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
export function unb64(value, length) {
  if (
    typeof value !== "string" ||
    value.length > 200000 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw Error("WEB_STORAGE_INVALID");
  const out = Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (x) => x.charCodeAt(0),
  );
  if (b64(out) !== value || (length !== undefined && out.length !== length))
    throw Error("WEB_STORAGE_INVALID");
  return out;
}
export const equal = (a, b) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
export const sha = async (bytes) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
export function exact(value, fields) {
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("|") !== fields.toSorted().join("|")
  )
    throw Error("WEB_STORAGE_INVALID");
}
export async function encrypt(key, value, aad) {
  const iv = random(12),
    plain = jsonBytes(value);
  try {
    return {
      iv: b64(iv),
      ciphertext: b64(
        await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: jsonBytes(aad),
            tagLength: 128,
          },
          key,
          plain,
        ),
      ),
    };
  } finally {
    plain.fill(0);
  }
}
export async function decrypt(key, value, aad) {
  exact(value, ["iv", "ciphertext"]);
  let plain;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unb64(value.iv, 12),
          additionalData: jsonBytes(aad),
          tagLength: 128,
        },
        key,
        unb64(value.ciphertext),
      ),
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    throw Error("WEB_VAULT_AUTHENTICATION_FAILED");
  } finally {
    plain?.fill(0);
  }
}
