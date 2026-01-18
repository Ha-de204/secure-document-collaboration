class IdentityKey {
  constructor({publicKey, privateKeyEncrypted}) {          
    this.identityKey = {
      publicKey: publicKey,               
      privateKeyEncrypted: privateKeyEncrypted 
    };
    this.createdAt = Date.now();           
  }
}