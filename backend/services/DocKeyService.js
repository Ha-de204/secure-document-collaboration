const DocKey = require('../models/DocKey')
const documentService = require('../services/DocumentService')

const createDocKey = async (ownerId, {
    documentId,
    userId,
    epoch,
    encryptedDocKey,
    signature
}) => {
    const document = await documentService.getDocumentById(documentId);
    if(!document){
        return{
            status: false,
            error: 'DOCUMENT_NOT_FOUND'
        }
    }
    if(!ownerId || ownerId != document.ownerId.toString()){
        return{
            status: false,
            error: 'FORBIDDEN_ACCESS'
        }
    }

    const existed = await DocKey.findOne({
        documentId,
        userId,
        epoch
    })

    if (existed) {
        return{
            status: false,
            error: 'ALREADY_EXISTS'
        }
    }

    const docKey = await DocKey.create({
        documentId,
        userId,
        epoch,
        encryptedDocKey,
        signature
    })

    return {
        status: true,
        data: docKey
    }
}

const getDocKey = async ({ documentId, userId }) => {

    const document = await documentService.getDocumentById(documentId);
    if(!document){
        return{
            status: false,
            error: 'DOCUMENT_NOT_FOUND'
        }
    }
    const docKeys = await DocKey.find({
        documentId,
        userId
    }).sort({ epoch: -1 })

    return {
        status: true,
        data: docKeys
    }
}
const getLastestDockey = async ({ documentId, userId }) => {
    const result = await getDocKey({documentId,userId});
    if(!result.status) return result
    if (!result.data || result.data.length === 0) {
        return {
            status: false,
            error: 'DOC_KEY_NOT_FOUND'
        }
    }
    return{
        status: true,
        data: result.data[0]
    }
}
module.exports = {
    getLastestDockey,
    createDocKey,
    getDocKey
}
