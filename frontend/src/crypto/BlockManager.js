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
   * Mã hóa Block
   * Trả về: { cipherText (base64), iv (base64) }
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

  /**
   * Tính toán Hash Chain (Integrity)
   * Kết hợp dữ liệu block hiện tại với hash của block trước đó
   */
  async calculateBlockHash(blockData, drk) {
     const {
      blockId,
      index,
      version,
      cipherText,
      prevHash = "GENESIS_BLOCK_HASH"
    } = blockData;
    
    // Dẫn xuất một khóa chuyên biệt cho việc tính Integrity (tách biệt với khóa mã hóa)
    const hmacKey = await this._deriveKey(
      drk, INTEGRITY_KEY_LABEL, blockId, 
      ["sign"], { name: "HMAC", hash: "SHA-256" }
    );

    // Message bao gồm: Block ID + Version + Dữ liệu đã mã hóa + Mối liên kết tới block trước
    const message = stringToBuffer(`${blockId}|${index}|${version}|${cipherText}|${prevHash}`);
    const signature = await subtle.sign({ name: "HMAC" }, hmacKey, message);

    return encodeBuffer(signature);
  },

  /**
   *  Xác minh toàn bộ chuỗi
   */
  async verifyChain(blocks, drk) {
    // Gom block theo blockId
    const blockGroups = {};
    for (const block of blocks) {
      if (!blockGroups[block.blockId]) {
        blockGroups[block.blockId] = [];
      }
      blockGroups[block.blockId].push(block);
    }

     // Kiểm tra từng block
    for (const blockId in blockGroups) {
      const versions = blockGroups[blockId]
        .sort((a, b) => a.version - b.version);

      let lastHash = "GENESIS_BLOCK_HASH";

      for (const block of versions) {
        const expectedHash = await this.calculateBlockHash(
          { ...block, prevHash: lastHash },
          drk
        );

        if (block.hash !== expectedHash) {
          return {
            valid: false,
            corruptBlockId: block.blockId,
            corruptVersion: block.version
          };
        }
         lastHash = block.hash;
      }
    }
    return { valid: true };
  }
};

export default BlockCryptoModule;
