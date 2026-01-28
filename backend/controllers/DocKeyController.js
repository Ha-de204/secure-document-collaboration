const docKeyService = require('../services/DocKeyService')

const createDocKey = async (req, res) => {
  try {
    const ownerId = req.user.userId

    const {
      documentId,
      userId,
      epoch,
      encryptedDocKey,
      signature
    } = req.body

    const result = await docKeyService.createDocKey(ownerId, {
      documentId,
      userId,
      epoch,
      encryptedDocKey,
      signature
    })

    if (!result.status) {
      switch (result.error) {
        case 'DOCUMENT_NOT_FOUND':
          return res.status(404).json({
            status: false,
            message: 'Document not found'
          })

        case 'FORBIDDEN_ACCESS':
          return res.status(403).json({
            status: false,
            message: 'You do not have permission to access this document'
          })

        case 'ALREADY_EXISTS':
          return res.status(409).json({
            status: false,
            message: 'DocumentKey already exists'
          })

        default:
          return res.status(400).json({
            status: false,
            message: 'Create DocumentKey failed'
          })
      }
    }

    return res.status(201).json(result)
  } catch (err) {
    console.error('[DocKeyController][create]', err)
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    })
  }
}

const getDocKeys = async (req, res) => {
  try {
    const { documentId } = req.params
    const userId = req.user.userId

    const result = await docKeyService.getDocKey({ documentId, userId })

    if (!result.status) {
      switch (result.error) {
        case 'DOCUMENT_NOT_FOUND':
          return res.status(404).json({
            status: false,
            message: 'Document not found'
          })

        default:
          return res.status(400).json({
            status: false,
            message: 'Get DocumentKeys failed'
          })
      }
    }

    return res.json({
      status: true,
      data: result.data
    })
  } catch (err) {
    console.error('[DocKeyController][get]', err)
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    })
  }
}

const getLatestDocKey = async (req, res) => {
  try {
    const { documentId } = req.params
    const userId = req.user.userId
    console.log(userId)
    const result = await docKeyService.getLastestDockey({ documentId, userId })

    if (!result.status) {
      switch (result.error) {
        case 'DOCUMENT_NOT_FOUND':
          return res.status(404).json({
            status: false,
            message: 'Document not found'
          })

        case 'DOC_KEY_NOT_FOUND':
          return res.status(404).json({
            status: false,
            message: 'DocumentKey not found'
          })

        default:
          return res.status(400).json({
            status: false,
            message: 'Get latest DocumentKey failed'
          })
      }
    }

    return res.json(result)
  } catch (err) {
    console.error('[DocKeyController][getLatest]', err)
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    })
  }
}
const getDocKeyByEpoch = async(req, res) => {
  try {
    const { documentId } = req.params
    const { epoch } = req.query
    const userId = req.user.userId
    const result = await docKeyService.getDocKeyByVersion({ documentId, userId, epoch })
    if (!result.status) {
      switch (result.error) {
        case 'DOCUMENT_NOT_FOUND':
          return res.status(404).json({
            status: false,
            message: 'Document not found'
          })
        case 'DOC_KEY_NOT_FOUND':
          return res.status(404).json({
            status: false,
            message: 'DocumentKey not found'
          })
        default:
          return res.status(400).json({
            status: false,
            message: 'Get DocumentKey by version failed'
          })
      }
    }
    return res.json(result)
  } catch (err) {
    console.error('[DocKeyController][getByVersion]', err)
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    })
}
}
module.exports = {
  createDocKey,
  getDocKeys,
  getLatestDocKey,
  getDocKeyByEpoch
}
