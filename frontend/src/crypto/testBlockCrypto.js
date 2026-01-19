import BlockCryptoModule from "./BlockManager";

function log(title, result) {
  console.log(`\n===== ${title} =====`);
  console.log(result);
}

export async function runAllTests() {
  const drk = crypto.getRandomValues(new Uint8Array(32));

  /* =======================
     TEST 1: Normal Flow
     ======================= */
  let prevHash = "GENESIS_BLOCK_HASH";
  const blocks = [];

  for (let v = 1; v <= 3; v++) {
    const { cipherText, iv } =
      await BlockCryptoModule.encryptBlock(
        `Hello version ${v}`,
        drk,
        "blockA"
      );

    const hash = await BlockCryptoModule.calculateBlockHash({
      blockId: "blockA",
      version: v,
      cipherText,
      prevHash
    }, drk);

    blocks.push({
      blockId: "blockA",
      version: v,
      cipherText,
      iv,
      hash
    });

    prevHash = hash;
  }

  log("TEST 1 – NORMAL", await BlockCryptoModule.verifyChain(blocks, drk));

  /* =======================
     TEST 2: Cipher Tamper
     ======================= */
  blocks[0].cipherText =
    blocks[0].cipherText.slice(0, -4) + "AAAA";

  log("TEST 2 – CIPHER TAMPER",
    await BlockCryptoModule.verifyChain(blocks, drk)
  );
}
