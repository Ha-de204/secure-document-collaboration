import { getDB } from '../storage/indexDbService';

export const saveMyKey = async (identityObj) => {
  const db = await getDB();
  await db.put('identityKey', {
    id: 'self',          
    ...identityObj
  });
};

export const getMyKey = async () => {
  const db = await getDB();
  return await db.get('identityKey', 'self');
};