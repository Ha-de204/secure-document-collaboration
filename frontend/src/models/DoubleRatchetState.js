class RatchetState {
  constructor({
    peerId,
    rootKey,
    sendChainKey,
    recvChainKey,
    dhKeyPair,    // { privateKey, publicKey }
    remotePubKey,
    ns = 0,
    nr = 0,
    pn = 0,
    skippedKeys = {}
  }) {
    this.peerId = peerId;           // Định danh phiên (thường là UserId)
    this.rootKey = rootKey;         // Khóa gốc (RK)
    this.sendChainKey = sendChainKey; // CK gửi
    this.recvChainKey = recvChainKey; // CK nhận
    this.dhKeyPair = dhKeyPair;     // Cặp khóa DH của mình
    this.remotePubKey = remotePubKey; // Khóa DH công khai của đối phương
    this.ns = ns;                   // Counter gửi
    this.nr = nr;                   // Counter nhận
    this.pn = pn;                   // Counter của chain trước
    this.skippedKeys = skippedKeys; // { index: key } - Lưu tin đến trễ
    this.updatedAt = Date.now();
  }
}