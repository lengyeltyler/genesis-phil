import { buildAuthorization, canonicalJSON } from "./protocol.mjs";
// Reconstruct all semantic fields, operation bytes, and hashes before trusting a
// package recovered after a reload. This never enables replay/signing of a record.
export function validatePersistedPackage(pkg) {
  try {
    const { profile, presentation: p, authorization: a, op } = pkg;
    if (
      !["MINT_PHIL", "TRANSFER_PHIL"].includes(p.action) ||
      profile.mode !== "DESKTOP_GENESIS" ||
      op.signature !== "0x"
    )
      throw Error();
    const gas = BigInt(op.accountGasLimits),
      fees = BigInt(op.gasFees),
      mask = (1n << 128n) - 1n;
    const rebuilt = buildAuthorization(
      profile,
      {
        action: p.action,
        ...(p.action === "MINT_PHIL"
          ? { tokenId: p.recipeId, nameId: p.nameId }
          : { tokenId: p.tokenId }),
        recipient: p.recipient,
        nonce: op.nonce,
        authorizationId: a.authorizationId,
        philNonce: a.philNonce,
        validAfter: a.validAfter,
        validUntil: a.validUntil,
        callGasLimit: String(gas & mask),
        verificationGasLimit: String(gas >> 128n),
        preVerificationGas: op.preVerificationGas,
        maxFeePerGas: String(fees & mask),
        maxPriorityFeePerGas: String(fees >> 128n),
      },
      op.initCode === "0x" ? null : { initCode: op.initCode },
    );
    if (canonicalJSON(pkg) !== canonicalJSON(rebuilt)) throw Error();
    return pkg;
  } catch {
    throw Error("WEB_JOURNAL_INVALID");
  }
}
