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
    if(!ownerId || ownerId != document.ownerId){
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
            return: 'ALREADY_EXISTS'
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
        data: dockey
    }
}

const getDocKey = async ({ documentId, userId }) => {

    const document = await documentService.findById(documentId);
    if(!document){
        return{
            status: false,
            error: 'DOCUMENT_NOT_FOUND'
        }
    }
    const docKeys = await DocKey.find({
        documentId,
        userId
    }).sort({ epoch: 1 })

    return {
        status: true,
        data: docKeys
    }
}

module.exports = {
    createDocKey,
    getDocKey
}
