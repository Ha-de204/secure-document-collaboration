import IdentityManager from "./KeyManager";

const subtle = window.crypto.subtle;

function concatBuffers(...buffers) {
  let total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  let out = new Uint8Array(total);
  let offset = 0;
  for (let b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

/* HKDF */

async function hkdf(ikm, salt, info, length = 32) {
  const ikmKey = await subtle.importKey(
    "raw",
    ikm,
    "HKDF",
    false,
    ["deriveBits"]
  );

  return subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info
    },
    ikmKey,
    length * 8
  );
}

/* AES-GCM */

async function encryptAES(keyBytes, plaintext) {
  const key = await subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  return {
    iv: bufToBase64(iv),
    data: bufToBase64(ciphertext)
  };
}


const X3DHManager = {
  /**
   * Invite user to document
   * @param {string} remoteUserId
   * @param {Object} remoteBundle 
   * @param {ArrayBuffer} documentRootKey
   */
  async createInvite(remoteUserId, remoteBundle, documentRootKey) {

    /* --- Load local keys --- */
    const IK_priv = await IdentityManager.loadKey("IK_priv");
    if (!IK_priv) throw new Error("Missing IK_priv");

    const SPK_priv = await IdentityManager.getSPKPrivate();

    /* --- Import remote keys --- */
    // xác thực
    const remoteIK_verify = await subtle.importKey(
      "spki",
      base64ToBuf(remoteBundle.identityKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  
    // dùng cho DH
    const remoteIK_ecdh = await subtle.importKey(
      "spki",
      base64ToBuf(remoteBundle.identityKey),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

     /* Import remote Signed PreKey */

    const remoteSPK = await subtle.importKey(
      "spki",
      base64ToBuf(remoteBundle.signedPreKey),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    const spkRaw = await subtle.exportKey("raw", remoteSPK);

    const ok = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      remoteIK_verify,
      base64ToBuf(remoteBundle.signature),
      spkRaw
    );

    if (!ok) throw new Error("Signed PreKey verification failed");

    /* --- DH computations --- */
    const dh1 = await subtle.deriveBits(
      { name: "ECDH", public: remoteSPK },
      IK_priv,
      256
    );

    const dh2 = await subtle.deriveBits(
      { name: "ECDH", public: remoteIK_ecdh },
      SPK_priv,
      256
    );

    const dh3 = await subtle.deriveBits(
      { name: "ECDH", public: remoteSPK },
      SPK_priv,
      256
    );

    const ikm = concatBuffers(dh1, dh2, dh3);

    /* --- Derive Root Key --- */
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const info = new TextEncoder().encode("SecureDoc-X3DH");

    const rootKey = await hkdf(ikm, salt, info, 32);

    /* --- Encrypt DRK --- */
    const encryptedDRK = await encryptAES(rootKey, documentRootKey);

    return {
      to: remoteUserId,  
      encryptedDRK,
      salt: bufToBase64(salt),
      info: bufToBase64(info)
    };
  }
};

export default X3DHManager;
