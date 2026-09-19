import { createContentViews } from "./content.mjs";
import { formatEther } from "ethers";
import { reviewDetails, withdrawalAmount } from "./review.mjs";
import qr from "qrcode-generator";
import artModule from "../../../genesis/production/art.cjs";
import config from "../../philcore-desktop/production/candidate-public-config.json";
import { createPasskeyProvider, assertOrigin } from "./passkey.mjs";
import { createCustody } from "./custody.mjs";
import { openStore, createJournal } from "./storage.mjs";
import { createNetwork } from "./network.mjs";
import { createExecution } from "./execution.mjs";
import { sha } from "./bytes.mjs";
import { createReleaseGuard } from "./release.mjs";
import { createWelcomeGuide } from "./welcome.mjs";
import { createSelection } from "./selection.mjs";
import { createLaunchPolicy } from "./launch.mjs";

createContentViews(document, window);

const $ = (id) => document.getElementById(id),
  show = (id, value) => {
    const element = $(id);
    if (element instanceof HTMLDialogElement) {
      if (value && !element.open) element.showModal();
      else if (!value && element.open) element.close();
    } else element.hidden = !value;
  };
function tab(name) {
  for (const [id, target] of [
    ["studio", "discover"],
    ["account-panel", "account"],
    ["owned-panel", "owned"],
    ["backup", "backup"],
  ])
    show(id, name === target);
  for (const target of ["discover", "account", "owned", "backup"]) {
    $(target + "-tab").classList.toggle("active", name === target);
  }
}
function focusNext() {
  if (["backup-password", "address"].includes(nextControlId))
    tab(nextControlId === "address" ? "account" : "backup");
  else if (["reroll", "review-mint"].includes(nextControlId)) tab("discover");
  const target = $(nextControlId);
  target.focus();
  target.scrollIntoView({ block: "center" });
}
let custody,
  store,
  network,
  launch,
  journal,
  execution,
  vault,
  art,
  selected,
  selection,
  reviewed,
  working = false,
  owned = [];
let nextControlId = "create";
const guide = createWelcomeGuide({
  document,
  storage: () => window.localStorage,
  nextControl: () => {
    focusNext();
    return $(nextControlId);
  },
});
function renderNextStep() {
  let copy, label;
  if (!vault) {
    nextControlId = "create";
    copy =
      "Start by creating your Phil account, or restore a saved backup below.";
    label = "Create your account";
  } else if (!vault.envelopes.ready) {
    nextControlId = "backup-password";
    copy = "Next, save your encrypted backup and verify the saved file.";
    label = "Back up your account";
  } else if (!network.canExecute(vault.header.account)) {
    nextControlId = "reroll";
    copy =
      "Your account and backup are ready. You can explore Phils. Public minting is paused; do not fund this account yet.";
    label = "Find your Phil";
  } else if (!reviewed) {
    nextControlId = "review-mint";
    copy =
      "Find your Phil, then review it to check the current gas estimate before adding ETH.";
    label = "Review your Phil";
  } else if (!reviewed.feeQuote.sufficient) {
    nextControlId = "address";
    copy =
      "Your reviewed estimate needs more ETH for gas. Check the shortfall and your Phil account address, then review again after funding.";
    label = "See your account address";
  } else {
    nextControlId = "approve";
    copy =
      "Check your selected Phil and the current fee before approving. An expired review must be refreshed.";
    label = "See your approval";
  }
  $("next-step-copy").textContent = copy;
  $("next-step-action").textContent = label;
}
async function refreshLaunch() {
  try {
    await launch.refresh();
  } catch {
    /* Remains closed on every unavailable or invalid policy. */
  }
  const allowed = !!vault && network.canExecute(vault.header.account);
  $("funding-help").textContent = allowed
    ? "Review your selected Phil for a current gas estimate before funding. Send only enough ETH to this account to cover the transaction."
    : "Funding is paused for this account. Do not send ETH until minting is open.";
  if (!allowed) $("approve").disabled = true;
  renderNextStep();
}
const errors = {
  WEB_SELECTION_CANCELLED:
    "Rolling stopped. Your previous selection is unchanged; generated Phils still count toward this session.",
  WEB_PRF_UNSUPPORTED:
    "This browser or passkey cannot protect a Phil vault. Use a browser and authenticator supporting passkey encryption (WebAuthn PRF). No less secure fallback is offered.",
  WEB_USER_VERIFICATION_REQUIRED:
    "Your passkey must verify you with a device PIN or biometrics.",
  WEB_BACKUP_REQUIRED:
    "Export your encrypted backup and verify it before continuing.",
  WEB_BACKUP_PASSPHRASE:
    "Enter a recovery passphrase with 16 to 1,024 characters, then export the backup again. The passphrase field is cleared after each attempt.",
  WEB_SESSION_CHANGED:
    "This step was cancelled because Phil was locked or its tab was hidden. Keep this tab in front, re-enter the recovery passphrase, and try again.",
  WEB_VAULT_AUTHENTICATION_FAILED:
    "The passkey or recovery passphrase could not authenticate this encrypted data. Nothing was exported or signed. Check that you selected the correct credential or backup.",
  WEB_PASSKEY_SIGNATURE:
    "The passkey response did not match the credential protecting this account. Nothing was unlocked.",
  WEB_PASSKEY_MISMATCH:
    "The selected passkey is not the one protecting this account. Nothing was unlocked.",
  WEB_BACKUP_BINDING:
    "This backup does not match the expected identity, account, and configuration. Nothing was changed.",
  WEB_STALE_RELEASE:
    "This release changed or could not be verified. Reload Phil before continuing.",
  WEB_MAINNET_DISABLED:
    "Minting is not open for this account. Refresh the release status before funding or approving.",
  WEB_RECONCILIATION_REQUIRED:
    "An earlier approval is unresolved. Check its status; do not repeat it or restore into another browser to retry.",
  GENESIS_RECONCILIATION_REQUIRED:
    "Confirmation is not yet established. Check again; do not repeat the approval.",
  GENESIS_PROVIDER_DISAGREEMENT:
    "The independent Ethereum services disagree. Nothing will be signed.",
  WEB_REVIEW_STALE:
    "This review expired. Review again to get current fees and state.",
  WEB_STORAGE_INVALID:
    "Local vault data is invalid. Stop and use your verified backup in a fresh browser profile.",
  WEB_RESTORE_REQUIRES_FRESH_STORAGE:
    "Restore requires a fresh browser profile without an existing Phil vault.",
  GENESIS_WITHDRAWAL: "Enter a positive ETH amount with at most 18 decimal places.",
  GENESIS_WITHDRAWAL_ESTIMATE_CHANGED: "The withdrawal fee changed. Review again for a fresh estimate.",
  INVALID_ARGUMENT: "Check the recipient Ethereum address and amount.",
  GENESIS_FUNDING:
    "The account needs more ETH for network fees, or the quote exceeds the safety limit.",
};
function status(message, bad = false) {
  $("status").textContent = message;
  $("status").className = bad ? "status error" : "status";
}
async function run(fn) {
  if (working) return;
  working = true;
  document.body.setAttribute("aria-busy", "true");
  try {
    await fn();
  } catch (e) {
    execution?.cancel();
    reviewed = null;
    show("review", false);
    if (selection?.current()) {
      selected = selection.current();
      renderSelected();
    }
    status(
      ["NotAllowedError", "AbortError"].includes(e.name)
        ? "Device approval was cancelled or unavailable."
        : errors[e.message] || errors[e.code] ||
            "This step could not be verified. Nothing will be retried automatically. Check your connection, device approval, or backup and try the step again.",
      true,
    );
  } finally {
    working = false;
    document.body.removeAttribute("aria-busy");
  }
}
function invalidate() {
  selection?.cancel();
  execution?.cancel();
  reviewed = null;
  show("review", false);
  renderNextStep();
}
function renderSelected() {
  if (!selected) return;
  const value = art.render(BigInt(selected.recipeId), BigInt(selected.nameId));
  $("art").src = value.image;
  $("art").alt = value.name;
  $("phil-name").textContent = value.name;
  $("roll-count").textContent = "Rolls: " + selection.rolls;
  $("selection-status").textContent = selected.kept
    ? "Kept in this browser. This is not an on-chain reservation."
    : "Latest roll saved in this browser. Use Keep this Phil to protect it from accidental rerolls.";
  $("keep").disabled = selected.kept;
  $("undo").disabled = !selected.canUndo;
  $("reroll").textContent = selected.kept ? "Continue browsing" : "Reroll";
  $("recipe").textContent = "Recipe " + selected.recipeId;
  $("traits").replaceChildren(
    ...value.traits.map((t) => {
      const li = document.createElement("li");
      li.textContent = t.category + ": " + t.name;
      return li;
    }),
  );
}
async function roll(count = 1) {
  if (selection.current()?.kept) {
    show("replace-selection", true);
    return;
  }
  invalidate();
  selected = await selection.roll(count);
  renderSelected();
  status(
    count === 1
      ? "New Phil saved in this browser. Nothing was sent to Ethereum."
      : count +
          " rolls complete. The final artwork and name are saved; intermediate rolls cannot be recovered.",
  );
}
async function syncVault() {
  vault = await custody.read();
  show("onboarding", !vault);
  show("workspace", !!vault);
  $("export").disabled = !vault;
  $("verify").disabled = !vault;
  $("restore").disabled = !!vault;
  $("refresh-owned").disabled = !vault;
  renderNextStep();
  if (!vault) return;
  if (!selected) {
    selected = await selection.roll();
    renderSelected();
  }
  $("account-label").textContent = vault.header.label;
  $("address").textContent = vault.header.account;
  const code = qr(0, "M");
  code.addData("ethereum:" + vault.header.account + "@1");
  code.make();
  $("qr").src = code.createDataURL(4, 8);
  $("backup-status").textContent = vault.envelopes.ready
    ? "Backup verified. Keep the file and recovery passphrase separately."
    : "A verified encrypted backup is required before approval.";
  $("review-mint").disabled = !vault.envelopes.ready;
  await refreshAttempts();
  tab(vault.envelopes.ready ? "discover" : "backup");
}
async function refreshBalance() {
  if (!vault) return;
  $("balance-status").textContent = "Checking both Ethereum services…";
  try {
    const value = await network.balance(vault.header);
    $("wallet-balance").textContent = formatEther(value.balanceWei) + " ETH";
    $("wallet-deposit").textContent = "EntryPoint deposit: " + formatEther(value.depositWei) + " ETH · Total available: " + formatEther(value.availableWei) + " ETH";
    $("balance-status").textContent = "Verified using both Mainnet providers at block " + value.block + ". Updated " + new Date(value.observedAtMs).toLocaleTimeString() + ".";
  } catch (error) {
    $("wallet-balance").textContent = "Balance unavailable";
    $("wallet-deposit").textContent = "";
    $("balance-status").textContent = errors[error.message] || "Balance could not be verified. Refresh to try again.";
  }
}
let fundingTimer;
async function refreshFunding() {
  invalidate();
  clearTimeout(fundingTimer);
  $("funding-quote").textContent = "Checking current fees and funding…";
  try {
    if (!vault?.envelopes.ready) throw Error("WEB_BACKUP_REQUIRED");
    const { feeQuote: q } = await network.prepare(vault.header, "MINT_PHIL", selected);
    $("funding-quote").textContent = (q.sufficient ? "Enough ETH appears available for mint gas. " : "Additional ETH needed: " + formatEther(q.additionalWei) + " ETH. ") + "Recommended available: " + formatEther(q.recommendedWei) + " ETH. Estimate expires after 30 seconds; the exact fee is checked again in mint review.";
    fundingTimer = setTimeout(() => { $("funding-quote").textContent = "Funding estimate expired. Refresh for current fees."; }, Math.max(0, q.observedAtMs + 30000 - Date.now()));
    await refreshBalance();
    status("Funding estimate refreshed. No approval or transaction was requested.");
  } catch (error) {
    $("funding-quote").textContent = "Funding estimate unavailable. Refresh to try again.";
    throw error;
  }
}
function confirmedTransaction(result) {
  const link = $("transaction-link");
  link.hidden = !/^0x[0-9a-f]{64}$/i.test(result.transactionHash || "");
  if (!link.hidden) {
    link.href = "https://etherscan.io/tx/" + result.transactionHash;
    link.textContent = "View confirmed transaction ↗";
  }
}
async function refreshAttempts() {
  if (!vault) return;
  const attempts = await journal.pending(vault.header.account);
  show("pending", attempts.length > 0);
  $("pending-list").replaceChildren(
    ...attempts.map((record) => {
      const li = document.createElement("li");
      const text = document.createElement("p");
      text.textContent =
        "Approval " + record.pkg.userOperationHash + " — " + record.state;
      li.append(text);
      const button = document.createElement("button");
      button.textContent = "Check confirmation";
      button.addEventListener("click", () =>
        run(async () => {
          const result = await execution.reconcile(record);
          if (result.status === "confirmed") {
            status(
              result.success
                ? "Confirmed on Ethereum."
                : "The operation failed on Ethereum. Its approval will not be reused.",
            );
            confirmedTransaction(result);
            await refreshOwned();
            await refreshBalance();
          } else if (result.status === "retired")
            status(
              "The earlier approval was never submitted and has been safely retired. Review and approve a new operation to continue.",
            );
          else if (result.status === "retirable")
            status(
              "The earlier approval can no longer execute and has been safely retired. Review and approve a new operation to continue.",
            );
          else status("Still unresolved. No new submission was sent.");
          await refreshAttempts();
        }),
      );
      li.append(button);
      return li;
    }),
  );
}
async function refreshOwned() {
  owned = await network.owned(vault.header);
  $("owned-list").replaceChildren(
    ...owned.map((token) => {
      const value = art.render(BigInt(token.recipeId), BigInt(token.nameId)),
        card = document.createElement("article"),
        image = document.createElement("img"),
        title = document.createElement("h3");
      image.src = value.image;
      image.alt = value.name;
      title.textContent = value.name + " #" + token.tokenId;
      card.append(image, title);
      return card;
    }),
  );
  $("token").replaceChildren(
    ...owned.map((token) => {
      const option = document.createElement("option");
      option.value = token.tokenId;
      option.textContent =
        art.render(BigInt(token.recipeId), BigInt(token.nameId)).name +
        " #" +
        token.tokenId;
      return option;
    }),
  );
  show("transfer", owned.length > 0);
  $("owned-status").textContent = owned.length
    ? "Ownership verified using both Mainnet providers."
    : "No Genesis Phil is currently owned by this account.";
  status(
    owned.length
      ? "Your confirmed Phil collection is up to date."
      : "No Phil is currently held by this account.",
  );
}
async function prepare(action) {
  invalidate();
  if (!vault?.envelopes.ready) throw Error("WEB_BACKUP_REQUIRED");
  if (action === "MINT_PHIL") {
    selected = await selection.keep();
    renderSelected();
  }
  let choice = selected;
  if (action === "TRANSFER_PHIL") {
    const token = owned.find((x) => x.tokenId === $("token").value);
    if (!token) throw Error("WEB_SELECTION_REQUIRED");
    choice = { ...token, recipient: $("recipient").value.trim() };
  }
  if (action === "WITHDRAW_ETH") choice = {
    recipient: $("withdraw-recipient").value.trim(),
    amountWei: withdrawalAmount($("withdraw-amount").value, $("withdraw-max").checked),
  };
  status("Checking both Ethereum services and estimating the network fee…");
  const value = await network.prepare(vault.header, action, choice);
  execution.review(value);
  reviewed = value;
  const withdrawing = action === "WITHDRAW_ETH";
  const display = withdrawing ? null : { ...art.render(BigInt(choice.recipeId), BigInt(choice.nameId)), recipeId: choice.recipeId };
  show("review-art", !withdrawing);
  if (display) {
    $("review-art").src = display.image;
    $("review-art").alt = display.name;
  } else $("review-art").removeAttribute("src");
  $("review-title").textContent = withdrawing ? "Withdraw ETH" : (action === "MINT_PHIL" ? "Mint " : "Transfer ") + display.name;
  const pairs = reviewDetails(value, display);
  $("review-details").replaceChildren(
    ...pairs.flatMap(([key, value]) => {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value;
      return [dt, dd];
    }),
  );
  $("operation-hash").textContent = value.pkg.userOperationHash;
  await refreshLaunch();
  $("approve").disabled =
    !network.canExecute(vault.header.account) || !value.feeQuote.sufficient;
  $("review-note").textContent =
    action === "MINT_PHIL"
      ? "You pay Ethereum network gas. This account can mint once, permanently. The pictured Phil and its name are fixed in this approval."
      : withdrawing ? "The exact ETH amount above will be sent to the recipient. The maximum network fee is reserved separately. A small unused gas refund may remain. Ethereum transfers cannot be undone."
      : "The pictured Phil will be sent to the recipient above. Ethereum transfers cannot be undone.";
  show("review", true);
  renderNextStep();
  status(
    network.canExecute(vault.header.account)
      ? "Review the exact artwork, recipient and fee before your approval."
      : "Review prepared. Minting is not open for this account; do not fund yet.",
  );
  $("cancel").focus();
}
async function backupFile() {
  const file = $("backup-file").files[0];
  if (!file || file.size > 100000) throw Error("WEB_BACKUP_INVALID");
  return file.text();
}
function takePassphrase() {
  const value = $("backup-password").value;
  $("backup-password").value = "";
  return value;
}
function download(text) {
  const blob = new Blob([text], { type: "application/json" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "phil-web-encrypted-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function startup() {
  assertOrigin();
  if (
    !crypto.subtle ||
    !navigator.credentials ||
    !globalThis.indexedDB ||
    !navigator.locks
  )
    throw Error("WEB_PRF_UNSUPPORTED");
  const assertCurrentRelease = createReleaseGuard({
    sourceDigest: __PHIL_SOURCE_DIGEST__,
    commit: __PHIL_COMMIT__,
    preview: __PHIL_LOCAL_PREVIEW__,
    mainnetEnabled: !__PHIL_LOCAL_PREVIEW__,
  });
  const release = await assertCurrentRelease();
  $("release").textContent =
    "Genesis Web · " +
    release.commit.slice(0, 12) +
    " · " +
    release.sourceDigest.slice(0, 12) +
    (release.preview ? " · local preview" : "");
  const [catalogResponse, manifestResponse] = await Promise.all([
    fetch("/catalog.bin", { credentials: "omit", redirect: "error" }),
    fetch("/catalog-manifest.json", { credentials: "omit", redirect: "error" }),
  ]);
  if (!catalogResponse.ok || !manifestResponse.ok)
    throw Error("GENESIS_ART_CHANGED");
  const catalog = await catalogResponse.arrayBuffer(),
    manifestBytes = await manifestResponse.arrayBuffer();
  const hex = (bytes) =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  if (
    hex(await sha(catalog)) !== __PHIL_CATALOG_SHA__ ||
    hex(await sha(manifestBytes)) !== __PHIL_MANIFEST_SHA__
  )
    throw Error("GENESIS_ART_CHANGED");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  if (manifest.runtimeCommitment !== config.catalogCommitment)
    throw Error("GENESIS_ART_CHANGED");
  art = artModule.createArtReader({ catalog, manifest });
  store = await openStore();
  custody = createCustody({
    store,
    passkeys: createPasskeyProvider(),
    config,
    assertCurrentRelease,
  });
  journal = createJournal(store);
  const manifestHash = Array.from(
    await sha(
      new TextEncoder().encode(JSON.stringify(release, null, 2) + "\n"),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  launch = createLaunchPolicy({
    releaseId: release.commit + ":" + manifestHash,
    preview: release.preview,
  });
  network = createNetwork(config, { launch });
  await refreshLaunch();
  execution = createExecution({ custody, journal, network });
  selection = createSelection({
    store,
    onRoll: (n) => {
      $("roll-count").textContent = "Rolls: " + n;
    },
    onFrame: async (value, index, count) => {
      const image = art.render(BigInt(value.recipeId), BigInt(value.nameId));
      $("art").src = image.image;
      $("art").alt = image.name;
      $("phil-name").textContent = image.name;
      status("Rolling " + index + " of " + count + "…");
      await new Promise((resolve) => setTimeout(resolve, 30));
    },
  });
  selected = await selection.load();
  if (selected) renderSelected();
  await syncVault();
  await refreshLaunch();
  void refreshBalance();
  show("loading", false);
  show("application", true);
  status("");
  $("next-step-action").addEventListener("click", () => {
    renderNextStep();
    focusNext();
  });
  $("create").addEventListener("click", () =>
    run(async () => {
      await custody.create($("label").value);
      await syncVault();
      await refreshLaunch();
      status(
        "Account derived locally. Export and verify its encrypted backup next.",
      );
    }),
  );
  $("export").addEventListener("click", () =>
    run(async () => {
      const text = await custody.exportBackup(takePassphrase());
      download(text);
      status(
        "Backup exported. Select the saved file and enter its recovery passphrase to verify it.",
      );
    }),
  );
  $("verify").addEventListener("click", () =>
    run(async () => {
      const file = await backupFile();
      await custody.verifyBackup(file, takePassphrase());
      await syncVault();
      status("Backup verified against this identity and account.");
    }),
  );
  $("restore").addEventListener("click", () =>
    run(async () => {
      const file = await backupFile();
      await custody.restore(file, takePassphrase());
      await syncVault();
      status(
        "Restored the same identity and account with a new local passkey wrapping.",
      );
    }),
  );
  $("reroll").addEventListener("click", () => run(() => roll()));
  $("roll10").addEventListener("click", () => run(() => roll(10)));
  $("roll100").addEventListener("click", () => run(() => roll(100)));
  $("keep").addEventListener("click", () =>
    run(async () => {
      selected = await selection.keep();
      renderSelected();
    }),
  );
  $("undo").addEventListener("click", () =>
    run(async () => {
      invalidate();
      selected = await selection.undo();
      renderSelected();
    }),
  );
  $("stay-selection").addEventListener("click", () =>
    show("replace-selection", false),
  );
  $("allow-reroll").addEventListener("click", () =>
    run(async () => {
      selected = await selection.release();
      renderSelected();
      show("replace-selection", false);
    }),
  );
  for (const name of ["discover", "account", "owned", "backup"])
    $(name + "-tab").addEventListener("click", () => {
      if (!working) { tab(name); if (name === "account") void run(refreshBalance); }
    });
  $("open-restore").addEventListener("click", () => {
    tab("backup");
    $("backup").scrollIntoView();
  });
  $("funding-review").addEventListener("click", () =>
    run(refreshFunding),
  );
  $("expand-art").addEventListener("click", () => {
    if (!selected) return;
    $("enlarged-art").src = $("art").src;
    $("artwork-title").textContent = $("phil-name").textContent;
    show("artwork-viewer", true);
  });
  $("artwork-close").addEventListener("click", () =>
    show("artwork-viewer", false),
  );
  $("review-close").addEventListener("click", () => {
    invalidate();
    status("Review cancelled.");
  });
  $("review").addEventListener("cancel", () => invalidate());
  $("review-mint").addEventListener("click", () =>
    run(() => prepare("MINT_PHIL")),
  );
  $("review-transfer").addEventListener("click", () =>
    run(() => prepare("TRANSFER_PHIL")),
  );
  $("withdrawForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void run(() => prepare("WITHDRAW_ETH"));
  });
  for (const id of ["withdraw-max", "withdraw-custom"]) $(id).addEventListener("change", () => {
    invalidate();
    const maximum = $("withdraw-max").checked;
    show("withdraw-amount-label", !maximum);
    $("withdraw-amount").disabled = maximum;
    $("review-withdrawal").textContent = maximum ? "Review withdraw all" : "Review withdrawal";
  });
  for (const id of ["withdraw-recipient", "withdraw-amount"]) $(id).addEventListener("input", invalidate);
  $("refresh-balance").addEventListener("click", () => run(refreshBalance));
  $("copy-account").addEventListener("click", () => run(async () => {
    await navigator.clipboard.writeText(vault.header.account);
    status("Copied your Phil account address.");
  }));
  $("recipient").addEventListener("input", invalidate);
  $("token").addEventListener("change", invalidate);
  $("cancel").addEventListener("click", () => {
    invalidate();
    status("Review cancelled.");
  });
  $("approve").addEventListener("click", () =>
    run(async () => {
      const action = reviewed?.pkg.presentation.action;
      const result = await execution.confirm();
      invalidate();
      await refreshAttempts();
      if (result.status === "confirmed" && result.success) {
        await refreshOwned();
        await refreshBalance();
        confirmedTransaction(result);
        tab(action === "WITHDRAW_ETH" ? "account" : "owned");
        status(
          (action === "WITHDRAW_ETH" ? "Withdrawal confirmed on Ethereum. Transaction: " : "Your Phil transaction is confirmed on Ethereum. Transaction: ") +
            result.transactionHash,
        );
      } else
        status(
          "Approval submitted once. Check confirmation before taking another action.",
        );
    }),
  );
  $("check-chain").addEventListener("click", () =>
    run(async () => {
      await network.infrastructure();
      status(
        "Both Ethereum services agree on the pinned Genesis contracts and artwork.",
      );
    }),
  );
  $("refresh-owned").addEventListener("click", () => run(refreshOwned));
  $("lock").addEventListener("click", () => {
    invalidate();
    $("backup-password").value = "";
    status(
      "Approval cleared. The next sensitive action requires your passkey.",
    );
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      invalidate();
      $("backup-password").value = "";
    }
  });
  $("donation").addEventListener("click", () =>
    run(async () => {
      await navigator.clipboard.writeText("tylerlengyel.eth");
      status("Copied tylerlengyel.eth.");
    }),
  );
  guide.start();
}
startup().catch(() => {
  show("loading", false);
  status(
    "Phil Web could not verify this release or browser. Use the exact secure origin with a supported browser. No account was unlocked.",
    true,
  );
});
