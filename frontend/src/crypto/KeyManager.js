const subtle = window.crypto.subtle;

const DB_NAME = "secure-doc-identity";
const STORE_NAME = "keys";

/* 
   IndexedDB 
 */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveKey(name, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(key, name);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadKey(name) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

/* 
  Identity Manager
*/

const IdentityManager = {
  async initIdentity() {
    const existing = await loadKey("IK_priv");
    if (existing) return;

    // Identity Key (ECDSA)
    const IK = await subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    // Signed PreKey (ECDH)
    const SPK = await subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );

    // Sign SPK public key
    const spkRaw = await subtle.exportKey("raw", SPK.publicKey);
    const signature = await subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      IK.privateKey,
      spkRaw
    );

    await saveKey("IK_priv", IK.privateKey);
    await saveKey("IK_pub", IK.publicKey);
    await saveKey("SPK_priv", SPK.privateKey);
    await saveKey("SPK_pub", SPK.publicKey);
    await saveKey("SPK_sig", bufToBase64(signature));
  },

  async getIdentityPublicKey() {
    const pub = await loadKey("IK_pub");
    if (!pub) throw new Error("Identity not initialized");
    return bufToBase64(await subtle.exportKey("spki", pub));
  },

  async getPreKeyBundle() {
    const IK_pub = await loadKey("IK_pub");
    const SPK_pub = await loadKey("SPK_pub");
    const sig = await loadKey("SPK_sig");

    if (!IK_pub || !SPK_pub || !sig) {
      throw new Error("Missing identity keys");
    }

    return {
      identityKey: bufToBase64(await subtle.exportKey("spki", IK_pub)),
      signedPreKey: bufToBase64(await subtle.exportKey("spki", SPK_pub)),
      signature: sig
    };
  },

  async getSPKPrivate() {
    const key = await loadKey("SPK_priv");
    if (!key) throw new Error("SPK not initialized");
    return key;
  },

  async getRemoteSPK(userId) {
    const key = await loadKey(`remote:${userId}:SPK`);
    if (!key) throw new Error("Remote SPK not found");
    return key;
  },

  async importRemoteIdentity(userId, bundle) {
    try {
      const ik = await subtle.importKey(
        "spki",
        base64ToBuf(bundle.identityKey),
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
      );

      const spk = await subtle.importKey(
        "spki",
        base64ToBuf(bundle.signedPreKey),
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
      );

      const spkRaw = await subtle.exportKey("raw", spk);
      const ok = await subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        ik,
        base64ToBuf(bundle.signature),
        spkRaw
      );

      if (!ok) throw new Error("Invalid SPK signature");

      await saveKey(`remote:${userId}:IK`, ik);
      await saveKey(`remote:${userId}:SPK`, spk);
      await saveKey(`remote:${userId}:SIG`, bundle.signature);

      return true;
    } catch (e) {
      console.warn("Invalid remote identity bundle", e);
      return false;
    }
  },

  /* VERIFY */
  async verifyRemoteIdentity(userId) {
    const ik = await loadKey(`remote:${userId}:IK`);
    const spk = await loadKey(`remote:${userId}:SPK`);
    const sig = await loadKey(`remote:${userId}:SIG`);

    if (!ik || !spk || !sig) return false;

    const spkRaw = await subtle.exportKey("raw", spk);

    return subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      ik,
      base64ToBuf(sig),
      spkRaw
    );
  }
};

export default IdentityManager;