export const canAccess = (
    document,
    userId,
    requiredPermission ='read'
) => {
    if (!document || !userId) return false;
    const { ownerId, shareWith = []} = document;
    if(ownerId.toString() === userId) return true;
    const inDoc = shareWith.find(u => u.userId == userId)
    if(!inDoc) return false;
    const permissionLevels = ['read', 'comment', 'write'];
    const userPermissionIndex = permissionLevels.indexOf(inDoc.permissions);
    const requiredPermissionIndex = permissionLevels.indexOf(requiredPermission);
    return userPermissionIndex >= requiredPermissionIndex;
}