import CryptoJS from 'crypto-js';

export const SecurityProvider = {
  deriveKey: (password, salt) => {
    return CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: 1000
    }).toString();
  },
  
  // 1. Mã hóa nội dung
  encrypt: (plaintext, key) => {
    if (!plaintext) return "";
    return CryptoJS.AES.encrypt(plaintext, key).toString();
  },

  // 2. Giải mã nội dung
  decrypt: (ciphertext, key) => {
    try {
      if (!ciphertext) return "";
      const bytes = CryptoJS.AES.decrypt(ciphertext, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      console.error("Giải mã thất bại:", e);
      return "[Lỗi giải mã]";
    }
  },

  // 3. Tính HMAC cho Hash Chain 
  calculateHash: (blockData, key) => {
    const { blockId, index, version, cipherText, prevHash } = blockData;
    const message = `${blockId}|${index}|${version}|${cipherText}|${prevHash}`;
    return CryptoJS.HmacSHA256(message, key).toString();
  },

  verifyBlock: (block, prevBlock, key) => {
    if (!prevBlock && block.index === 0) return true; 
    if (block.prevHash !== prevBlock.hash) return false; 
    
    const calculated = SecurityProvider.calculateHash(block, key);
    return calculated === block.hash;
  }
};