import { getDB } from '../index';

export const saveMyKey = async (identityObj) => {
  const db = await getDB();
  await db.put('identityKey', identityObj,'self');
};

export const getMyKey = async () => {
  const db = await getDB();
  return await db.get('identityKey', 'self');
};