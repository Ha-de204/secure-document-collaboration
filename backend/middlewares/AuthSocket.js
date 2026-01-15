const jwt = require('jsonwebtoken')

const authSocket = (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if(!token) return next(new Error('Unauthorized'));

        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        socket.user = decoded;

        next();
    } catch (err) {
        console.log(err);
        return next(new Error('Unauthorized'));
    }
}
module.exports = authSocket;
