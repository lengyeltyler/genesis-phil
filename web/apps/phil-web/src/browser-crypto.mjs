// Narrow compatibility adapter for the unchanged Genesis art/random modules.
// These are standard Web Crypto RNG and ethers SHA-256, not new cryptography.
import { Buffer } from "buffer/";
import { sha256, getBytes } from "ethers";
export const randomBytes = (n) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(n)));
export function randomInt(min, max) {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  const range = max - min;
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    range < 1 ||
    range > 0xffffffff
  )
    throw Error("WEB_RANDOM_BOUNDS");
  const bound = Math.floor(0x100000000 / range) * range;
  for (;;) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    if (value < bound) return min + (value % range);
  }
}
export function createHash(algorithm) {
  if (algorithm !== "sha256") throw Error("WEB_HASH_ALGORITHM");
  const chunks = [];
  return {
    update(value) {
      chunks.push(Buffer.from(value));
      return this;
    },
    digest(encoding) {
      const result = Buffer.from(getBytes(sha256(Buffer.concat(chunks))));
      return encoding ? result.toString(encoding) : result;
    },
  };
}
