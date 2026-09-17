import { formatEther, parseEther } from "ethers";

export function withdrawalAmount(value, maximum) {
  if (maximum) return "max";
  const text = value.trim();
  if (!/^(?:\d+(?:\.\d{1,18})?|\.\d{1,18})$/.test(text))
    throw Error("GENESIS_WITHDRAWAL");
  const wei = parseEther(text);
  if (wei <= 0n) throw Error("GENESIS_WITHDRAWAL");
  return String(wei);
}

// Display only fields from the exact built authorization, never editable inputs.
export function reviewDetails(value, display) {
  const { pkg, feeQuote } = value, p = pkg.presentation;
  const withdrawing = p.action === "WITHDRAW_ETH";
  return [
    ["Action", withdrawing ? "Withdraw ETH" : p.action === "MINT_PHIL" ? "Mint my Phil" : "Transfer this Phil"],
    ["Network", "Ethereum Mainnet"],
    ["From account", pkg.profile.account],
    ["Recipient", p.recipient],
    ...(withdrawing ? [["You receive", formatEther(p.principalWei) + " ETH"]] : [
      ["Collection", pkg.profile.genesis],
      ["Artwork", display.name + " · recipe " + (p.recipeId ?? display.recipeId)],
      ["Mint price", p.action === "MINT_PHIL" ? "0 ETH" : "Not applicable"],
    ]),
    ["Maximum approved network fee", formatEther(pkg.authorization.maximumFeeWei) + " ETH"],
    ["Total available ETH", formatEther(feeQuote.availableWei) + " ETH"],
    ["Additional funding needed", formatEther(feeQuote.additionalWei) + " ETH"],
  ];
}
