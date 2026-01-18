import { getDB } from '../storage/IndexedDBService';

const DocumentKeyService = {

  async saveDRK(drkModel) {
    try {
      const db = await getDB();
      await db.put('document_keys', {
        documentId: drkModel.documentId,
        epoch: drkModel.epoch,
        encryptedDRK: drkModel.encryptedDRK, 
        signedBy: drkModel.signedBy,
        signature: drkModel.signature,
        createdAt: drkModel.createdAt
      });
    } catch (error) {
      console.error("Không thể lưu khóa vào IndexedDB:", error);
      throw error;
    }
  },

  async getDRKByEpoch(documentId, epoch) {
    try {
      const db = await getDB();
      return await db.get('document_keys', [documentId, epoch]);
    } catch (error) {
      console.error(`Không tìm thấy khóa Epoch ${epoch} cho tài liệu ${documentId}`);
      return null;
    }
  },

 
  async getLatestDRK(documentId) {
    try {
      const db = await getDB();
      const tx = db.transaction('document_keys', 'readonly');
      const store = tx.objectStore('document_keys');

      const index = store.index('documentId');
      let cursor = await index.openCursor(IDBKeyRange.only(documentId), 'prev');
      
      return cursor ? cursor.value : null;
    } catch (error) {
      console.error("Lỗi lấy khóa mới nhất:", error);
      return null;
    }
  },


  async getAllEpochsForDocument(documentId) {
    const db = await getDB();
    const allKeys = await db.getAllFromIndex('document_keys', 'documentId', documentId);
    return allKeys.sort((a, b) => b.epoch - a.epoch); 
  },


  async deleteAllKeysForDocument(documentId) {
    const db = await getDB();
    const keys = await this.getAllEpochsForDocument(documentId);
    const tx = db.transaction('document_keys', 'readwrite');
    await Promise.all([
      ...keys.map(k => tx.store.delete([k.documentId, k.epoch])),
      tx.done
    ]);
  }
};

export default DocumentKeyService;