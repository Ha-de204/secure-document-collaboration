const Document  = require('../models/Document')
const {canAccess: canAccessDocument} = require('../helpers/DocPermissionHelper')

const documentSocket = (io, socket, onlineUserNames) => {
    socket.on('document:join', async ({documentId, userId}) => { 
        const document = await Document.findById(documentId).lean();
        const canAccess = canAccessDocument(document, socket.user.userId, "read"); 
        if (!canAccess) { 
            socket.emit("document:error", { message: "FORBIDDEN" }); 
            return; 
        }
        socket.join(documentId);
        socket.to(documentId).emit('document:join',userId)           
    })
    socket.on('document:leave', ({documentId, userId}) => {
        socket.leave(documentId);
        socket.to(documentId).emit('document:leave',userId)
    })
    socket.on('document:invite', ({documentId, userId}) => {
        docket.to()
    }) 

}