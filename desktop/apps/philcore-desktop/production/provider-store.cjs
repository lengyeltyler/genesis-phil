'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
function validateKeys(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join('|') !== 'alchemy|infura' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(value.alchemy) ||
      !/^[a-fA-F0-9]{32}$/.test(value.infura)) throw Error('GENESIS_PROVIDER_CONFIGURATION');
  return { alchemy: value.alchemy, infura: value.infura };
}
function createProviderStore(directory, safeStorage) {
  const location = path.join(directory, 'credentials.enc');
  function read() {
    if (!fs.existsSync(location)) return null;
    const st = fs.lstatSync(location);
    if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.uid !== process.getuid() || st.mode & 0o077 || st.size > 4096 || !safeStorage.isEncryptionAvailable()) throw Error('GENESIS_PROVIDER_CONFIGURATION');
    try { return validateKeys(JSON.parse(safeStorage.decryptString(fs.readFileSync(location)))); }
    catch { throw Error('GENESIS_PROVIDER_CONFIGURATION'); }
  }
  function save(input) {
    const keys = validateKeys(input);
    if (!safeStorage.isEncryptionAvailable()) throw Error('GENESIS_KEYCHAIN_UNAVAILABLE');
    const temporary = path.join(directory, randomBytes(16).toString('hex') + '.tmp');
    const fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, safeStorage.encryptString(JSON.stringify(keys))); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, location);
    const dir = fs.openSync(directory, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    return { configured: true, primary: 'Alchemy', independent: 'Infura', bundler: 'Alchemy' };
  }
  function configuration() {
    const keys = read(); if (!keys) return Object.freeze({primaryRpcUrl:'https://eth.drpc.org',independentRpcUrl:'https://ethereum.publicnode.com',bundlerRpcUrl:'https://api.candide.dev/public/v3/1',bundlerKind:'public-candide',bundlerQualified:true});
    return Object.freeze({ primaryRpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/' + keys.alchemy,
      bundlerRpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/' + keys.alchemy,
      independentRpcUrl: 'https://mainnet.infura.io/v3/' + keys.infura, bundlerKind: 'alchemy',bundlerQualified:true });
  }
  return Object.freeze({ save, configuration, status: () => read()?({configured:true,userSupplied:true,primary:'Alchemy',independent:'Infura',bundler:'Alchemy',bundlerQualified:true}):({configured:true,userSupplied:false,primary:'dRPC public',independent:'PublicNode public',bundler:'Candide public',bundlerQualified:true}) });
}
module.exports = { createProviderStore, validateKeys };
