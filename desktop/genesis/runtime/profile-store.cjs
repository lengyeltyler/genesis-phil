"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { validateProfile } = require("./authorization.cjs");
// One active account binding per existing Phil Identity. It does not generate an
// identity, key, recovery wallet, or second account. Conflicts require owner review.
function bindIdentityAccount(directory, profile) {
  validateProfile(profile);
  if (!path.isAbsolute(directory)) throw Error("GENESIS_PROFILE_DIRECTORY");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    fs.realpathSync(directory) !== path.resolve(directory)
  )
    throw Error("GENESIS_PROFILE_DIRECTORY");
  const location = path.join(
      directory,
      profile.identityCommitment.slice(2) + ".json",
    ),
    text = JSON.stringify(profile) + "\n";
  if (fs.existsSync(location)) {
    const st = fs.lstatSync(location);
    if (
      st.isSymbolicLink() ||
      !st.isFile() ||
      st.nlink !== 1 ||
      st.mode & 0o077
    )
      throw Error("GENESIS_PROFILE_FILE");
    const existing = JSON.parse(fs.readFileSync(location, "utf8"));
    validateProfile(existing);
    if (
      [
        "identityCommitment",
        "account",
        "factory",
        "entryPoint",
        "chainId",
        "genesis",
        "accountCodeHash",
        "factoryCodeHash",
        "entryPointCodeHash",
        "genesisCodeHash",
        "rendererCodeHash",
        "catalogCommitment",
        "mode",
      ].some((k) => existing[k] !== profile[k])
    )
      throw Error("GENESIS_ACCOUNT_MODEL_REVIEW_REQUIRED");
    return Object.freeze(JSON.parse(text));
  }
  let fd;
  try {
    fd = fs.openSync(
      location,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
    const dir = fs.openSync(directory, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(dir);
    } finally {
      fs.closeSync(dir);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return Object.freeze(JSON.parse(text));
}
module.exports = { bindIdentityAccount };
