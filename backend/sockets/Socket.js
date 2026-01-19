const authSocket = require('../middlewares/AuthSocket')
const { documentSocket } = require('../sockets/DocumentSocket');
const blockSocket = require('../sockets/BlockSocket')

const onlineUserIds = {}
const onlineUserNames = {}
initSocket = (io) => {
    io.use(authSocket);
        io.on('connection', (socket) => {
            console.log('a user connected: ', socket.user.userId, socket.user.userName);
            const {userId, userName} = socket.user
            //manager
            onlineUserIds[userId] = socket.id
            onlineUserNames[userName] = socket.id


            documentSocket(io, socket, onlineUserNames);
            blockSocket(io, socket, onlineUserNames);

            console.log('User connected:', socket.id);

        socket.on('disconnecting', () => {
            console.log('user disconnecting: ', socket.user.userId, socket.user.userName);
            const rooms = Array.from(socket.rooms);
            rooms.forEach(documentId => {
                if (documentId !== socket.id) { 
                    socket.to(documentId).emit('document:left', userId);
                    console.log(`User ${userName} tự động rời phòng ${documentId} do F5/Tắt tab/Mất mạng`);
                }
            });
            //manager
            delete onlineUserIds[userId]
            delete onlineUserNames[userName]
        })
    })
}
module.exports  = {
    initSocket
}