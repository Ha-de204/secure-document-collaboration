import { getDB } from "../storage/indexDbService";
import { getMyKey, saveMyKey } from "../services/IdentityKy";

const subtle = window.crypto.subtle;

const bufferToBase64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const base64ToBuffer = (b64) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function deriveMasterKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function initIdentity(userName, password) {
  const existing = await getMyKey();
  if (existing)  return existing.publicKey;

  // 1. Generate Identity Key
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  const pubBuf = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privBuf = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  const masterKey = await deriveMasterKey(password, userName);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedPriv = await subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    privBuf
  );

  // 2. Store local 
  await saveMyKey({
    userName,
    publicKey: bufferToBase64(pubBuf),
    encryptedPrivateKey: bufferToBase64(encryptedPriv),
    iv: bufferToBase64(iv)
  });

  return bufferToBase64(pubBuf);
}

export async function unlockIdentity(userName, password) {
  const record = await getMyKey();
  if (!record) throw new Error("Identity not found");

  const masterKey = await deriveMasterKey(password, userName);

  const decrypted = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBuffer(record.iv)
    },
    masterKey,
    base64ToBuffer(record.encryptedPrivateKey)
  );

  return subtle.importKey(
    "pkcs8",
    decrypted,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );
}
