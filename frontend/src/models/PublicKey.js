class PublicKey {
  constructor({ userId, userName, publicKey, metadata, publicMetadata }) {
    this.userId = userId
    this.userName = userName;                
    this.publicKey = publicKey; 
    this.metadata = metadata || {};         
    this.publicMetadata = publicMetadata || false;
    this.createdAt = Date.now();           
  }
}