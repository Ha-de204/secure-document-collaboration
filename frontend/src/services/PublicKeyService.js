import { getDB } from '../storage/indexDbService';

export const savePublicKey = async (contactData) => {
  const db = await getDB();
  
  const existing = await db.get('publicKeys', contactData.userName);
  if (existing && existing.publicKey !== contactData.publicKey) {
    throw new Error('PUBLIC_KEY_CHANGED');
  }
  const contact = {
    userName: contactData.userName,
    publicKey: contactData.publicKey,
    metadata: contactData.metadata || {}
  };
  await db.put('publicKeys', contact);
};

export const getPublicKey = async (userName) => {
  const db = await getDB();
  const contact = await db.get('publicKeys', userName);
  return contact ? contact.publicKey : null;
};

export const removeContactPublicKey = async (userName) => {
  const db = await getDB();
  await db.delete('publicKeys', userName);
};