import {
  AbiCoder,
  Wallet,
  keccak256,
  toUtf8Bytes,
  getBytes,
  hexlify,
  scrypt,
} from "ethers";
import {
  deriveAccount,
  digest,
  canonicalJSON,
  isBuiltAuthorization,
} from "./protocol.mjs";
import { random, b64, unb64, encrypt, decrypt, exact } from "./bytes.mjs";

const abi = AbiCoder.defaultAbiCoder();
export function identityCommitment(secret) {
  if (
    !/^0x[0-9a-f]{64}$/.test(secret) ||
    BigInt(secret) === 0n ||
    BigInt(secret) >= 1n << 251n
  )
    throw Error("WEB_IDENTITY_INVALID");
  const root = keccak256(
    abi.encode(
      ["bytes32", "bytes32"],
      [keccak256(toUtf8Bytes("PHIL_IDENTITY_ROOT_V1")), secret],
    ),
  );
  return keccak256(
    abi.encode(
      ["bytes32", "bytes32"],
      [keccak256(toUtf8Bytes("PHIL_OWNER_COMMITMENT_CANONICAL_V1")), root],
    ),
  );
}
const roles = ["identity", "validator", "recovery"];
const kdf = Object.freeze({ name: "scrypt", N: 32768, r: 8, p: 1, length: 32 });
function validatePassphrase(passphrase) {
  if (
    typeof passphrase !== "string" ||
    passphrase.length < 16 ||
    passphrase.length > 1024
  )
    throw Error("WEB_BACKUP_PASSPHRASE");
}
async function backupKey(passphrase, salt) {
  validatePassphrase(passphrase);
  const password = toUtf8Bytes(passphrase);
  let raw;
  try {
    raw = getBytes(
      await scrypt(password, salt, kdf.N, kdf.r, kdf.p, kdf.length),
    );
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    password.fill(0);
    raw?.fill(0);
  }
}
export function createCustody({
  store,
  passkeys,
  config,
  assertCurrentRelease = async () => {},
}) {
  const configDigest = digest(config);
  let generation = 0,
    busy = false;
  const lock = () => {
    generation++;
    passkeys.cancel?.();
  };
  const valid = (version) => {
    if (version !== generation) throw Error("WEB_SESSION_CHANGED");
  };
  function headerFor(material, label) {
    const identity = {
      identityCommitment: identityCommitment(material.identity),
      owner: new Wallet(material.validator).address.toLowerCase(),
      recoveryAuthority: new Wallet(material.recovery).address.toLowerCase(),
    };
    const account = deriveAccount(config, identity, "DESKTOP_GENESIS").profile
      .account;
    return { label, ...identity, account, configDigest, mode: 1 };
  }
  function checkHeader(header) {
    exact(header, [
      "label",
      "identityCommitment",
      "owner",
      "recoveryAuthority",
      "account",
      "configDigest",
      "mode",
    ]);
    if (
      typeof header.label !== "string" ||
      !header.label.trim() ||
      header.label.length > 80 ||
      /[\u0000-\u001f]/.test(header.label) ||
      header.configDigest !== configDigest ||
      header.mode !== 1
    )
      throw Error("WEB_VAULT_BINDING");
    if (
      deriveAccount(config, header, "DESKTOP_GENESIS").profile.account !==
      header.account
    )
      throw Error("WEB_VAULT_BINDING");
  }
  function validateVault(v) {
    exact(v, [
      "format",
      "version",
      "origin",
      "header",
      "credential",
      "envelopes",
    ]);
    if (
      v.format !== "phil-web-vault" ||
      v.version !== 1 ||
      v.origin !== passkeys.origin
    )
      throw Error("WEB_VAULT_BINDING");
    checkHeader(v.header);
    exact(v.credential, ["id", "publicKey", "salt"]);
    unb64(v.credential.id);
    unb64(v.credential.publicKey);
    unb64(v.credential.salt, 32);
    if (
      !v.envelopes ||
      roles.some((r) => !v.envelopes[r]) ||
      Object.keys(v.envelopes).some((r) => ![...roles, "ready"].includes(r))
    )
      throw Error("WEB_STORAGE_INVALID");
    return v;
  }
  const binding = (v) => ({
    format: v.format,
    version: v.version,
    origin: v.origin,
    header: v.header,
    credential: v.credential,
  });
  const aad = (v, role) => ({ vault: binding(v), role });
  const validateMaterial = (material, header) => {
    exact(material, roles);
    if (
      canonicalJSON(headerFor(material, header.label)) !== canonicalJSON(header)
    )
      throw Error("WEB_BACKUP_BINDING");
  };
  async function exclusive(fn) {
    if (busy) throw Error("WEB_BUSY");
    busy = true;
    const version = generation;
    try {
      await assertCurrentRelease();
      valid(version);
      return await fn(() => valid(version));
    } finally {
      busy = false;
    }
  }
  async function publish(
    material,
    header,
    readyHash,
    check,
    enrollment = null,
  ) {
    checkHeader(header);
    validateMaterial(material, header);
    const { credential, key } =
      enrollment ?? (await passkeys.register(header.label));
    check();
    const v = {
      format: "phil-web-vault",
      version: 1,
      origin: passkeys.origin,
      header,
      credential,
      envelopes: {},
    };
    for (const role of roles)
      v.envelopes[role] = await encrypt(
        key,
        { secret: material[role] },
        aad(v, role),
      );
    if (readyHash)
      v.envelopes.ready = await encrypt(
        key,
        { backupHash: readyHash },
        aad(v, "ready"),
      );
    // Prove new wrapping before persisting the only copy of this vault.
    for (const role of roles) {
      const value = await decrypt(key, v.envelopes[role], aad(v, role));
      if (value.secret !== material[role]) throw Error("WEB_VAULT_ROUNDTRIP");
      value.secret = null;
    }
    check();
    await store.add("vault", v);
    return header;
  }
  async function read() {
    const v = await store.get("vault");
    return v ? validateVault(v) : null;
  }
  async function create(label) {
    return exclusive(async (check) => {
      if (await store.get("vault")) throw Error("WEB_VAULT_EXISTS");
      if (typeof label !== "string" || !label.trim() || label.length > 80)
        throw Error("WEB_LABEL");
      const enrollment = await passkeys.register(label.trim());
      check();
      const bytes = random(32);
      bytes[0] &= 7;
      if (bytes.every((x) => x === 0)) bytes[31] = 1;
      const material = {
        identity: hexlify(bytes),
        validator: Wallet.createRandom().privateKey,
        recovery: Wallet.createRandom().privateKey,
      };
      bytes.fill(0);
      try {
        return await publish(
          material,
          headerFor(material, label.trim()),
          null,
          check,
          enrollment,
        );
      } finally {
        for (const r of roles) material[r] = null;
      }
    });
  }
  async function openBackup(text, passphrase) {
    if (typeof text !== "string" || text.length > 100000)
      throw Error("WEB_BACKUP_INVALID");
    const backup = JSON.parse(text);
    exact(backup, ["format", "version", "header", "kdf", "salt", "encryption"]);
    if (
      backup.format !== "phil-web-backup" ||
      backup.version !== 1 ||
      canonicalJSON(backup.kdf) !== canonicalJSON(kdf)
    )
      throw Error("WEB_BACKUP_INVALID");
    checkHeader(backup.header);
    const key = await backupKey(passphrase, unb64(backup.salt, 16));
    const material = await decrypt(key, backup.encryption, {
      format: backup.format,
      version: 1,
      header: backup.header,
      kdf: backup.kdf,
      salt: backup.salt,
    });
    try {
      validateMaterial(material, backup.header);
      return { material, header: backup.header, backupHash: digest(backup) };
    } catch (error) {
      for (const role of roles) material[role] = null;
      throw error;
    }
  }
  async function exportBackup(passphrase) {
    validatePassphrase(passphrase);
    return exclusive(async (check) => {
      const v = await read();
      if (!v) throw Error("WEB_IDENTITY_REQUIRED");
      const key = await passkeys.authorize(v.credential, {
        action: "EXPORT_BACKUP",
        account: v.header.account,
      });
      check();
      const material = {};
      try {
        for (const r of roles)
          material[r] = (await decrypt(key, v.envelopes[r], aad(v, r))).secret;
        validateMaterial(material, v.header);
        const backup = {
          format: "phil-web-backup",
          version: 1,
          header: v.header,
          kdf,
          salt: b64(random(16)),
        };
        const recoveryKey = await backupKey(passphrase, unb64(backup.salt, 16));
        backup.encryption = await encrypt(recoveryKey, material, backup);
        check();
        return JSON.stringify(backup);
      } finally {
        for (const r of roles) material[r] = null;
      }
    });
  }
  async function verifyBackup(text, passphrase) {
    return exclusive(async (check) => {
      const v = await read();
      if (!v) throw Error("WEB_IDENTITY_REQUIRED");
      const { material, header, backupHash } = await openBackup(
        text,
        passphrase,
      );
      try {
        if (canonicalJSON(header) !== canonicalJSON(v.header))
          throw Error("WEB_BACKUP_BINDING");
        const key = await passkeys.authorize(v.credential, {
          action: "VERIFY_BACKUP",
          account: header.account,
          backupHash,
        });
        check();
        for (const r of roles)
          if (
            (await decrypt(key, v.envelopes[r], aad(v, r))).secret !==
            material[r]
          )
            throw Error("WEB_BACKUP_BINDING");
        v.envelopes.ready = await encrypt(key, { backupHash }, aad(v, "ready"));
        check();
        await store.change("vault", (current) => {
          if (digest(binding(validateVault(current))) !== digest(binding(v)))
            throw Error("WEB_VAULT_CHANGED");
          return v;
        });
        return true;
      } finally {
        for (const r of roles) material[r] = null;
      }
    });
  }
  async function restore(text, passphrase) {
    return exclusive(async (check) => {
      if (await store.get("vault"))
        throw Error("WEB_RESTORE_REQUIRES_FRESH_STORAGE");
      const { material, header, backupHash } = await openBackup(
        text,
        passphrase,
      );
      try {
        check();
        return await publish(material, header, backupHash, check);
      } finally {
        for (const r of roles) material[r] = null;
      }
    });
  }
  // The controller supplies an exact already-built package and a durable claim.
  async function signOnce(pkg, claim) {
    return exclusive(async (check) => {
      if (!isBuiltAuthorization(pkg)) throw Error("WEB_UNTRUSTED_PACKAGE");
      if (
        pkg.presentation.action !== "MINT_PHIL" &&
        pkg.presentation.action !== "TRANSFER_PHIL" &&
        pkg.presentation.action !== "WITHDRAW_ETH"
      )
        throw Error("WEB_ACTION_FORBIDDEN");
      if (pkg.profile.mode !== "DESKTOP_GENESIS" || pkg.profile.device !== null)
        throw Error("WEB_MODE_UNSUPPORTED");
      const v = await read();
      if (!v?.envelopes.ready) throw Error("WEB_BACKUP_REQUIRED");
      if (
        digest(pkg.profile) !==
        digest(deriveAccount(config, v.header, "DESKTOP_GENESIS").profile)
      )
        throw Error("WEB_VAULT_BINDING");
      const seal = digest(v),
        key = await passkeys.authorize(v.credential, {
          action: pkg.presentation.action,
          operationHash: pkg.userOperationHash,
          presentationDigest: pkg.presentationDigest,
        });
      check();
      if (digest(await read()) !== seal) throw Error("WEB_VAULT_CHANGED");
      const ready = await decrypt(key, v.envelopes.ready, aad(v, "ready"));
      if (!/^0x[0-9a-f]{64}$/.test(ready.backupHash))
        throw Error("WEB_BACKUP_REQUIRED");
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (
        now < BigInt(pkg.authorization.validAfter) ||
        now > BigInt(pkg.authorization.validUntil)
      )
        throw Error("GENESIS_EXPIRED");
      await assertCurrentRelease();
      check();
      await claim();
      check();
      const value = await decrypt(
        key,
        v.envelopes.validator,
        aad(v, "validator"),
      );
      let wallet;
      try {
        check();
        wallet = new Wallet(value.secret);
        if (wallet.address.toLowerCase() !== v.header.owner)
          throw Error("WEB_VAULT_BINDING");
        const signature = await wallet.signMessage(
          getBytes(pkg.userOperationHash),
        );
        check();
        return signature;
      } finally {
        value.secret = null;
        wallet = null;
      }
    });
  }
  return { create, read, exportBackup, verifyBackup, restore, signOnce, lock };
}
