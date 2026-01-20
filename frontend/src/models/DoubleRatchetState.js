class RatchetState {
  constructor({
    peerId,     // `${documentId}:${userId}`
    rootKey,
    sendChainKey,
    recvChainKey,
    dhKeyPair,    // { privateKey, publicKey }
    remotePubKey,
    ns = 0,
    nr = 0,
    pn = 0
  }) {
    this.peerId = peerId; 
    this.rootKey = rootKey;      
    this.sendChainKey = sendChainKey; 
    this.dhKeyPair = dhKeyPair;     
    this.remotePubKey = remotePubKey; 
    this.ns = ns;                   
    this.nr = nr;                  
    this.pn = pn;                   
    this.updatedAt = Date.now();
  }
}