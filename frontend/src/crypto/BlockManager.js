import {
  stringToBuffer,
  bufferToString,
  encodeBuffer,
  decodeBuffer,
  getRandomBytes
} from "./lib";
const subtle = window.crypto.subtle;

const BLOCK_KEY_LABEL = "BLOCK_ENCRYPTION_KEY";
const INTEGRITY_KEY_LABEL = "BLOCK_INTEGRITY_KEY";

const BlockCryptoModule = {
  // sinh Document Root Key
  generateDRK() {
    return window.crypto.getRandomValues(new Uint8Array(32));
  },

  /**
   * Mã hóa dữ liệu bằng Public Key (RSA-OAEP)
   * @param {string} data - Dữ liệu thô cần mã hóa (rawDRK)
   */

   async encryptWithPublicKey(recipientPublicKeyBase64, data) {
    try {
      const recipientPubKeyBuf = decodeBuffer(recipientPublicKeyBase64);
      
      // 1. Import khóa công khai của người nhận
      const recipientKey = await subtle.importKey(
        "spki", recipientPubKeyBuf,
        { name: "ECDH", namedCurve: "P-256" },
        false, []
      );

      // 2. Tạo cặp khóa tạm thời (ephemeral key) của người gửi
      const ephemeralKeyPair = await subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true, ["deriveKey"]
      );

      // 3. Thỏa thuận khóa (Derive Shared Secret)
      const sharedSecret = await subtle.deriveKey(
        { name: "ECDH", public: recipientKey },
        ephemeralKeyPair.privateKey,
        { name: "AES-GCM", length: 256 },
        false, ["encrypt"]
      );

      // 4. Mã hóa DRK bằng sharedSecret
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedDRK = await subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedSecret,
        new TextEncoder().encode(data)
      );

      // 5. Xuất Ephemeral Public Key để người nhận có thể giải mã sau này
      const ephemeralPubKeyBuf = await subtle.exportKey("spki", ephemeralKeyPair.publicKey);

      // Trả về gói: EphemeralPubKey + IV + CipherText
      return JSON.stringify({
        ephemeralPubKey: encodeBuffer(ephemeralPubKeyBuf),
        iv: encodeBuffer(iv),
        cipherText: encodeBuffer(encryptedDRK)
      });
    } catch (error) {
      console.error("Lỗi ECIES:", error);
      throw error;
    }
  },

 /**
 * Ký dữ liệu bằng Private Key (ECDSA)
 * @param {string} dataToSign - Dữ liệu cần ký
 * @param {CryptoKey} privateKey - Khóa private đã được unlock (window.myPrivateKey)
 */
  async signData(dataToSign, privateKey) {
    try {
      // 1. Kiểm tra nếu privateKey chưa được truyền vào hoặc sai định dạng
      const key = privateKey || window.myPrivateKey;
      if (!key) {
        throw new Error("Private Key không khả dụng. Vui lòng unlock identity.");
      }

      // 2. Encode dữ liệu
      const encoder = new TextEncoder();
      const dataBuffer =typeof dataToSign === 'string' ? encoder.encode(dataToSign) : dataToSign;

      // 3. Thực hiện ký với thuật toán ECDSA (Tương thích với P-256 trong IdentityManager)
      const signatureBuffer = await window.crypto.subtle.sign(
        {
          name: "ECDSA",
          hash: { name: "SHA-256" },
        },
        key,
        dataBuffer
      );

      // 4. Trả về Base64
      return encodeBuffer(signatureBuffer);
    } catch (error) {
      console.error("Lỗi khi ký dữ liệu ECDSA:", error);
      throw error;
    }
  },
  
  /**
   * Dẫn xuất khóa con từ Document Root Key (DRK)
   */
  async _deriveKey(drk, label, blockId, usages, algo) {
    const masterKey = await subtle.importKey(
      "raw", drk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const context = stringToBuffer(`${label}|${blockId}`);
    const rawSubkey = await subtle.sign({ name: "HMAC" }, masterKey, context);

    return subtle.importKey("raw", rawSubkey, algo, false, usages);
  },

  /**
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
