import { getDB } from '../storage/IndexedDBService';

const MAX_SKIP = 50;


const SkippedMessageKeyService = {

  async save(
    userId,
    ratchetPublicKey,
    messageNumber,
    messageKey
  ) {
    const db = await getDB();

    const count = await db.count('skippedMessageKeys');
    if (count >= MAX_SKIP) {
      console.warn('Vượt quá giới hạn lưu trữ khóa nhỡ (MAX_SKIP).');
      throw new Error('MAX_SKIP_EXCEEDED');
    }

    const id = `${userId}:${ratchetPublicKey}:${messageNumber}`;
    
    await db.put('skippedMessageKeys', {
      id,
      userId,
      ratchetPublicKey,
      messageNumber,
      messageKey,
      createdAt: Date.now()
    });
  },

  async get(userId, ratchetPublicKey, messageNumber) {
    const db = await getDB();
    const id = `${userId}:${ratchetPublicKey}:${messageNumber}`;
    return await db.get('skippedMessageKeys', id);
  },

  async remove(userId, ratchetPublicKey, messageNumber) {
    const db = await getDB();
    const id = `${userId}:${ratchetPublicKey}:${messageNumber}`;
    await db.delete('skippedMessageKeys', id);
  },

  /**
   * Khi chuỗi DH thay đổi, các khóa nhỡ của chuỗi cũ thường không còn cần thiết
   */
  async deleteByRatchet(userId, ratchetPublicKey) {
    const db = await getDB();
    const tx = db.transaction('skippedMessageKeys', 'readwrite');
    const index = tx.store.index('by-user-ratchet');

    let cursor = await index.openCursor(
      IDBKeyRange.only([userId, ratchetPublicKey])
    );

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.done;
  },


  async clearAll() {
    const db = await getDB();
    await db.clear('skippedMessageKeys');
  }
};

export default SkippedMessageKeyService;