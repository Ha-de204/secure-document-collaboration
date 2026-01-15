const blockService = require('../services/BlockService')
const {searchDocument} = require('../services/DocumentService')
const blockSocket = (io, socket, onlineUserNames) => {
   
       socket.on('block:update', async (payload) => { 
        try{
            const document = await searchDocument(payload.documentId);
            const canAccess = canAccessDocument(document, socket.user.userId, "read"); 
                if (!canAccess) { 
                    socket.emit("document:error", { message: "FORBIDDEN" }); 
                    return; 
                }
            const result = await blockService.createBlockVersion(
                socket.user.userId, 
                payload);
            socket.to(payload.documentId)
                  .emit('update-block-response', result);

        }catch(err){
            console.error("BlockSocket error: ", err);
            socket.emit('error', {message : err.message});
        }

    });
    
}
module.exports = blockSocket;