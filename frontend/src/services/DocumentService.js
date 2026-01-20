import { getDB } from '../storage/indexDbService';
import { createClientDocument } from '../models/DocumentModel';
import { getCurrentUserId, canWrite } from '../helps/PermissionsHelper';
import{ getPublicKey } from './PublicKeyService'

export const searchDocumentClient = async ({ keyword = null }) => {
  const db = await getDB();
  const userId = await getCurrentUserId();
  if (!userId) return { status: false, error: 'NOT_LOGGED_IN' };

  let localDocs = await db.getAll('documents');

  localDocs = localDocs.filter(doc => {
    const isOwner = doc.ownerId?.toString() === userId.toString();
    const isShared = doc.shareWith?.some(
      s => s.userId?.toString() === userId.toString()
    );

    const matchesKeyword = keyword
      ? doc.title?.toLowerCase().includes(keyword.toLowerCase())
      : true;

    return (isOwner || isShared) && matchesKeyword;
  });

  return { status: true, data: localDocs };
};
export const saveDocumentLocally = async (docData) => {
    const db = await getDB();
    const clientDoc = createClientDocument(docData);
    await db.put('documents', clientDoc);
    return clientDoc;
};

export const getLocalDocument = async (localId) => {
    const db = await getDB();
    return db.get('documents', localId);
};

export const getAllLocalDocuments = async () => {
    const db = await getDB();
    return db.getAll('documents');
};

export const updateDocument = async (localDocId, updateData) => {
    const db = await getDB();
    const oldDoc = await db.get('documents', localDocId);
    if (!oldDoc) throw new Error("Document không tồn tại");
    if (!(await canWrite(oldDoc))) {
    throw new Error('Khong co quyen');
  }
    const updatedDoc = {
        ...oldDoc,
        ...updateData,
        lastModified: Date.now()
  };

    await db.put('documents', updatedDoc);
    return updatedDoc;
};

export const deleteDocumentLocally = async (localDocId) => {
  const db = await getDB();
  const doc = await db.get('documents', localDocId);
  if (!doc) throw new Error('Khong ton tai document');

  if (doc.ownerId.toString() !== (await getCurrentUserId())) {
    throw new Error('Chi owner moi co quyen xoa');
  }
  const tx = db.transaction(['documents', 'blocks'], 'readwrite');
  try {
    await tx.objectStore('documents').delete(localDocId);
    const blockStore = tx.objectStore('blocks');
    const index = blockStore.index('by-document');
    let cursor = await index.openKeyCursor(IDBKeyRange.only(localDocId));


    while (cursor) {
      await blockStore.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }

    await tx.done;
    console.log("Đã xóa Document và các Blocks liên quan");
  } catch (error) {
    console.error("Lỗi khi xóa:", error);
    tx.abort();
  }
};

export const grantPrivilegesLocal = async (ownerId, userId, documentId, permission) => {
    const db = await getDB();
    
    const document = await db.get('documents', documentId);
    if (!document) {
        return { status: false, error: 'DOCUMENT_NOT_FOUND' };
    }

    document.shareWith = document.shareWith ?? [];
    if (document.ownerId.toString() !== ownerId.toString()) {
        return { status: false, error: 'ONLY_OWNER_CAN_GRANT' };
    }
    
    if (ownerId.toString() === userId.toString()) {
        return { status: false, error: 'CANNOT_GRANT_SELF' };
    }

    const alreadyShared = document.shareWith.find(
        share => share.userId.toString().trim() === userId.toString().trim()
    );

    if (alreadyShared) {
        alreadyShared.permission = permission;
    } else {
        document.shareWith.push({ userId, permission: permission });
    }
    document.lastModified = Date.now();

    await db.put('documents', document);
    return { status: true, document };
};

export const revokePrivilegesLocal = async (ownerId, userId, documentId) => {
    const db = await getDB();
    const document = await db.get('documents', documentId);
    if (!document) {
        return { status: false, error: 'DOCUMENT_NOT_FOUND' };
    }

    if (document.ownerId.toString() !== ownerId.toString()) {
        return { status: false, error: 'ONLY_OWNER_CAN_REVOKE' };
    }
    
    if (ownerId.toString() === userId.toString()) {
        return { status: false, error: 'CANNOT_REVOKE_SELF' };
    }

    document.shareWith = document.shareWith.filter(
        s => s.userId.toString() !== userId.toString()
    );
    document.lastModified = Date.now();

    await db.put('documents', document);
    return { status: true, document };
};

export const getAccessIds = async (document) => {
  const ids = [document.ownerId,...new Set([...document.shareWith.map(u => u.userId)])];
  
  return await Promise.all(ids.map(async (id) => ({
    userId: id,
    publicKey: await getPublicKey(id)
  })));
};
