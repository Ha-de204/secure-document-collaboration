export const createClientDocument = (data) => {
  return {
    localDocId: data.localDocId || data._id || data.serverId || crypto.randomUUID(),
    
    serverId: data._id || null, 
    ownerId: data.ownerId,
    title: data.title || 'Tài liệu không có tiêu đề',
    epoch: data.epoch ?? 0,
    metadata: data.metadata || {},
    
    shareWith: data.shareWith || [], 
    publicMetadata: data.publicMetadata ?? false,

    lastModified: Date.now()
  };
};

