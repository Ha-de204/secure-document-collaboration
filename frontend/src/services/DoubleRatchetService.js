import IndexedDBService from '../storage/IndexedDBService';

let activeSessions = {};

const RatchetPersistenceService = {
  async initSession(peerId) {
    if (activeSessions[peerId]) return activeSessions[peerId];

    const sessionState = await IndexedDBService.getRatchetSession(peerId);
    
    if (!sessionState) {
      console.log(`[Ratchet] Chưa có phiên cho ${peerId}.`);
      return null;
    }

    activeSessions[peerId] = sessionState;
    console.log(`[Ratchet] Đã khôi phục phiên cho ${peerId} từ DB.`);
    return sessionState;
  },


  getActiveSession(peerId) {
    return activeSessions[peerId] || null;
  },

  async persistSession(peerId) {
    const session = activeSessions[peerId];
    if (!session) return;

    // Lưu thẳng Object vào IndexedDB (không mã hóa)
    await IndexedDBService.saveRatchetSession({
      ...session,
      updatedAt: Date.now()
    });
  },


  async setSession(peerId, sessionData) {
    activeSessions[peerId] = {
      peerId,
      ...sessionData,
      updatedAt: Date.now()
    };
    await this.persistSession(peerId);
  },


  destroy(peerId) {
    delete activeSessions[peerId];
  }
};

export default RatchetPersistenceService;