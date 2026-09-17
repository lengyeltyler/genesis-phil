// Adapted from frozen v0.2 nonce journal. No existing v0.2 source modified.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// An exclusive, durable nonce claim is written BEFORE accessing a wallet signer.
// A pre-existing claim is never adopted, deleted, resumed, or overwritten. After
// a crash the owner must reconcile it; a different intent cannot reuse the nonce.
function claimGenesisExecutionAttempt({
  directory,
  authorizationPackage: pkg,
}) {
  if (
    typeof directory !== "string" ||
    !path.isAbsolute(directory) ||
    directory === "/"
  )
    fail("GENESIS_ATTEMPT_DIRECTORY_INVALID");
  const envelope = {
    ...pkg.authorization,
    chainId: pkg.profile.chainId,
    executionAccount: pkg.profile.account,
    accountNonce: pkg.op.nonce,
    authorizationEnvelopeDigest: pkg.presentationDigest,
    canonicalUserOperationHash: pkg.userOperationHash,
    maximumTotalFeeWei: pkg.authorization.maximumFeeWei,
  };
  if (!["31337", "1"].includes(envelope.chainId)) fail("GENESIS_LOCAL_ONLY");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(directory) !== path.resolve(directory) ||
    (stat.mode & 0o077) !== 0
  )
    fail("GENESIS_ATTEMPT_DIRECTORY_INVALID");
  const key = createHash("sha256")
    .update(
      `${envelope.chainId}:${envelope.executionAccount}:${envelope.accountNonce}`,
    )
    .digest("hex");
  const location = path.join(directory, `${key}.jsonl`);
  let descriptor,
    state = "signing_started",
    poisoned = false;
  const binding = Object.freeze({
    format: "phil-genesis-local-execution-attempt-v1",
    chainId: envelope.chainId,
    account: envelope.executionAccount,
    nonce: envelope.accountNonce,
    authorizationId: envelope.authorizationId,
    envelopeDigest: envelope.authorizationEnvelopeDigest,
    userOperationHash: envelope.canonicalUserOperationHash,
    maximumTotalFeeWei: envelope.maximumTotalFeeWei,
    validUntil: envelope.validUntil,
  });
  let expectedContent = JSON.stringify({ ...binding, state }) + "\n";
  try {
    descriptor = fs.openSync(
      location,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_RDWR |
        fs.constants.O_APPEND |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(descriptor, expectedContent);
    fs.fsyncSync(descriptor);
    syncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    // Leave even a partial claim in place. Never retry signing after ambiguity.
    fail(
      error.code === "EEXIST"
        ? "GENESIS_NONCE_ATTEMPT_ALREADY_EXISTS"
        : "GENESIS_ATTEMPT_PERSISTENCE_FAILED",
    );
  }
  const identity = fs.fstatSync(descriptor);
  function close() {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
      descriptor = undefined;
    }
  }
  function assertFileCurrent() {
    const disk = fs.lstatSync(location);
    if (
      !disk.isFile() ||
      disk.nlink !== 1 ||
      disk.ino !== identity.ino ||
      disk.dev !== identity.dev ||
      (disk.mode & 0o077) !== 0 ||
      disk.size !== Buffer.byteLength(expectedContent)
    )
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    const bytes = Buffer.alloc(Buffer.byteLength(expectedContent));
    if (
      fs.readSync(descriptor, bytes, 0, bytes.length, 0) !== bytes.length ||
      bytes.toString("utf8") !== expectedContent
    )
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
  }
  function transition(expected, next, receipt, diagnostic) {
    if (poisoned || descriptor === undefined || state !== expected)
      fail("GENESIS_ATTEMPT_TRANSITION_REJECTED");
    try {
      assertFileCurrent();
      const entry =
        JSON.stringify({
          state: next,
          ...(receipt ? { receipt } : {}),
          ...(diagnostic ? { diagnostic } : {}),
        }) + "\n";
      fs.writeFileSync(descriptor, entry);
      fs.fsyncSync(descriptor);
      expectedContent += entry;
      state = next;
      if (["confirmed", "failed", "invalidated"].includes(next)) close();
    } catch {
      poisoned = true;
      close();
      fail("GENESIS_ATTEMPT_PERSISTENCE_FAILED");
    }
  }
  return Object.freeze({
    binding,
    snapshot: () => {
      if (descriptor !== undefined) assertFileCurrent();
      return Object.freeze({ state, poisoned, ...binding });
    },
    markSigned: () => transition("signing_started", "signed"),
    markSubmissionStarted: () => transition("signed", "submission_started"),
    markConfirmed(receipt) {
      if (
        !receipt ||
        !/^0x[0-9a-f]{64}$/.test(receipt.transactionHash) ||
        !/^0x[0-9a-f]{64}$/.test(receipt.blockHash) ||
        !/^[0-9]+$/.test(receipt.blockNumber) ||
        receipt.success !== true
      )
        fail("GENESIS_ATTEMPT_RECEIPT_INVALID");
      transition("submission_started", "confirmed", {
        transactionHash: receipt.transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        success: true,
      });
    },
    markReverted(receipt) {
      if (!receipt || receipt.success !== false ||
          receipt.userOperationHash !== binding.userOperationHash ||
          !/^0x[0-9a-f]{64}$/.test(receipt.transactionHash) ||
          !/^0x[0-9a-f]{64}$/.test(receipt.blockHash) ||
          !/^[0-9]+$/.test(receipt.blockNumber) ||
          !/^[0-9]+$/.test(receipt.actualGasCost) ||
          !/^[0-9]+$/.test(receipt.actualGasUsed)) fail("GENESIS_ATTEMPT_RECEIPT_INVALID");
      transition("submission_started", "failed", {
        transactionHash: receipt.transactionHash, blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber, success: false,
        userOperationHash: receipt.userOperationHash,
        actualGasCost: receipt.actualGasCost, actualGasUsed: receipt.actualGasUsed,
      }, "confirmed_execution_revert");
    },
    fail() {
      if (state === "submission_started") {
        close();
        return;
      }
      if (descriptor !== undefined) transition(state, "failed");
    },
    invalidate() {
      if (state === "submission_started") {
        close();
        return;
      }
      if (descriptor !== undefined) transition(state, "invalidated");
    },
  });
}

module.exports = { claimGenesisExecutionAttempt };
