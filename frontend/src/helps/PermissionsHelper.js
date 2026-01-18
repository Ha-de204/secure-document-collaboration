import { getDB } from '../db';

export const getCurrentUserId = async () => {
  const db = await getDB();
  const identity = await db.get('identityKey', 'self');
  return identity?.userId || null;
};

export const canAccess = async (
  document,
  requiredPermission = 'read'
) => {
  if (!document ) return false;

  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { ownerId, shareWith = [] } = document;

  
  if (ownerId?.toString() === userId.toString()) {
    return true;
  }

  const inDoc = shareWith.find(
    u => u.userId?.toString() === userId.toString()
  );
  if (!inDoc) return false;

  const permissionLevels = ['read', 'comment', 'write'];

  const userPermissionIndex = permissionLevels.indexOf(inDoc.permission);
  const requiredPermissionIndex = permissionLevels.indexOf(requiredPermission);

  if (userPermissionIndex === -1 || requiredPermissionIndex === -1) {
    return false;
  }

  return userPermissionIndex >= requiredPermissionIndex;
};
export const canRead = async (doc) =>
  await canAccess(doc, 'read');

export const canComment = async (doc) =>
  await canAccess(doc,  'comment');

export const canWrite = async (doc) =>
  await canAccess(doc,  'write');

export const isOwner = async (doc) =>
  doc?.ownerId?.toString() === await getCurrentUserId();
