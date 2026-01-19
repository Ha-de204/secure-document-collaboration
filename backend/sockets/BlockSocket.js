const mongoose = require('mongoose');
const Document = require('../models/Document');
const blockService = require('../services/BlockService');
const {searchDocument} = require('../services/DocumentService');
const { canAccess: canAccessDocument } = require('../helpers/DocPermissionHelper');

const blockSocket = (io, socket, onlineUserNames) => {
       
    socket.on('block:editing', ({ documentId, blockId, cipherText }) => {
        if (!socket.rooms.has(documentId)) return;

        socket.to(documentId).emit('block:editing', {
        blockId,
        cipherText,
        by: socket.user.userId
        });
    });

    socket.on('block:commit', async (payload) => {
        try {
        const { documentId } = payload;
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
            blockId: result.data.blockId,
            version: result.data.version,
            hash: result.data.hash,
            epoch: result.data.epoch,
            isDeleted: false
        });

        } catch (err) {
        console.error('[WS][block:commit]', err);
        socket.emit('block:error', 'BLOCK_COMMIT_FAILED');
        }
    });

}
module.exports = blockSocket;