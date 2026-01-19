const mongoose = require('mongoose');
const Document  = require('../models/Document')
const {canAccess: canAccessDocument} = require('../helpers/DocPermissionHelper')

const documentSocket = (io, socket, onlineUserNames) => {
    socket.on('document:join', async ({documentId, userId}) => { 
        try {
            // Kiểm tra nếu documentId không đúng định dạng ObjectId của MongoDB
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
            socket.to(documentId).emit('document:join', userId);
            console.log(`User ${userId} đã join vào phòng ${documentId}`);

        } catch (error) {
            console.error("Lỗi tại document:join:", error);
            socket.emit("document:error", { message: "SERVER_ERROR" });
        }       
    })
    socket.on('document:leave', ({documentId, userId}) => {
        socket.leave(documentId);
        socket.to(documentId).emit('document:leave',userId)
    })
    socket.on('document:invite', ({documentId, userId}) => {
        socket.to()
    }) 
}
module.exports = { documentSocket };