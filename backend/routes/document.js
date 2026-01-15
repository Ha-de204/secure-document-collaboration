var express = require('express');
var router = express.Router();

const auth = require('../middlewares/AuthMiddleware');
const validate = require('../middlewares/ValidateMiddleware');

const documentController = require('../controllers/DocumentController');

/*
tạo document
const { title, metadata, shareWith, publicMetadata } = req.body;
*/
router.post('/', auth, documentController.createDocument);

// lấy document theo id
// const {documentId} = req.params;
router.get('/:documentId', auth, documentController.getDocumentById);

// search document (theo keyword, quyền)
//const { keyword } = req.query
router.get('/', auth, documentController.searchDocuments);

// update metadata / title
//const { documentId } = req.params;
// const { title, metadata, publicMetadata } = req.body;
router.put('/:documentId', auth, documentController.updateDocument);

// share
// const { documentId } = req.params;
// const { userId, permission } = req.body; - user la nguoi dc gan quyen
router.post('/:documentId/share', auth, documentController.grantPrivileges);

// revoke quyen share
//const { documentId, userId} = req.params;
router.delete('/:documentId/share/:userId', auth, documentController.revokePrivileges);

// delete document
//const { documentId } = req.params;
router.delete('/:documentId', auth, documentController.deleteDocument);

module.exports = router;

