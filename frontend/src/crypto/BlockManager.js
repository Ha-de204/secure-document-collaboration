import {
  stringToBuffer,
  bufferToString,
  encodeBuffer,
  decodeBuffer,
  getRandomBytes
} from "./lib";
import {
  getLatestVersion,
  createBlockVersionLocal
} from "../services/BlockService";
import{
  getMyKey
} from '../services/IdentityKy';
import  DocumentKeyService  from '../services/DRKService';
import{
  genRandomSalt, // sinh salt
  cryptoKeyToJSON, 
  generateEG, // sinh khoa eg cho double ratchet
  computeDH, // tinh dh 
  verifyWithECDSA, // xac thuc bang khoa identity
  HMACtoAESKey, // doubleratchet
  HMACtoHMACKey, /// double ratchet
  HKDF, // dan xuat khoa root va chian key (double ratchet)
  encryptWithGCM, // ma hoa aes-gcm
  decryptWithGCM, // giai ma
  generateECDSA, // sinh khoa identity
  signWithECDSA, // ki bang khoa identity
  encryptRSA,
  decryptRSA,
  generateRSA
} from './lib2';
import { initIdentity, unlockIdentity } from "../crypto/IdentityManager";
const subtle = window.crypto.subtle;

const BLOCK_KEY_LABEL = "BLOCK_ENCRYPTION_KEY";
const INTEGRITY_KEY_LABEL = "BLOCK_INTEGRITY_KEY";

const BlockCryptoModule = {
  // sinh Document Root Key
  generateDRK() {
    return window.crypto.getRandomValues(new Uint8Array(32));
  },

  /**
   * Mã hóa dữ liệu bằng Public Key 
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

      const dataToEncrypt = (typeof data === 'string') 
        ? new TextEncoder().encode(data) 
        : data;

      const encryptedDRK = await subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedSecret,
        dataToEncrypt
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
   * Giải mã dữ liệu (DRK) bằng Private Key của mình (Sử dụng ECIES/ECDH)
   * @param {CryptoKey} privateKeyRaw - Khóa private đã unlock (window.myPrivateKey)
   * @param {string} encryptedDataJson - Chuỗi JSON chứa {ephemeralPubKey, iv, cipherText}
   */
  async decryptWithPrivateKey(privateKeyRaw, encryptedDataJson) {
    try {
      let keyBuffer;

      console.log("Dữ liệu nhận được tại decryptWithPrivateKey:", privateKeyRaw);

      if (typeof privateKeyRaw === 'object' && privateKeyRaw.privateKey) {
          // Trường hợp nhận được Object {publicKey: "...", privateKey: "..."}
          // Ta lấy trường privateKey và giải mã Base64 sang Buffer
          keyBuffer = decodeBuffer(privateKeyRaw.privateKey);
      } else if (typeof privateKeyRaw === 'string') {
          // Trường hợp chỉ nhận được chuỗi Base64 của private key
          keyBuffer = decodeBuffer(privateKeyRaw);
      } else if (privateKeyRaw instanceof ArrayBuffer || privateKeyRaw instanceof Uint8Array) {
          // Trường hợp đã là Buffer
          keyBuffer = privateKeyRaw;
      } else {
          throw new Error("Định dạng privateKey không xác định hoặc bị thiếu.");
      }

      const { ephemeralPubKey, iv, cipherText } = JSON.parse(encryptedDataJson);

      const myPrivateKey = await subtle.importKey(
        "pkcs8", 
        keyBuffer, 
        { name: "ECDH", namedCurve: "P-256" },
        false, 
        ["deriveKey"]
      );
        
      // 1. Import Ephemeral Public Key từ người gửi
      const senderPubKeyBuf = decodeBuffer(ephemeralPubKey);

      const senderPublicKey = await subtle.importKey(
        "spki", senderPubKeyBuf,
        { name: "ECDH", namedCurve: "P-256" },
        false, []
      );

      // 2. Thỏa thuận khóa (Derive Shared Secret) bằng Private Key của mình và Public Key tạm thời
      const sharedSecret = await subtle.deriveKey(
        { name: "ECDH", public: senderPublicKey },
        myPrivateKey, 
        { name: "AES-GCM", length: 256 },
        false, ["decrypt"]
      );

      // 3. Giải mã dữ liệu bằng sharedSecret
      const decryptedBuffer = await subtle.decrypt(
        { name: "AES-GCM", iv: decodeBuffer(iv) },
        sharedSecret,
        decodeBuffer(cipherText)
      );

      // 4. Chuyển buffer về dạng thô (Uint8Array 32 bytes) hoặc String tùy cách bạn dùng
      // Vì generateDRK tạo ra Uint8Array(32), ta nên trả về Uint8Array
      return new Uint8Array(decryptedBuffer);
    } catch (error) {
      console.error("Lỗi giải mã bằng Private Key:", error);
      throw new Error("Không thể giải mã khóa tài liệu. Có thể mật khẩu ví sai hoặc khóa bị hỏng.");
    }
  },

 /**
 * Ký dữ liệu bằng Private Key (ECDSA)
 * @param {string} data - Dữ liệu cần ký
 * @param {CryptoKey} privateKeyBase64 - Khóa private đã được unlock (window.myPrivateKey)
 */
  async signData(data, privateKeyBase64) {
    try {
      const privBuf = decodeBuffer(privateKeyBase64);
      
      // Import khóa với thuật toán ECDSA
      const privateKey = await subtle.importKey(
        "pkcs8",
        privBuf,
        {
          name: "ECDSA",
          namedCurve: "P-256",
        },
        false,
        ["sign"]
      );

      // Thực hiện ký
      const signature = await subtle.sign(
        {
          name: "ECDSA",
          hash: { name: "SHA-256" }, 
        },
        privateKey,
        typeof data === 'string' ? stringToBuffer(data) : data
      );

      return encodeBuffer(signature);
    } catch (error) {
      console.error("Lỗi khi ký dữ liệu ECDSA:", error);
      throw error;
    }
  },

  async importPublicKey(publicKeyBase64) {
    try {
      const pubBuf = decodeBuffer(publicKeyBase64);
      return await subtle.importKey(
        "spki", 
        pubBuf,
        {
          name: "ECDSA",
          namedCurve: "P-256",
        },
        true, 
        ["verify"] 
      );
    } catch (error) {
      console.error("Lỗi khi import Public Key:", error);
      throw error;
    }
  },

  /* Ham xác thực chữ ký số */
  async verifySignature(data, signatureBase64, publicKey) {
    try {
      const signatureBuf = decodeBuffer(signatureBase64);
      const dataBuf = typeof data === 'string' ? stringToBuffer(data) : data;
      
      let cryptoPublicKey = publicKey;
      if (typeof publicKey === 'string') {
        cryptoPublicKey = await this.importPublicKey(publicKey);
      }

      const isValid = await subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        cryptoPublicKey,
        signatureBuf,
        dataBuf
      );
      return isValid;
    } catch (e) {
      console.error("Xác thực chữ ký thất bại:", e);
      return false;
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

    const iv = crypto.getRandomValues(new Uint8Array(12));
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
      prevHash = "0",
    } = blockData;
    const getIdString = (val) => {
    if (typeof val === 'object' && val !== null) {
      return val._id ? String(val._id) : String(val);
    }
    return String(val);
  };
  
    //Chuẩn hóa tất cả các ID
    const blockIdStr = getIdString(blockId);
    const authorIdStr = getIdString(authorId);
    const docIdStr = getIdString(documentId);
    
    const hmacKey = await this._deriveKey(
      drk, INTEGRITY_KEY_LABEL, blockIdStr, 
      ["sign"], { name: "HMAC", hash: "SHA-256" }
    );

    const message = stringToBuffer(`${blockIdStr}|${authorIdStr}|${docIdStr}|${index}|${version}|${epoch}|${cipherText}|${prevHash}`);
    console.log("DEBUG MESSAGE STRING:", message);
    const signature = await subtle.sign({ name: "HMAC" }, hmacKey, message);
    console.log("STRING_TO_HASH:", message);
    console.log("key: ", drk)
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
  },

  async vertifyBlock(block,drk){
    // lay block moi nhat trong local
    
    const lastBlock = await getLatestVersion(block.blockId)
    if(lastBlock.version >= block.version){
      return {
        status: false,
        error: 'OLD_VERSION_BLOCK'
      }
    }
    // tinh toan lai hash de doi chieu
    const expectedHash = await this.calculateBlockHash(block, drk);
    const isValid = (block.hash === expectedHash);
    if(!isValid){
      return {
        status: false,
        error: 'CORRUPT_BLOCK'
      }
    }
    return {
      status: true,
      data: block
    }
  },
  
  // vertify 1 dai version cua 1 block vs chung blockId
  async verifyBatchBlocks(payload,lastestLocalBlock, ownerPublicKey) {
  const userName = localStorage.getItem('userName');
  const { blocks, keys } = payload.data;
  if (!blocks || blocks.length === 0) return { status: true };

  const sortedBlocks = [...blocks].sort((a, b) => a.version - b.version);

  const anchorBlock = lastestLocalBlock;
  let lastHash = anchorBlock ? anchorBlock.hash : "0";
  let lastVersion = anchorBlock ? anchorBlock.version : -1;
  var myPrivateKey = await getMyKey(userName);

  const pubKeys = await this.vertifyPublicKey(keys, myPrivateKey.encryptedPrivateKey, ownerPublicKey)
  const verifiedData = [];
  
  for (const block of sortedBlocks) {
    if (block.version <= lastVersion) continue; 

    if (block.prevHash !== lastHash) {
      return { 
        status: false, 
        error: 'CHAIN_BROKEN', 
        details: `V${block.version} yêu cầu prevHash ${block.prevHash} nhưng bản trước đó có hash ${lastHash}`
      };
    }

    const currentDRK = pubKeys.get(block.epoch);

    
    const expectedHash = await this.calculateBlockHash({
      blockId: block.blockId,
      documentId: block.documentId,
      authorId: block.authorId,
      index: block.index,
      version: block.version,
      epoch: block.epoch,
      cipherText: block.cipherText,
      prevHash: block.prevHash
    }, currentDRK);
    
    if (block.hash !== expectedHash) {
      return { status: false, error: 'HASH_MISMATCH', version: block.version };
    }
    //luu va indexdb
    await createBlockVersionLocal({
        blockId: block.blockId,
        documentId: block.documentId,
        index: block.index,
        version: block.version,
        epoch: block.epoch,
        cipherText: block.cipherText,
        prevHash: block.prevHash,
        hash: block.hash
      })
    lastHash = block.hash;
    lastVersion = block.version;
    verifiedData.push(block);
  }
  
  return { status: true, data: verifiedData };
},

async  vertifyPublicKey(serverKeys, myPrivateKey, ownerPublicKey) {
  const keyMap = new Map();

  for (const k of serverKeys) {

    const isValidSignature = await BlockCryptoModule.verifySignature(
      `doc:${k.documentId}|epoch:${k.epoch}|drk:${k.encryptedDocKey}`, // Data gốc
      k.signature, // Chữ ký từ server
      ownerPublicKey
    );

    if (!isValidSignature) {
      console.error(`CẢNH BÁO: Khóa epoch ${k.epoch} bị giả mạo hoặc không rõ nguồn gốc!`);
      throw new Error("SECURITY_BREACH_DETECTED");
    }
     const rawPrivateKey = window.myPrivateKey
    const rawDRK = await this.decryptWithPrivateKey( rawPrivateKey, k.encryptedDocKey);
    
    keyMap.set(k.epoch, rawDRK);
    // luu vao indexdb
    await DocumentKeyService.saveDRK({
      documentId: k.documentId,
      epoch: k.epoch,
      encryptedDRK: k.encryptedDocKey,
      signedBy: k.userId,
      signature: k.signature,
      createAt: k.createAt
    })
  }
  
  return keyMap;
}
};


  
export default BlockCryptoModule;
