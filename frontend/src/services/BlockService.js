import { getDB } from '../index';
import { createClientBlock } from '../../models/Document';

export const getBlocksLocal = async ( blockId, versions = []) => {
  const db = await getDB();
  let blocks = await db.getAllFromIndex('blocks', 'by-blockId', blockId);

  if (blocks.length === 0) return { status: false, error: 'BLOCK_NOT_FOUND' };

  if (versions.length > 0) {
    blocks = blocks.filter(b => versions.includes(b.version));
  }

  blocks.sort((a, b) => b.version - a.version);

  return { status: true, data: blocks };
};
// lay tat ca lich su 1 block
export const getBlockHistory = async (blockId) => {
  const db = await getDB();
  const history = await db.getAllFromIndex('blocks', 'by-blockId', blockId);
  return history.sort((a, b) => b.version - a.version);
};
// tao block version moi
export const createBlockVersionLocal = async (userId, blockData) => {
  const db = await getDB();
  
  const newBlockVersion = {
    ...blockData,
    localBlockId: crypto.randomUUID(),
    authorId: userId,
    createdAt: new Date()
  };

  await db.put('blocks', newBlockVersion);

  return { status: true, data: newBlockVersion };
};
// lay version moi cua block
export const getLatestVersion = async (blockId) => {
  const db = await getDB();
  const history = await db.getAllFromIndex('blocks', 'by-blockId', blockId);
  if (history.length === 0) return 0; 

  const latest = history.reduce((prev, current) => 
    (prev.version > current.version) ? prev : current
  );
  return latest;
};
// lay document hien tai
export const getLatestBlocksLocal = async (docId) => {
  const db = await getDB();
  const allVersions = await db.getAllFromIndex('blocks', 'by-document', docId);
  
  const latestMap = new Map();
  allVersions.forEach(b => {
    const current = latestMap.get(b.blockId);
    if (!current || b.version > current.version) {
      latestMap.set(b.blockId, b);
    }
  });
  
  return Array.from(latestMap.values()).sort((a, b) => a.index - b.index);
};

// luu block server gui den
export const saveServerResponseToLocal = async (serverData) => {
  const db = await getDB();
  const clientModel = createClientBlock(serverData); 
  await db.put('blocks', clientModel);
};

// xoa doc
export const clearBlocksByDocLocal = async (docId) => {
  const db = await getDB();
  const tx = db.transaction('blocks', 'readwrite');
  const index = tx.store.index('by-document');
  let cursor = await index.openKeyCursor(IDBKeyRange.only(docId));
  while (cursor) {
    await tx.store.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
};