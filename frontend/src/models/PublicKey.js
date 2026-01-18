class PublicKey {
  constructor({ userName, publicKey, metadata, publicMetadata }) {
    this.userName = userName;                
    this.publicKey = publicKey; 
    this.metadata = metadata || {};         
    this.publicMetadata = publicMetadata || false;
    this.createdAt = Date.now();           
  }
}