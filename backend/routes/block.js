const express = require('express');
const router = express.Router();
const auth = require('../middlewares/AuthMiddleware');
const blockController = require('../controllers/BlockController');

// xin access block
//const { blockId } = req.params;
router.get('/access/:documentId', auth, blockController.accessBlock);
//const { blockId } = req.params;
// xoa phiên access cua minh, hoac chu so huu xoa phien cua ai do (xoa phien block hien tai trong cache)
router.delete('/access/:documentId', auth, blockController.removeBlockAccess);
// tao version moi cho block
//const { error, value } = updateBlockDto.validate(req.body);
/*
const updateBlockDto = Joi.object({
  blockId: Joi.string().required(),
  documentId: Joi.string().required(),
  index: Joi.number().required(),
  version: Joi.number().required(),
  cipherText: Joi.string().required(),
  prevHash: Joi.string().required(),
  hash: Joi.string().required(),
});
 */
router.post('/:documentId', auth, blockController.createBlockVersion);
//const { blockId } = req.params;

router.get('/:blockId/lastest', auth, blockController.getLatestBlock);
// lay cac version tu chon
//const { blockId } = req.params;
//const { versions = [] } = req.body;
router.post('/versions/:blockId', auth, blockController.getBlocks);

router.get('/lastest-version/:documentId',auth, blockController.getBlocksByDocument)

module.exports = router;
