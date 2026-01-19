const express = require('express')
const router = express.Router()

const auth = require('../middlewares/AuthMiddleware')
const docKeyController = require('../controllers/DocKeyController')

router.post(
  '/',
  auth,
  docKeyController.createDocKey
)

router.get(
  '/:documentId/latest',
  auth,
  docKeyController.getLatestDocKey
)

router.get(
  '/:documentId',
  auth,
  docKeyController.getDocKeys
)


module.exports = router
