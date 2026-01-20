export class SkippedMessageKey {
  constructor({
    sessionId,  // `${documentId}:${userId}`
    ratchetPublicKey,
    messageNumber,
    encryptedMessageKey
  }) {
    this.id = `${sessionId}:${ratchetPublicKey}:${messageNumber}`;
    this.sessionId = sessionId;
    this.ratchetPublicKey = ratchetPublicKey;
    this.messageNumber = messageNumber;
    this.encryptedMessageKey = encryptedMessageKey;
    this.ceatedAt = Date.now();
  }
}
