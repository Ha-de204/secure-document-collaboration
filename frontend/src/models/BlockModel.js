export const createClientBlock = (data) => {
  return {
    localBlockId: crypto.randomUUID(), 
    blockId: data.blockId || null, // ID từ server trả về sau khi sync
    authorId: data.authorId,
    documentId: data.documentId,
    index: data.index,
    version: data.version,
    epoch: data.epoch,
    cipherText: data.cipherText,
    prevHash: data.prevHash,
    hash: data.hash,
    createAt: data.createAt || new Date(),


  };
};