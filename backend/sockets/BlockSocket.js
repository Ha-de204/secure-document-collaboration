const mongoose = require('mongoose');
const Document = require('../models/Document');
const blockService = require('../services/BlockService');
const {searchDocument} = require('../services/DocumentService');
const { canAccess: canAccessDocument } = require('../helpers/DocPermissionHelper');

const blockSocket = (io, socket, onlineUserNames) => {
       
    socket.on('document:request_access', async ({ documentId, blockId }) => {
    try {
        const  result = await blockService.accessBlock(blockId, socket.user.userId, process.env.BLOCK_TTL_MINUTES)
        socket.emit('block:locked: ', {blockId, result});
    } catch (err) {
        console.error('block:error', err);
        }
    });

    socket.on('document:remove_access', async ({ documentId, blockId }) => {
    try {
        const  result = await blockService.removeBlockAccess(blockId,socket.user.userId)
        socket.emit('block:remove-locked: ',{ blockId ,result} );
    } catch (err) {
        console.error('block:error', err);
        }
    });
    socket.on('block:editing', payload => {
        const {
            documentId,
            blockId,
            cipherText,
            version,
            hash,
            editor,
            ts,
            index,
            isNew
        } = payload;

        if (!socket.rooms.has(documentId)) return;

        socket.to(documentId).emit('block:editing', {
            blockId,
            cipherText,
            version,
            hash,
            editor,
            ts,
            index,
            isNew
        });
    });

    socket.on('block:commit', async (payload) => {
        try {
        const { blockId, cipherText, documentId, version, epoch, hash, prevHash } = payload;
        if (!socket.rooms.has(documentId)) return;

        const document = await Document.findById(documentId).lean();
        if (!document) return;

        const canWrite = canAccessDocument(
            document,
            socket.user.userId,
            'write'
        );
        if (!canWrite) return;

        socket.to(documentId).emit('block:committed', {
            blockId,
            cipherText,
            userId: socket.user.userId,
            version,
            epoch,
            hash,
            prevHash
        });

        } catch (err) {
        console.error('[WS][block:commit]', err);
        socket.emit('block:error', 'BLOCK_COMMIT_FAILED');
        }
    });

}
module.exports = blockSocket;