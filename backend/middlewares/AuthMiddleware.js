const jwt = require('jsonwebtoken');
const authMiddleware = async (req, res, next) => {
    try{
        const token = req.header('Authorization')?.replace('Bearer ', '') 
        || req.cookies?.accessToken;
        if(!token){
            return res.status(401).json({
                status: false,
                message: 'Đăng nhập lại'
            })
        }

        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        req.user = decoded;
        next();

    } catch (err){
        console.error(err);
        return res.status(401).json({
            status: false,
            message: 'Đăng nhập lại'
        })
    }
}

module.exports = authMiddleware;