export const createClientDocument = (data) => {
  return {
    localDocId: data.localDocId || crypto.randomUUID(), 
    
    serverId: data._id || null, // Lưu _id của MongoDB sau khi sync
    ownerId: data.ownerId,
    title: data.title || 'Untitled Document',
    epoch: data.epoch ?? 0,
    metadata: data.metadata || {},
    
    shareWith: data.shareWith || [], 
    publicMetadata: data.publicMetadata ?? false,

    lastModified: Date.now()
  };
};

