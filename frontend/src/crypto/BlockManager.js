const subtle = window.crypto.subtle;
import {
  stringToBuffer,
  bufferToString,
  encodeBuffer,
  decodeBuffer,
  getRandomBytes
} from "./lib";

const BLOCK_KEY_LABEL = "BLOCK_ENCRYPTION_KEY";
const INTEGRITY_KEY_LABEL = "BLOCK_INTEGRITY_KEY";

const BlockCryptoModule = {
  
  /**
   * Dẫn xuất khóa con từ Document Root Key (DRK)
   */
  async _deriveKey(drk, label, blockId, usages, algo) {
    // Nhập DRK vào format HMAC để dùng làm PRF
    const masterKey = await subtle.importKey(
      "raw", drk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    // Tạo thông tin ngữ cảnh: nhãn + blockId
    const context = stringToBuffer(`${label}|${blockId}`);
    const rawSubkey = await subtle.sign({ name: "HMAC" }, masterKey, context);

    return subtle.importKey("raw", rawSubkey, algo, false, usages);
  },

  /**
  Mã hóa Block
  Trả về: { cipherText (base64), iv (base64) }
  */
  async encryptBlock(plaintext, drk, blockId) {
    const aesKey = await this._deriveKey(
      drk, BLOCK_KEY_LABEL, blockId, 
      ["encrypt"], { name: "AES-GCM", length: 256 }
    );

    const iv = getRandomBytes(12); 
    const encrypted = await subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      stringToBuffer(plaintext)
    );

    return {
      cipherText: encodeBuffer(encrypted),
      iv: encodeBuffer(iv)
    };
  },

  /**
   * Giải mã Block
   */
  async decryptBlock(cipherTextBase64, ivBase64, drk, blockId) {
    try {
      const aesKey = await this._deriveKey(
        drk, BLOCK_KEY_LABEL, blockId, 
        ["decrypt"], { name: "AES-GCM", length: 256 }
      );

      const decrypted = await subtle.decrypt(
        { name: "AES-GCM", iv: decodeBuffer(ivBase64) },
        aesKey,
        decodeBuffer(cipherTextBase64)
      );

      return bufferToString(decrypted);
    } catch (e) {
      throw new Error(`Giải mã Block ${blockId} thất bại. Dữ liệu có thể bị sửa đổi.`);
    }
  },

  async calculateBlockHash(blockData, drk) {
     const {
      blockId,
      authorId,
      documentId,
      index,
      version,
      epoch,
      cipherText,
      prevHash = "GENESIS_BLOCK_HASH",
    } = blockData;
    
    const hmacKey = await this._deriveKey(
      drk, INTEGRITY_KEY_LABEL, blockId, 
      ["sign"], { name: "HMAC", hash: "SHA-256" }
    );

    const message = stringToBuffer(`${blockId}|${authorId}|${documentId}|${index}|${version}|${epoch}|${cipherText}|${prevHash}`);
    const signature = await subtle.sign({ name: "HMAC" }, hmacKey, message);

    return encodeBuffer(signature);
  },

  async verifyChain(blocks, drk) {
    if (!blocks || blocks.length === 0) return { valid: true };

    const sortedBlocks = [...blocks].sort((a, b) => a.index - b.index);

    let lastHash = "GENESIS_BLOCK_HASH";

    for (const block of sortedBlocks) {
      const expectedHash = await this.calculateBlockHash(
        { ...block, prevHash: lastHash },
        drk
      );

      if (block.hash !== expectedHash) {
        return {
          valid: false,
          corruptBlockId: block.blockId,
          corruptIndex: block.index,
          corruptVersion: block.version,
          corruptEpoch: block.epoch
        };
      }
      lastHash = block.hash;
    }
    return { valid: true };
  }
};

export default BlockCryptoModule;
