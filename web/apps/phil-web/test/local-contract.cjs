// Dedicated local chain-ID-1 EVM. Never forks or contacts an HTTP provider.
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  hre = require("hardhat");
(async () => {
  if (hre.network.name !== "hardhat" || hre.network.config.forking)
    throw Error("LOCAL_ONLY");
  const e = hre.ethers;
  if ((await e.provider.getNetwork()).chainId !== 1n)
    throw Error("LOCAL_DOMAIN");
  const [
    { openStore },
    { createCustody },
    { deriveAccount, buildAuthorization },
    { IDBFactory },
    { b64, random },
  ] = await Promise.all([
    import("../src/storage.mjs"),
    import("../src/custody.mjs"),
    import("../src/protocol.mjs"),
    import("fake-indexeddb"),
    import("../src/bytes.mjs"),
  ]);
  const [deployer, recovery, recipient] = await e.getSigners(),
    blob = await fs.readFile("genesis/optimization/.generated/catalog.bin"),
    manifest = JSON.parse(
      await fs.readFile(
        "genesis/optimization/evidence/optimized-manifest.json",
      ),
    ),
    pages = [];
  for (let i = 0; i < Math.ceil(blob.length / 24000); i++) {
    const address = e.getCreateAddress({
      from: deployer.address,
      nonce: 2000 + i,
    });
    pages.push(address);
    await e.provider.send("hardhat_setCode", [
      address,
      "0x00" + blob.subarray(i * 24000, (i + 1) * 24000).toString("hex"),
    ]);
  }
  const ep = await (await e.getContractFactory("EntryPoint")).deploy();
  await ep.waitForDeployment();
  const boot = await require("../../../genesis/withdrawals/local-deploy.cjs")(
    hre,
    {
      pages,
      length: blob.length,
      commitment: manifest.runtimeCommitment,
      ep: await ep.getAddress(),
      royalty: recipient.address,
      earlyWallets: [recovery.address, recipient.address],
    },
  );
  const nft = await e.getContractAt("PhilGenesisNFT", await boot.nft()),
    factory = await e.getContractAt(
      "PhilGenesisAccountFactoryV1",
      await boot.factory(),
    );
  const config = {
    ...require("../../philcore-desktop/production/candidate-public-config.json"),
    entryPoint: (await ep.getAddress()).toLowerCase(),
    genesis: (await nft.getAddress()).toLowerCase(),
    factory: (await factory.getAddress()).toLowerCase(),
  };
  for (const name of ["entryPoint", "genesis", "factory"])
    config[name + "CodeHash"] = e.keccak256(
      await e.provider.getCode(config[name]),
    );
  const accountArtifact = await hre.artifacts.readArtifact(
    "PhilGenesisAccountV1",
  );
  assert.equal(accountArtifact.bytecode, config.accountCreationCode);
  assert.equal(accountArtifact.deployedBytecode, config.accountRuntimeTemplate);
  const store = await openStore(new IDBFactory()),
    key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  const custody = createCustody({
    store,
    config,
    passkeys: {
      origin: "https://phil.tylerlengyel.com",
      register: async () => ({
        key,
        credential: {
          id: b64(random(32)),
          publicKey: b64(random(91)),
          salt: b64(random(32)),
        },
      }),
      authorize: async () => key,
    },
  });
  const header = await custody.create("LOCAL SYNTHETIC WEB TEST"),
    password = "local test backup passphrase only",
    backup = await custody.exportBackup(password);
  await custody.verifyBackup(backup, password);
  const { profile, creation } = deriveAccount(
    config,
    header,
    "DESKTOP_GENESIS",
  );
  assert.equal(
    (
      await factory.getFunction("getAddress")(
        header.owner,
        header.recoveryAuthority,
        header.identityCommitment,
        1,
      )
    ).toLowerCase(),
    header.account,
  );
  await e.provider.send("hardhat_setBalance", [
    header.account,
    "0xde0b6b3a7640000",
  ]);
  await e.provider.send("evm_setNextBlockTimestamp", [
    Math.max(1789616161, (await e.provider.getBlock("latest")).timestamp + 1),
  ]);
  await e.provider.send("evm_mine", []);
  async function build(action, tokenId, nameId, nonce, create) {
    const now = Math.floor(Date.now() / 1000);
    return buildAuthorization(
      profile,
      {
        action,
        tokenId,
        ...(nameId ? { nameId } : {}),
        recipient:
          action === "MINT_PHIL"
            ? header.account
            : recipient.address.toLowerCase(),
        nonce: String(nonce),
        authorizationId: e.hexlify(e.randomBytes(32)),
        philNonce: e.hexlify(e.randomBytes(32)),
        validAfter: String(now - 10),
        validUntil: String(now + 300),
        callGasLimit: "600000",
        verificationGasLimit: "3000000",
        preVerificationGas: "100000",
        maxFeePerGas: "2000000000",
        maxPriorityFeePerGas: "1000000",
      },
      create ? creation : null,
    );
  }
  const pkg = await build("MINT_PHIL", "987654321", "8000", 0, true);
  assert.equal(await ep.getUserOpHash(pkg.op), pkg.userOperationHash);
  let claims = 0;
  const signature = await custody.signOnce(pkg, async () => {
    claims++;
  });
  assert.equal(claims, 1);
  const op = { ...pkg.op, signature };
  const changed = { ...op, callData: op.callData.slice(0, -2) + "00" };
  await assert.rejects(
    ep.handleOps([changed], deployer.address, { gasLimit: 6000000 }),
  );
  const receipt = await (
    await ep.handleOps([op], deployer.address, { gasLimit: 6000000 })
  ).wait();
  const event = (r) =>
    r.logs
      .map((log) => {
        try {
          return ep.interface.parseLog(log);
        } catch {}
      })
      .find((log) => log?.name === "UserOperationEvent");
  assert.equal(event(receipt).args.success, true);
  assert.equal((await nft.ownerOf(0)).toLowerCase(), header.account);
  assert.equal(await nft.recipeIdOf(0), 987654321n);
  assert.equal(await nft.hasMinted(header.account), true);
  assert.equal(
    e.keccak256(await e.provider.getCode(header.account)),
    profile.accountCodeHash,
  );
  await assert.rejects(
    ep.handleOps([op], deployer.address, { gasLimit: 6000000 }),
  );
  const twice = await build("MINT_PHIL", "987654322", "8001", 1, false),
    twiceSig = await custody.signOnce(twice, async () => {});
  const twiceReceipt = await (
    await ep.handleOps(
      [{ ...twice.op, signature: twiceSig }],
      deployer.address,
      { gasLimit: 6000000 },
    )
  ).wait();
  assert.equal(event(twiceReceipt).args.success, false);
  assert.equal(await nft.totalMinted(), 1n);
  const transfer = await build("TRANSFER_PHIL", "0", undefined, 2, false),
    transferSig = await custody.signOnce(transfer, async () => {});
  const transferReceipt = await (
    await ep.handleOps(
      [{ ...transfer.op, signature: transferSig }],
      deployer.address,
      { gasLimit: 6000000 },
    )
  ).wait();
  assert.equal(event(transferReceipt).args.success, true);
  assert.equal(await nft.ownerOf(0), recipient.address);
  const expected = require("../../../genesis/production/art.cjs")
    .createArtReader({ catalog: blob, manifest })
    .render(987654321n, 8000n);
  assert.equal(await nft.render(0, { gasLimit: 16000000 }), expected.svg);
  store.close();
  console.log(
    JSON.stringify({
      scope:
        "local EVM chain ID 1; synthetic passkey adapter; no public submission",
      browserVaultSignatureAccepted: true,
      counterfactualDeployment: true,
      mint: true,
      transfer: true,
      recipeSubstitutionRejected: true,
      replayRejected: true,
      secondMintFailed: true,
      artMatchesOnchain: true,
      mintGas: String(receipt.gasUsed),
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
