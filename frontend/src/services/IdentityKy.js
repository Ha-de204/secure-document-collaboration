import { getDB } from '../storage/indexDbService';

export const saveMyKey = async (userName, identityObj) => {
  const db = await getDB();
  await db.put('identityKey', {
    id: userName,   
    userName: userName,       
    ...identityObj
  });
};

export const getMyKey = async (id) => {
  const db = await getDB();
  return await db.get('identityKey', id);
};