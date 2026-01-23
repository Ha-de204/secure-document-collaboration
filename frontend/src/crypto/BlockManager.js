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
import { version } from "react";

const subtle = window.crypto.subtle;

const BLOCK_KEY_LABEL = "BLOCK_ENCRYPTION_KEY";
const INTEGRITY_KEY_LABEL = "BLOCK_INTEGRITY_KEY";

const BlockCryptoModule = {
  // sinh Document Root Key
  generateDRK() {
    return window.crypto.getRandomValues(new Uint8Array(32));
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
  const { blocks, keys } = payload.data;
  if (!blocks || blocks.length === 0) return { status: true };

  const sortedBlocks = [...blocks].sort((a, b) => a.version - b.version);

  const anchorBlock = lastestLocalBlock;
  let lastHash = anchorBlock ? anchorBlock.hash : "0";
  let lastVersion = anchorBlock ? anchorBlock.version : -1;
  var myPrivateKey = await getMyKey();

  const pubKeys = await this.vertifyPublicKey(keys, myPrivateKey, ownerPublicKey)
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
    const expectedHash = await this.calculateBlockHash(block, currentDRK);
    
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

    const isValidSignature = await verifyWithECDSA(
      ownerPublicKey,
      `${k.documentId}|${k.userId}|${k.epoch}|${k.encryptedDocKey}`, // Data gốc
      k.signature, // Chữ ký từ server
    );

    if (!isValidSignature) {
      console.error(`CẢNH BÁO: Khóa epoch ${k.epoch} bị giả mạo hoặc không rõ nguồn gốc!`);
      throw new Error("SECURITY_BREACH_DETECTED");
    }

    const rawDRK = await decryptRSA( myPrivateKey, k.encryptedDocKey);
    
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
