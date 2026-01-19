const Block = require('../models/Block');
const { redis } = require('../config/redis');
const Joi = require('joi');
const {canAccess} = require('../helpers/DocPermissionHelper')

const accessBlock = async ( blockId, userId, ttlSeconds ) => {

  const block = await Block.find({blockId})
                           .populate('documentId', 'ownerId shareWith')
                           .lean();
  
  if (!block) {
    return {
      status: false,
      error: 'BLOCK_NOT_FOUND'
    };
  }
  
  const canAccessBlock = canAccess(block.documentId,userId,'write')

  if (!canAccessBlock) {
    return { 
      status: false, 
      error: 'FORBIDDEN_ACCESS' 
    };
  }
  const lockKey = `block:${blockId}`;
  
  const owner = await redis.get(lockKey);
  
  if (!owner || owner === userId) {
    await redis.set(lockKey, userId, { EX: ttlSeconds });

    return {
      status: true,
      block,
      
      
    };
  }

  return {
    status: false,
    error: 'BLOCK_LOCKED',
    owner
  };
};

const removeBlockAccess = async (blockId, userId) => {
  const lockKey = `block:${blockId}`;
  const block = await Block.find({blockId})
                                  .populate('documentId', 'ownerId')
                                  .lean()
  if(!block){
    return {
      status: false,
      error: 'BLOCK_NOT_FOUND'
    }
  }
  if(!canAccess(block.documentId, userId, 'write')){
    return {
      status: false,
      error: 'FORBIDDEN_ACCESS'
    }
  }
  
  const ownerDocument = block.documentId.ownerId.toString();
  const owner = await redis.get(lockKey);

  if(!owner){
    return {
      status: true,
      error: 'BLOCK_NOT_LOCKED'
    }
  }
  if(userId == ownerDocument || owner == userId){
    await redis.del(lockKey);
    return {
      status: true
    }
  }
  else return {
    status: false,
    error: 'FORBIDDEN_ACCESS'
  }
}

const getLastestBlockVersion = async (blockId, userId) => {
  const blocks = await Block.findOne({blockId})
                            .populate('documentId', 'ownerId shareWith')
                            .sort({ version: -1 })
                            .lean();
  if(blocks.length === 0){
    return {
      status: false,
      error: 'BLOCK_NOT_FOUND'
    }
  }
  if(!canAccess(blocks[0].documentId,userId,'read')) 
    return{
      status: false,
      error: 'FORBIDDEN_ACCESS'
    }
  return {
    status: true,
    data: blocks[0]
  }
}
const getBlocks = async (
  userId, // nguoi lay
  blockId,
  versions = []
) => {
  const query ={};

  query.blockId = blockId;
  if(versions.length > 0){
    query.version = { $in: versions };
  }

  const blocks = await Block.find(query)
                            .sort({ version: -1 })
                            .populate('documentId', 'ownerId shareWith')
                            .lean();

  if(blocks.length === 0){
    return {
      status: false,
      error: 'BLOCK_NOT_FOUND'
    }
  }

  if(!canAccess(blocks[0].documentId,userId,'read')) 
    return{
      status: false,
      error: 'FORBIDDEN_ACCESS'
    }
  return {
    status: true,
    data: blocks
  }
}

const createBlockVersion = async (userId,{
  blockId,
  documentId,
  index,
  version,
  epoch,
  cipherText,
  prevHash,
  hash
}) => {
  const document = await Document.findById(documentId).lean();
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

  const block = new Block({
    blockId,
    documentId,
    index,
    version,
    epoch,
    cipherText,
    prevHash,
    hash,
    authorId: userId
  });
  await block.save();
  return{
    status: true,
    data: block
  }
}

module.exports = {
  accessBlock,
  removeBlockAccess,
  getLastestBlockVersion,
  getBlocks,
  createBlockVersion
};
