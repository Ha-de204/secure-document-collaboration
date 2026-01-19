import { getPublicKey } from "../services/PublicKeyService";
import { saveDRK } from "../services/DRKService";

const subtle = window.crypto.subtle;

export async function encryptDRKForUser(
  myPrivateKey,
  receiverUserName,
  drkRaw
) {
  const receiverPK = await getPublicKey(receiverUserName);

  const sharedSecret = await subtle.deriveKey(
    {
      name: "ECDH",
      public: receiverPK
    },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedDRK = await subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedSecret,
    drkRaw
  );

  await saveDRK({
    userName: receiverUserName,
    encryptedDRK,
    iv
  });

  return true;
}
