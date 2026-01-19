import IndexedDBService from '../storage/IndexedDBService';

/**
 * Biến lưu trữ trong RAM (Closure) để gõ phím và giải mã cực nhanh
 */
let activeSessions = {};

const RatchetPersistenceService = {

  /**
   * 1. KHỞI TẠO: Load dữ liệu từ DB lên RAM
   * Gọi khi mở tài liệu hoặc sau khi F5
   */
  async initSession(peerId) {
    // Nếu trong RAM đã có thì dùng luôn
    if (activeSessions[peerId]) return activeSessions[peerId];

    // Load bản rõ từ IndexedDB
    const sessionState = await IndexedDBService.getRatchetSession(peerId);
    
    if (!sessionState) {
      console.log(`[Ratchet] Chưa có phiên cho ${peerId}.`);
      return null;
    }

    // Đưa lên RAM
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