import {
  loadRatchetState,
  saveRatchetState
} from "../services/DoubleRatchetService";

const subtle = window.crypto.subtle;

async function kdfChain(chainKey) {
  return subtle.digest("SHA-256", chainKey);
}

export async function encryptPatch(sessionId, plaintext) {
  const state = await loadRatchetState(sessionId);

  const messageKey = await kdfChain(state.sendChainKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    messageKey,
    new TextEncoder().encode(plaintext)
  );

  state.sendChainKey = await kdfChain(state.sendChainKey);
  state.sendCount++;

  await saveRatchetState(sessionId, state);

  return { ciphertext, iv, index: state.sendCount };
}

export async function decryptPatch(sessionId, packet) {
  const state = await loadRatchetState(sessionId);

  const messageKey = await kdfChain(state.recvChainKey);

  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: packet.iv },
    messageKey,
    packet.ciphertext
  );

  state.recvChainKey = await kdfChain(state.recvChainKey);
  state.recvCount++;

  await saveRatchetState(sessionId, state);

  return new TextDecoder().decode(plaintext);
}
