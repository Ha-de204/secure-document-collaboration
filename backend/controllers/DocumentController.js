const HTTP_STATUS = require('../constants/ResponseCode');
const documentService = require('../services/DocumentService');


const searchDocuments = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { keyword } = req.query;

        const result = await documentService.searchDocument({
            userId,
            keyword
        });

        return res.status(HTTP_STATUS.OK).json({
            status: true,
            data: result.data
        });

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error'
        });
    }
};

const getDocumentById = async (req,res) => {
    try{
        const {documentId} = req.params;
        const userId = req.user.userId; 
        console.log(userId)
        const result = await documentService.getDocumentById(userId,documentId);
        if(!result.status){
            if(result.error === 'DOCUMENT_NOT_FOUND'){
                return res.status(HTTP_STATUS.NOT_FOUND).json(result);
            }
            if(result.error === 'FORBIDDEN_ACCESS'){
                return res.status(HTTP_STATUS.FORBIDDEN).json(result);
            }
            return res.status(HTTP_STATUS.BAD_REQUEST).json(result);
        }

        return res.status(HTTP_STATUS.OK).json({
            status: true,
            data: result.data
        });
    }catch(err) {
        console.error(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error'
    })
    }
}

const createDocument = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { title, epoch, metadata, shareWith, publicMetadata } = req.body;

        const result = await documentService.createDocument(userId, {
            title,
            epoch,
            metadata,
            shareWith,
            publicMetadata
        });

        return res.status(HTTP_STATUS.CREATED).json({
            status: true,
            data: result.data
        });

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error'
        });
    }
};


const updateDocument = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { documentId } = req.params;
        const { title, epoch, metadata, publicMetadata } = req.body;

        const result = await documentService.updateDocument(
            userId,
            documentId,
            epoch,
            title,
            metadata,
            publicMetadata
        );

        if (!result.status) {
            if (result.error === 'DOCUMENT_NOT_FOUND') {
                return res.status(HTTP_STATUS.NOT_FOUND).json(result);
            }
            if (result.error === 'FORBIDDEN_ACCESS') {
                return res.status(HTTP_STATUS.FORBIDDEN).json(result);
            }
        }

        return res.status(HTTP_STATUS.OK).json(result);

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error'
        });
    }
};


const grantPrivileges = async (req, res) => {
    try {
        const ownerId = req.user.userId;
        const { documentId } = req.params;
        const { userId, permission } = req.body;

        const result = await documentService.grantPrivileges(
            ownerId,
            userId,
            documentId,
            permission
        );

        if (!result.status) {
            const errorMap = {
                DOCUMENT_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
                ONLY_OWNER_CAN_GRANT: HTTP_STATUS.FORBIDDEN,
                CANNOT_GRANT_SELF: HTTP_STATUS.BAD_REQUEST,
                INVALID_PERMISSION: HTTP_STATUS.BAD_REQUEST
            };

            return res
                .status(errorMap[result.error] || HTTP_STATUS.BAD_REQUEST)
                .json(result);
        }

        return res.status(HTTP_STATUS.OK).json(result);

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error'
        });
    }
};

const revokePrivileges = async (req, res) => {
    try {
        const ownerId = req.user.userId;
        const { documentId, userId} = req.params;

        const result = await documentService.revokePrivileges(
            ownerId,
            userId,
            documentId
        );

        if (!result.status) {
            const errorMap = {
                DOCUMENT_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
                ONLY_OWNER_CAN_REVOKE: HTTP_STATUS.FORBIDDEN,
                CANNOT_REVOKE_SELF: HTTP_STATUS.BAD_REQUEST
            };

            return res
                .status(errorMap[result.error] || HTTP_STATUS.BAD_REQUEST)
                .json(result);
        }

        return res.status(HTTP_STATUS.OK).json(result);

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error'
        });
    }
};
const deleteDocument = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { documentId } = req.params;

        const result = await documentService.deleteDocument(userId, documentId);

        if (!result.status) {
            const errorMap = {
                DOCUMENT_NOT_FOUND: HTTP_STATUS.NOT_FOUND,
                ONLY_OWNER_CAN_DELETE: HTTP_STATUS.FORBIDDEN
            };

            return res
                .status(errorMap[result.error] || HTTP_STATUS.BAD_REQUEST)
                .json(result);
        }

        return res.status(HTTP_STATUS.OK).json({
            status: true,
            message: 'Document deleted'
        });

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    searchDocuments,
    getDocumentById,
    createDocument,
    updateDocument,
    grantPrivileges,
    revokePrivileges,
    deleteDocument
};
