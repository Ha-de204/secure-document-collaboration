const mongoose = require('mongoose');
const Document  = require('../models/Document')
const {canAccess: canAccessDocument} = require('../helpers/DocPermissionHelper')
const documentService = require('../services/DocumentService')
const inviteService = require('../services/InviteService')
const userService = require ('../services/UserService')

const documentSocket = (io, socket, onlineUserNames) => {
    socket.on('document:join', async ({documentId}) => { 
        try {
            const userId = socket.user.userId
            if (!mongoose.Types.ObjectId.isValid(documentId)) {
                console.error(`ID không hợp lệ: ${documentId}`);
                return socket.emit("document:error", { message: "INVALID_ID" });
            }

            const document = await Document.findById(documentId).lean();
            
            if (!document) {
                return socket.emit("document:error", { message: "NOT_FOUND" });
            }

            const canAccess = canAccessDocument(document, socket.user.userId, "read");
            if (!canAccess) {
                socket.emit("document:error", { message: "FORBIDDEN" });
                return;
            }

            socket.join(documentId);
            socket.to(documentId).emit('document:joined', userId);
            console.log(`User ${userId} đã join vào phòng ${documentId}`);

        } catch (error) {
            console.error("Lỗi tại document:join:", error);
            socket.emit("document:error", { message: "SERVER_ERROR" });
        }       
    })
    socket.on('document:leave', ({documentId}) => {
        const userId = socket.user.userId
        if (socket.rooms.has(documentId)) {
        socket.leave(documentId);
        socket.to(documentId).emit('document:left',userId)
        }
    })
    socket.on('document:invite', async ({
        documentId, 
        inviteeName, 
        permission,
    }) => {
        try{
            const invitee = await userService.findByUserName(inviteeName)
            if (!invitee) {
            return socket.emit('document:error', 'INVITEE_NOT_FOUND')
            }

            const socketId = onlineUserNames[invitee.userName]
            if (!socketId) {
                return
            }

            socket.to(socketId).emit('document:invited', {
            documentId,
            inviterId: socket.user.userId,
            inviterName: socket.user.userName,
            permission
            })
        } catch (err) {
            console.error('[WS][document:invite]', err)
            socket.emit('document:error', 'INVITE_NOTIFY_FAILED')
        }
    }) 
    socket.on('document:rotate-key', ({ documentId, epoch }) => {
        try {
            if (!socket.rooms.has(documentId)) return
            socket.to(documentId).emit('document:key_rotated', {
            documentId,
            epoch,
            by: socket.user.userName
            })

        } catch (err) {
            console.error('[WS][document:rotate-key]', err)
            socket.emit('document:error', 'KEY_ROTATION_FAILED')
        }
    })
}
module.exports = { documentSocket };