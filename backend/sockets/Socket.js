const authSocket = require('../middlewares/AuthSocket')
const documentSocket = require('../sockets/DocumentSocket')
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
        socket.on('disconnect', () => {
            console.log('user disconnected: ', socket.user.userId, socket.user.userName);
            //manager
            delete onlineUserIds[userId]
            delete onlineUserNames[userName]
        })
    })
}
module.exports  = {
    initSocket
}