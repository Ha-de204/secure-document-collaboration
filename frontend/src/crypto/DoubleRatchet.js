const subtle = window.crypto.subtle;

/* ---------- Utils ---------- */

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}

/* ---------- KDF ---------- */

async function hkdf(input, salt, info, length = 32) {
  const key = await subtle.importKey(
    "raw",
    input,
    "HKDF",
    false,
    ["deriveBits"]
  );

  return subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8
  );
}

/* ---------- AES ---------- */

async function encryptAES(keyBytes, plaintext) {
  const key = await subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    iv: bufToBase64(iv),
    data: bufToBase64(ct)
  };
}

async function decryptAES(keyBytes, payload) {
  const key = await subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  return subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(payload.iv) },
    key,
    base64ToBuf(payload.data)
  );
}

/* ---------- Double Ratchet ---------- */

class DoubleRatchet {
  constructor(rootKey) {
    this.rootKey = rootKey;

    this.sendChainKey = null;
    this.recvChainKey = null;

    this.sendIndex = 0;
    this.recvIndex = 0;

    this.skipped = new Map(); // index -> messageKey
  }

  /* Init roles */
  async initAsSender() {
    this.sendChainKey = await hkdf(
      this.rootKey,
      new Uint8Array(32),
      new TextEncoder().encode("DR-send")
    );
  }

  async initAsReceiver() {
    this.recvChainKey = await hkdf(
      this.rootKey,
      new Uint8Array(32),
      new TextEncoder().encode("DR-recv")
    );
  }

  /* Derive message key */
  async nextMessageKey(chainKey) {
    const mk = await hkdf(
      chainKey,
      new Uint8Array(32),
      new TextEncoder().encode("DR-msg")
    );

    const nextCK = await hkdf(
      chainKey,
      new Uint8Array(32),
      new TextEncoder().encode("DR-chain")
    );

    return { mk, nextCK };
  }

  /* -------- SEND -------- */

  async encryptPatch(plaintext) {
    const { mk, nextCK } = await this.nextMessageKey(this.sendChainKey);
    this.sendChainKey = nextCK;

    const payload = await encryptAES(mk, plaintext);

    return {
      index: this.sendIndex++,
      payload
    };
  }

  /* -------- RECEIVE -------- */

  async decryptPatch(message) {
    const { index, payload } = message;

    /* skipped message */
    if (this.skipped.has(index)) {
      const mk = this.skipped.get(index);
      this.skipped.delete(index);
      return decryptAES(mk, payload);
    }

    /* derive until reach index */
    while (this.recvIndex < index) {
      const { mk, nextCK } = await this.nextMessageKey(this.recvChainKey);
      this.skipped.set(this.recvIndex, mk);
      this.recvChainKey = nextCK;
      this.recvIndex++;
    }

    const { mk, nextCK } = await this.nextMessageKey(this.recvChainKey);
    this.recvChainKey = nextCK;
    this.recvIndex++;

    return decryptAES(mk, payload);
  }
}

export default DoubleRatchet;
