const mongoose = require('mongoose');
const Document = require('../models/Document');
const blockService = require('../services/BlockService');
const {searchDocument} = require('../services/DocumentService');
const { canAccess: canAccessDocument } = require('../helpers/DocPermissionHelper');

const blockSocket = (io, socket, onlineUserNames) => {
        socket.on('document:join', ({ documentId }) => {
            if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
                console.error(`ID không hợp lệ bị chặn: ${documentId}`);
                return socket.emit("document:error", { message: "INVALID_ID" });
            }
            socket.join(documentId);
            socket.documentId = documentId
            console.log(`User ${socket.user.userId} đã vào phòng: ${documentId}`);
        });
   
        socket.on('block:update', async (payload) => { 
            const { documentId } = payload;
            try{
                if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
                    return;
                }
                
                const document = await Document.findById(documentId);
                if (!document) return;
                const canAccess = canAccessDocument(document, socket.user.userId, "read"); 
                if (!canAccess) { 
                    socket.emit("document:error", { message: "FORBIDDEN" }); 
                    return; 
                }
                const result = await blockService.createBlockVersion(
                    socket.user.userId, 
                    payload);
                console.log(`Đang phát tán dữ liệu tới phòng ${documentId} cho các user khác...`);
                socket.to(documentId)
                    .emit('update-block-response', result);
            }catch(err){
                console.error("BlockSocket error: ", err);
                socket.emit('error', {message : err.message});
            }

        });

        socket.on('block:lock', ({ blockId }) => {
            socket.to(socket.documentId).emit('block:locked', {
                blockId: blockId,
                userId: socket.user.userId,
                userName: socket.user.name 
            });
        });

        socket.on('block:create', async (payload) => {
            try {
                // 1. Quan trọng: Phải lưu vào DB trước để đảm bảo tính nhất quán
                const result = await blockService.createBlockVersion(socket.user.userId, payload);
                
                if (result.status) {
                    // 2. Gửi cho tất cả mọi người trong phòng (trừ người gửi)
                    // Đảm bảo tên sự kiện bên Client đang lắng nghe là 'block:created'
                    socket.to(socket.documentId).emit('block:created', result.data);
                } else {
                    console.error("Lưu block thất bại:", result.error);
                    socket.emit('document:error', { message: "Không thể tạo block: " + result.error });
                }
            } catch (err) {
                console.error("Lỗi tạo block:", err);
            }
        });

        socket.on('block:delete', (payload) => {
            socket.to(payload.documentId).emit('block:deleted', payload);
        });

        socket.on('block:unlock', async ({ blockId }) => {
            try {
                const documentId = socket.documentId;
                if (!documentId || !blockId) return;

                const latest = await blockService.getLatestBlockVersion(
                documentId,
                blockId
                );
                if (!latest) return;

                socket.to(documentId).emit('block:unlocked', {
                blockId,
                cipherText: latest.cipherText,
                version: latest.version,
                hash: latest.hash
                });
            } catch (e) {
                console.error('block:unlock error', e);
            }
        });

        socket.on('disconnect', () => {
            console.log(`User ${socket.user.userId} thoát, giải phóng toàn bộ block.`);
            if (socket.documentId) {
                socket.to(socket.documentId).emit('user:disconnected', { userId: socket.user.userId });
            }
        });
}
module.exports = blockSocket;