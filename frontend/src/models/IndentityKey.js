class IdentityKey {
  constructor({userId,publicKey, privateKeyEncrypted}) {   
    this.userId = userId
    this.identityKey = {
      publicKey: publicKey,               
      privateKeyEncrypted: privateKeyEncrypted 
    };
    this.createdAt = Date.now();           
  }
}