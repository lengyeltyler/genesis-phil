'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ID = 'com.philcore.desktop';
const fail = () => { throw Error('PHIL_PRODUCTION_STORAGE_INVALID'); };
function privateDirectory(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const st = fs.lstatSync(directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() ||
      st.mode & 0o077 || fs.realpathSync(directory) !== directory) fail();
  return directory;
}
function inspectPrivateTree(directory) {
  for (const entry of fs.readdirSync(directory)) {
    const file=path.join(directory,entry),st=fs.lstatSync(file);
    if(st.isSymbolicLink()||st.uid!==process.getuid()||st.mode&0o077)fail();
    if(st.isDirectory())inspectPrivateTree(file);
    else if(!st.isFile()||st.nlink!==1)fail();
  }
}
function productionNamespace(app, metadata) {
  if (!app.isPackaged || metadata.bundleId !== ID || metadata.production !== true ||
      process.argv.some(x => /--(user-data-dir|remote-debugging|inspect|no-sandbox)/i.test(x)) ||
      Object.keys(process.env).some(k => /^(PHILCORE_|ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH)/.test(k))) fail();
  app.setName('Phil');
  const base = app.getPath('appData');
  if (fs.realpathSync(base) !== base) fail();
  const root = path.join(base, ID), existed = fs.existsSync(root);
  privateDirectory(root);
  const marker = path.join(root, 'production-namespace.json');
  const expected = JSON.stringify({ schema: 1, bundleId: ID, inheritance: false }) + '\n';
  if (!fs.existsSync(marker)) {
    if (existed && fs.readdirSync(root).length) fail();
    const fd = fs.openSync(marker, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.writeFileSync(fd, expected); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const dir = fs.openSync(root, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  const st = fs.lstatSync(marker);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.uid !== process.getuid() || st.mode & 0o077 || fs.readFileSync(marker, 'utf8') !== expected) fail();
  app.setPath('userData', root);
  app.setPath('sessionData', privateDirectory(path.join(root, 'Chromium')));
  app.setPath('logs', privateDirectory(path.join(root, 'Logs')));
  app.setPath('crashDumps', privateDirectory(path.join(root, 'Crashes')));
  for (const name of ['identities', 'accounts', 'attempts', 'providers']) inspectPrivateTree(privateDirectory(path.join(root, name)));
  return root;
}
module.exports = { productionNamespace, privateDirectory, inspectPrivateTree, ID };
