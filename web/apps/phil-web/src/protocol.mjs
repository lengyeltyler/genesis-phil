// Shared Genesis wire protocol. No browser custody or submission implementation.
// The legacy mode labels describe existing protocol profiles; this module does
// not claim that a browser provides Desktop platform protection or phone approval.
import account from "../../../genesis/runtime/account.cjs";
import authorization from "../../../genesis/runtime/authorization.cjs";
import recipes from "../../../genesis/runtime/recipes.cjs";
import names from "../../../genesis/runtime/names-codec.cjs";
import funding from "../../../genesis/preview/funding.cjs";

export const { deriveAccount } = account;
export const {
  buildAuthorization,
  validateProfile,
  getUserOpHash,
  canonicalJSON,
  digest,
  isBuiltAuthorization,
} = authorization;
export const { recipe, encodeSelection } = recipes;
export const { encodeChoice, decodeChoice, generatedName } = names;
export const { quoteFunding } = funding;
