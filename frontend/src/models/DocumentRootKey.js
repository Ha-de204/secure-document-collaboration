class DocumentRootKey {
  constructor({ documentId, epoch, encryptedDRK, signedBy, signature }) {
    this.documentId = documentId;
    this.epoch = epoch;          
    this.encryptedDRK = encryptedDRK; 
    this.signedBy = signedBy;  
    this.signature = signature; 
    this.createdAt = Date.now()
  }
}