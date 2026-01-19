const HTTP_STATUS = require('../constants/ResponseCode');
const blockService = require('../services/BlockService');
const Joi = require('joi')

const accessBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const userId = req.user.userId;

    const result = await blockService.accessBlock(
      blockId,
      userId,
      process.env.BLOCK_TTL_MINUTES * 60
    );

    if (!result.status) {
      switch (result.error) {
        case 'BLOCK_NOT_FOUND':
          return res.status(HTTP_STATUS.NOT_FOUND).json({
            status: false,
            message: 'Block not found'
          });

        case 'FORBIDDEN_ACCESS':
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            status: false,
            message: 'You do not have permission to access this block'
          });

        case 'BLOCK_LOCKED':
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            status: false,
            message: 'Block is currently locked by another user',
            owner: result.owner
          });

        default:
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            status: false,
            message: 'Access block failed'
          });
      }
    }

    return res.status(HTTP_STATUS.OK).json({
      status: true,
      message: 'Block access granted',
      data: result.block
    });

  } catch (err) {
    console.error(err);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const removeBlockAccess = async (req, res) => {
  try {
    const { blockId } = req.params;

    const userId = req.user.userId;

    const result = await blockService.removeBlockAccess(blockId, userId);

    if (!result.status) {
      switch (result.error) {
        case 'BLOCK_NOT_FOUND':
          return res.status(404).json({ status: false, message: 'Block not found' });

        case 'FORBIDDEN_ACCESS':
          return res.status(403).json({ status: false, message: 'Forbidden' });
      }
    }

    return res.json({
      status: true,
      message: 'Block lock removed'
    });

  } catch (err) {
    return res.status(500).json({ status: false });
  }
};

const updateBlockDto = Joi.object({
  blockId: Joi.string().required(),
  documentId: Joi.string().required(),
  index: Joi.number().required(),
  version: Joi.number().required(),
  epoch: Joi.number().required(),
  cipherText: Joi.string().required(),
  prevHash: Joi.string().required(),
  hash: Joi.string().required(),
  epoch: Joi.number().required(),
});

const createBlockVersion = async (req, res) => {
  try {
    const { error, value } = updateBlockDto.validate(req.body);
    if (error) {
      return res.status(400).json({
        status: false,
        message: error.details[0].message
      });
    }

    const userId = req.user.userId;

    const result = await blockService.createBlockVersion(userId, value);

    if (!result.status) {
      switch (result.error) {
        case 'DOCUMENT_NOT_FOUND':
          return res.status(404).json({ status: false });

        case 'FORBIDDEN_ACCESS':
          return res.status(403).json({ status: false });
      }
    }

    return res.status(201).json({
      status: true,
      block: result.data
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false });
  }
};

const getLatestBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const userId = req.user.id;

    const result = await getLastestBlockVersion(blockId, userId);

    if (!result.status) {
      switch (result.error) {
        case 'BLOCK_NOT_FOUND':
          return res.status(404).json(result);
        case 'FORBIDDEN_ACCESS':
          return res.status(403).json(result);
        default:
          return res.status(400).json(result);
      }
    }

    return res.status(200).json({
      status: true,
      data: result.data
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
};

const getBlocks = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { versions = [] } = req.body;
    const userId = req.user.id;

    const result = await getBlocks(userId, blockId, versions);

    if (!result.status) {
      switch (result.error) {
        case 'BLOCK_NOT_FOUND':
          return res.status(404).json(result);
        case 'FORBIDDEN_ACCESS':
          return res.status(403).json(result);
        default:
          return res.status(400).json(result);
      }
    }

    return res.status(200).json({
      status: true,
      data: result.data
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
};

module.exports = {
  accessBlock,
  removeBlockAccess,
  createBlockVersion,
  getLatestBlock,
  getBlocks
};
