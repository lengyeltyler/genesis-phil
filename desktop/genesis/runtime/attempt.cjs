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
function validateDirectory(directory, create = false) {
  if (
    typeof directory !== "string" ||
    !path.isAbsolute(directory) ||
    directory === "/"
  )
    fail("GENESIS_ATTEMPT_DIRECTORY_INVALID");
  if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    fs.realpathSync(directory) !== path.resolve(directory) ||
    (stat.mode & 0o077) !== 0
  )
    fail("GENESIS_ATTEMPT_DIRECTORY_INVALID");
}
function keyFor(chainId, account, nonce) {
  return createHash("sha256")
    .update(`${chainId}:${account}:${nonce}`)
    .digest("hex");
}
function bindingForPackage(pkg) {
  return Object.freeze({
    format: "phil-genesis-local-execution-attempt-v1",
    chainId: pkg.profile.chainId,
    account: pkg.profile.account,
    nonce: pkg.op.nonce,
    authorizationId: pkg.authorization.authorizationId,
    envelopeDigest: pkg.presentationDigest,
    userOperationHash: pkg.userOperationHash,
    maximumTotalFeeWei: pkg.authorization.maximumFeeWei,
    validUntil: pkg.authorization.validUntil,
  });
}
function validResolution(resolution, binding) {
  return Boolean(
    resolution &&
      [
        "definitely_not_submitted",
        "nonce_advanced",
        "authorization_expired",
        "valid_account_predeployed",
      ].includes(resolution.reason) &&
      resolution.userOperationHash === binding.userOperationHash &&
      (resolution.safeBlockNumber === undefined ||
        /^(0|[1-9][0-9]*)$/.test(resolution.safeBlockNumber)) &&
      (resolution.safeBlockHash === undefined ||
        /^0x[0-9a-f]{64}$/i.test(resolution.safeBlockHash)),
  );
}
function exactKeys(value, keys) {
  return Boolean(
    value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).sort().join("|") === keys.slice().sort().join("|"),
  );
}
function validReceipt(receipt, success, binding) {
  const keys = ["transactionHash", "blockHash", "blockNumber", "success"];
  if (!success) keys.push("userOperationHash", "actualGasCost", "actualGasUsed");
  return Boolean(
    exactKeys(receipt, keys) &&
      receipt.success === success &&
      /^0x[0-9a-f]{64}$/.test(receipt.transactionHash) &&
      /^0x[0-9a-f]{64}$/.test(receipt.blockHash) &&
      /^(0|[1-9][0-9]*)$/.test(receipt.blockNumber) &&
      (success ||
        (receipt.userOperationHash === binding.userOperationHash &&
          /^(0|[1-9][0-9]*)$/.test(receipt.actualGasCost) &&
          /^(0|[1-9][0-9]*)$/.test(receipt.actualGasUsed))),
  );
}
function parseJournal(content) {
  if (!content.endsWith("\n")) fail("GENESIS_ATTEMPT_FILE_CHANGED");
  let rows;
  try {
    rows = content.slice(0, -1).split("\n").map(JSON.parse);
  } catch {
    fail("GENESIS_ATTEMPT_FILE_CHANGED");
  }
  const binding = rows[0];
  if (
    !binding ||
    !exactKeys(binding, ["format","chainId","account","nonce","authorizationId","envelopeDigest","userOperationHash","maximumTotalFeeWei","validUntil","state"]) ||
    binding.format !== "phil-genesis-local-execution-attempt-v1" ||
    binding.state !== "signing_started" ||
    !["1", "31337"].includes(binding.chainId) ||
    !/^0x[0-9a-f]{40}$/.test(binding.account) ||
    !/^(0|[1-9][0-9]*)$/.test(binding.nonce) ||
    !/^0x[0-9a-f]{64}$/.test(binding.authorizationId) ||
    !/^0x[0-9a-f]{64}$/.test(binding.envelopeDigest) ||
    !/^0x[0-9a-f]{64}$/.test(binding.userOperationHash) ||
    !/^(0|[1-9][0-9]*)$/.test(binding.maximumTotalFeeWei) ||
    !/^(0|[1-9][0-9]*)$/.test(binding.validUntil)
  )
    fail("GENESIS_ATTEMPT_FILE_CHANGED");
  let state = "signing_started";
  for (const row of rows.slice(1)) {
    if (!row || typeof row !== "object" || Array.isArray(row))
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    const next = row.state;
    const allowed = {
      signing_started: ["signed", "retired", "failed", "invalidated"],
      signed: ["submission_started", "retired", "failed", "invalidated"],
      submission_started: ["submitted", "confirmed", "failed", "retired"],
      submitted: ["confirmed", "failed", "retired"],
    }[state];
    if (!allowed?.includes(next)) fail("GENESIS_ATTEMPT_FILE_CHANGED");
    if (["signed", "submission_started", "invalidated"].includes(next) &&
        !exactKeys(row, ["state"])) fail("GENESIS_ATTEMPT_FILE_CHANGED");
    if (next === "submitted" &&
        (!exactKeys(row, ["state", "receipt"]) ||
         !exactKeys(row.receipt, ["userOperationHash"]) ||
         row.receipt.userOperationHash !== binding.userOperationHash))
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    if (next === "retired" &&
        (!exactKeys(row, ["state", "resolution"]) ||
         !validResolution(row.resolution, binding) ||
         Object.keys(row.resolution).some(key => !["status","reason","userOperationHash","safeBlockNumber","safeBlockHash"].includes(key))))
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    if (next === "confirmed" &&
        (!exactKeys(row, ["state", "receipt"]) || !validReceipt(row.receipt, true, binding)))
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    if (next === "failed") {
      const legacy = exactKeys(row, ["state"]);
      const reverted = exactKeys(row, ["state", "receipt", "diagnostic"]) &&
        row.diagnostic === "confirmed_execution_revert" &&
        validReceipt(row.receipt, false, binding);
      if (!legacy && !reverted) fail("GENESIS_ATTEMPT_FILE_CHANGED");
    }
    state = next;
  }
  return { rows, binding, state };
}
function inspectGenesisExecutionAttempt({ directory, name }) {
  validateDirectory(directory);
  if (!/^[0-9a-f]{64}\.jsonl$/.test(name))
    fail("GENESIS_ATTEMPT_FILE_CHANGED");
  const location = path.join(directory, name);
  let fd;
  try {
    fd = fs.openSync(
      location,
      fs.constants.O_RDONLY |
        fs.constants.O_NOFOLLOW |
        fs.constants.O_NONBLOCK,
    );
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077 ||
      stat.size === 0 ||
      stat.size > 32768
    )
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    const content = fs.readFileSync(fd, "utf8");
    const parsed = parseJournal(content);
    if (keyFor(parsed.binding.chainId, parsed.binding.account, parsed.binding.nonce) + ".jsonl" !== name)
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    return Object.freeze({ ...parsed, content, location });
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function retireGenesisExecutionAttempt({
  directory,
  binding,
  expectedState,
  resolution,
}) {
  const key = keyFor(binding.chainId, binding.account, binding.nonce);
  const current = inspectGenesisExecutionAttempt({ directory, name: key + ".jsonl" });
  if (
    current.state !== expectedState ||
    Object.keys(binding).some((field) => current.binding[field] !== binding[field]) ||
    !validResolution(resolution, current.binding)
  )
    fail("GENESIS_ATTEMPT_TRANSITION_REJECTED");
  let fd;
  try {
    fd = fs.openSync(
      current.location,
      fs.constants.O_RDWR |
        fs.constants.O_APPEND |
        fs.constants.O_NOFOLLOW |
        fs.constants.O_NONBLOCK,
    );
    const before = fs.fstatSync(fd), disk = fs.lstatSync(current.location);
    if (
      before.ino !== disk.ino ||
      before.dev !== disk.dev ||
      before.nlink !== 1 ||
      before.size !== Buffer.byteLength(current.content) ||
      fs.readFileSync(fd, "utf8") !== current.content
    )
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    fs.writeFileSync(fd, JSON.stringify({ state: "retired", resolution }) + "\n");
    fs.fsyncSync(fd);
  } catch (error) {
    if (error.code?.startsWith("GENESIS_")) throw error;
    fail("GENESIS_ATTEMPT_PERSISTENCE_FAILED");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return Object.freeze({ ...binding, state: "retired", resolution });
}
function rotateRetiredAttempt(directory, key, replacement) {
  const current = inspectGenesisExecutionAttempt({ directory, name: key + ".jsonl" });
  if (
    current.state !== "retired" ||
    current.binding.userOperationHash === replacement.userOperationHash ||
    current.binding.authorizationId === replacement.authorizationId
  )
    fail("GENESIS_NONCE_ATTEMPT_ALREADY_EXISTS");
  const archive = path.join(
    directory,
    `${key}.${current.binding.userOperationHash.slice(2)}.retired`,
  );
  try {
    fs.linkSync(current.location, archive);
    syncDirectory(directory);
    const active = fs.lstatSync(current.location), saved = fs.lstatSync(archive);
    if (
      !active.isFile() ||
      !saved.isFile() ||
      active.ino !== saved.ino ||
      active.dev !== saved.dev ||
      active.nlink !== 2 ||
      saved.nlink !== 2
    )
      fail("GENESIS_ATTEMPT_FILE_CHANGED");
    fs.unlinkSync(current.location);
    syncDirectory(directory);
  } catch (error) {
    if (error.code?.startsWith("GENESIS_")) throw error;
    fail("GENESIS_ATTEMPT_PERSISTENCE_FAILED");
  }
}

// An exclusive, durable nonce claim is written BEFORE accessing a wallet signer.
// A pre-existing claim is never adopted, deleted, resumed, or overwritten. After
// a crash the owner must reconcile it; a different intent cannot reuse the nonce.
function claimGenesisExecutionAttempt({
  directory,
  authorizationPackage: pkg,
}) {
  validateDirectory(directory, true);
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
  const key = keyFor(
    envelope.chainId,
    envelope.executionAccount,
    envelope.accountNonce,
  );
  const location = path.join(directory, `${key}.jsonl`);
  let descriptor,
    state = "signing_started",
    poisoned = false;
  const binding = bindingForPackage(pkg);
  let expectedContent = JSON.stringify({ ...binding, state }) + "\n";
  try {
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
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      rotateRetiredAttempt(directory, key, binding);
      descriptor = fs.openSync(
        location,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_RDWR |
          fs.constants.O_APPEND |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
    }
    fs.writeFileSync(descriptor, expectedContent);
    fs.fsyncSync(descriptor);
    syncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    // Leave even a partial claim in place. Never retry signing after ambiguity.
    if (error.code?.startsWith("GENESIS_")) throw error;
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
  function transition(expected, next, receipt, diagnostic, resolution) {
    if (poisoned || descriptor === undefined || state !== expected)
      fail("GENESIS_ATTEMPT_TRANSITION_REJECTED");
    try {
      assertFileCurrent();
      const entry =
        JSON.stringify({
          state: next,
          ...(receipt ? { receipt } : {}),
          ...(diagnostic ? { diagnostic } : {}),
          ...(resolution ? { resolution } : {}),
        }) + "\n";
      fs.writeFileSync(descriptor, entry);
      fs.fsyncSync(descriptor);
      expectedContent += entry;
      state = next;
      if (["confirmed", "failed", "invalidated", "retired"].includes(next)) close();
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
    markSubmitted() {
      transition("submission_started", "submitted", {
        userOperationHash: binding.userOperationHash,
      });
    },
    markConfirmed(receipt) {
      if (
        !receipt ||
        !/^0x[0-9a-f]{64}$/.test(receipt.transactionHash) ||
        !/^0x[0-9a-f]{64}$/.test(receipt.blockHash) ||
        !/^[0-9]+$/.test(receipt.blockNumber) ||
        receipt.success !== true
      )
        fail("GENESIS_ATTEMPT_RECEIPT_INVALID");
      transition("submitted", "confirmed", {
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
      transition("submitted", "failed", {
        transactionHash: receipt.transactionHash, blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber, success: false,
        userOperationHash: receipt.userOperationHash,
        actualGasCost: receipt.actualGasCost, actualGasUsed: receipt.actualGasUsed,
      }, "confirmed_execution_revert");
    },
    fail() {
      if (["submission_started", "submitted"].includes(state)) {
        close();
        return;
      }
      if (descriptor !== undefined)
        transition(state, "retired", null, null, {
          reason: "definitely_not_submitted",
          userOperationHash: binding.userOperationHash,
        });
    },
    invalidate() {
      if (["submission_started", "submitted"].includes(state)) {
        close();
        return;
      }
      if (descriptor !== undefined)
        transition(state, "retired", null, null, {
          reason: "definitely_not_submitted",
          userOperationHash: binding.userOperationHash,
        });
    },
  });
}

module.exports = {
  claimGenesisExecutionAttempt,
  inspectGenesisExecutionAttempt,
  retireGenesisExecutionAttempt,
  bindingForPackage,
};
