
const Document = require('../models/Document')
const {canAccess} = require('../helpers/DocPermissionHelper')

const searchDocument = async ({ userId, keyword = null }) => {
    const query = {};
    const andConditions = [];

    if (userId) {
        andConditions.push({
            $or: [
                { ownerId: userId },
                { 'shareWith.userId': userId, }
            ]
        });
    }

    if (keyword) {
        andConditions.push({
            title: { $regex: keyword, $options: 'i' }
        });
    }

    if (andConditions.length > 0) {
        query.$and = andConditions;
    }

    const documents = await Document.find(query)
        .populate('ownerId', 'userName')
        .populate('shareWith.userId', 'userName')
        .lean();

    return {
        status: true,
        data: documents
    };
};

const findDocumentById= async (documentId) => {
    try {
        return await Document.findById(documentId);
    } catch (error) {
        return null;
    }
};

const getDocumentById = async (userId, documentId) => {
        const document = await Document.findById(documentId);
        if(!document){
            return {
                status: false,
                error: 'DOCUMENT_NOT_FOUND'
            }
        }
        if(!canAccess(document, userId, 'read')){
            return {
                status: false,
                error: 'FORBIDDEN_ACCESS'
            }}
        return {
            status: true,
            data: document
        }
    }

const createDocument = async (
    userId,
    {
        title,
        epoch,
        metadata = null,
        shareWith = [],
        publicMetadata = false
    }
) => {
    
    const document = new Document({
        ownerId: userId,
        title,
        epoch: epoch,
        metadata,
        shareWith,
        publicMetadata
    });

    await document.save();
    return{
        status: true,
        data: document
    }
}

const updateDocument = async (
    userId,
    documentId,
    epoch,
    title,
    metadata = null,
    publicMetadata = null,
    shareWith = null
) => {
    const document = await Document.findById(documentId);
    if(!document){
        return {
            status: false,
            error: 'DOCUMENT_NOT_FOUND'
        }
    }
    
    if(!canAccess(document, userId, 'write')){
        return {
            status: false,
            error: 'FORBIDDEN_ACCESS'
        }
    }

    const update ={}
    if(title) update.title = title;
    if(epoch) update.epoch = epoch;
    if(metadata) update.metadata = metadata;
    if(publicMetadata !== null) update.publicMetadata = publicMetadata;
    if(shareWith) update.shareWith = shareWith;
   
    document.set(update);
    await document.save();

    return {
        status: true,
        data: document};

}

const grantPrivileges = async (ownerId, userId,documentId,permission) => {
    const document = await Document.findById(documentId);
    if(!document){
        return {
            status: false,
            error: 'DOCUMENT_NOT_FOUND'
        }
    }

    if (document.ownerId.toString() !== ownerId.toString()) {
        return {
        status: false,
        error: 'ONLY_OWNER_CAN_GRANT'
        };
    }
    
    if (ownerId.toString() === userId.toString()) {
    return {
        status: false,
        error: 'CANNOT_GRANT_SELF'
    };
}
    const alreadyShared = document.shareWith.find(share => share.userId.toString().trim() === userId.toString().trim());
    if(alreadyShared){
        alreadyShared.permissions = permission;
    }
    else{
        document.shareWith.push({
            userId: userId,
            permissions: permission
        });
    }

    await document.save();
    return {
        status: true,
        document
    }
}
const revokePrivileges = async (ownerId, userId,documentId) => {
    const document = await Document.findById(documentId);
    if(!document){
        return {
            status: false,
            error: 'DOCUMENT_NOT_FOUND'
        }
    }

    if (document.ownerId.toString() !== ownerId.toString()) {
        return {
        status: false,
        error: 'ONLY_OWNER_CAN_REVOKE'
        };
    }
    
    if (ownerId.toString() === userId.toString()) {
    return {
        status: false,
        error: 'CANNOT_REVOKE_SELF'
    };
}
     document.shareWith = document.shareWith.filter(
        s => s.userId.toString() !== userId.toString()
    );


    await document.save();
    return {
        status: true,
        document
    }
}

const deleteDocument = async (userId, documentId) => {
    const result = await Document.findById(documentId);
    if (!result) return {
        status: false,
        error: 'DOCUMENT_NOT_FOUND'
    }

    if (result.ownerId.toString() !== userId.toString()) {
        return {
        status: false,
        error: 'ONLY_OWNER_CAN_DELETE'
        };
    }
    await Document.deleteOne(result);
    return { status: true };

 } 

module.exports = {
    searchDocument,
    getDocumentById,
    createDocument,
    grantPrivileges,
    revokePrivileges,
    updateDocument,
    deleteDocument,
    findDocumentById
}