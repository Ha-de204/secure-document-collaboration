import axios from 'axios';
import BlockCryptoModule from './crypto';
import { getPublicKey } from './IdentityManager';

/**
 * Helper function to encrypt and sign DRK for a user.
 * @param {string} userId - The user ID.
 * @param {string} publicKey - The user's public key.
 * @param {string} newDRK - The new Document Root Key.
 * @param {number} newEpoch - The new epoch for the DRK.
 * @param {string} documentId - The document ID.
 * @param {string} token - Authorization token.
 * @param {string} myIdentity - The private key of the current user.
 */
const encryptAndSignDRK = async (userId, publicKey, newDRK, newEpoch, documentId, token, myIdentity) => {
  try {
    const dataToSign = `doc:${documentId}|epoch:${newEpoch}|forUser:${userId}`;
    const signature = await BlockCryptoModule.signData(dataToSign, myIdentity);

    const encryptedDRK = await BlockCryptoModule.encryptWithPublicKey(publicKey, newDRK);
    const drkModel = {
      documentId,
      epoch: newEpoch,
      encryptedDRK,
      signedBy: userId,
      signature,
      createdAt: new Date(),
    };

    await axios.post(`${process.env.REACT_APP_API_URL}/doc-keys`, drkModel, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error(`Error encrypting and signing DRK for user ${userId}:`, err);
  }
};

/**
 * Encrypt DRK for existing users.
 * @param {Array} shareWith - List of users the document is shared with.
 * @param {string} newDRK - The new Document Root Key.
 * @param {number} newEpoch - The new epoch for the DRK.
 * @param {string} documentId - The document ID.
 * @param {string} token - Authorization token.
 * @param {string} myIdentity - The private key of the current user.
 */
export const encryptDRKForExistingUsers = async (shareWith, newDRK, newEpoch, documentId, token, myIdentity) => {
  for (const shareEntry of shareWith) {
    const sharedUserId = shareEntry.userId?._id || shareEntry.userId;
    try {
      // Kiểm tra nếu doc-key đã tồn tại
      const existingKey = await axios.get(
        `${process.env.REACT_APP_API_URL}/doc-keys/${documentId}/version/${newEpoch}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (existingKey.data.status) {
        console.log(`Doc-key cho user ${sharedUserId} và epoch ${newEpoch} đã tồn tại.`);
        continue; // Bỏ qua nếu đã tồn tại
      }

      const publicKey = await getPublicKey(sharedUserId);
      if (publicKey) {
        await encryptAndSignDRK(sharedUserId, publicKey, newDRK, newEpoch, documentId, token, myIdentity);
      }
    } catch (err) {
      console.error(`Error processing user ${sharedUserId}:`, err);
    }
  }
};

/**
 * Encrypt DRK for the document owner.
 * @param {Object} owner - The owner object containing userId and publicKey.
 * @param {string} newDRK - The new Document Root Key.
 * @param {number} newEpoch - The new epoch for the DRK.
 * @param {string} documentId - The document ID.
 * @param {string} token - Authorization token.
 * @param {string} myIdentity - The private key of the current user.
 */
export const encryptDRKForOwner = async (owner, newDRK, newEpoch, documentId, token, myIdentity) => {
  try {
    const ownerPublicKey = owner.identityKey || await getPublicKey(owner.userId);
    if (ownerPublicKey) {
      await encryptAndSignDRK(owner.userId, ownerPublicKey, newDRK, newEpoch, documentId, token, myIdentity);
    }
  } catch (err) {
    console.error(`Error encrypting DRK for owner:`, err);
  }
};