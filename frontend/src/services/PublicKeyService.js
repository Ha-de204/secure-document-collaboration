import { getDB } from '../storage/indexDbService';

export const savePublicKey = async (contactData) => {
  const db = await getDB();
  
  const existing = await db.get('publicKeys', contactData.userId);
  if (existing && existing.publicKey !== contactData.publicKey) {
    throw new Error('PUBLIC_KEY_CHANGED');
  }
  const contact = {
    userId: contactData.userId,
    userName: contactData.userName,
    publicKey: contactData.publicKey,
    metadata: contactData.metadata || {}
  };
  await db.put('publicKeys', contact);
};

export const getPublicKey = async (userId) => {
  const db = await getDB();
  const contact = await db.get('publicKeys', userId);
  return contact ? contact.publicKey : null;
};

export const removeContactPublicKey = async (userId) => {
  const db = await getDB();
  await db.delete('publicKeys', userId);
};