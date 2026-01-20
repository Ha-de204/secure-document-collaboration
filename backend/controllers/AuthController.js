const jwt = require('jsonwebtoken')
const User = require('../models/User')
const HTTP_STATUS = require('../constants/ResponseCode')
const Joi = require('joi')
const bcrypt = require('bcryptjs')
const passwordComplexity = require('joi-password-complexity')
const { redis } = require('../config/redis')
const {validate} = require('../middlewares/ValidateMiddleware')

const passwordOptions = {
    min: 8,
    max: 30,
    lowerCase: 1,
    upperCase: 1,
    numeric: 1,
}
const registerDto = Joi.object({
    userName: Joi.string().trim().min(3).max(100).required(),
    password: passwordComplexity(passwordOptions).required(),
    identityKey: Joi.string().required(), // THÊM DÒNG NÀY
    metadata: Joi.object().optional(),
    publicMetadata: Joi.boolean().optional() // Thêm nếu frontend có gửi lên
})

const loginDto = Joi.object({
    userName: Joi.string().trim(),
    password: Joi.string()
})

const changePassDto = Joi.object({
    oldPassword: Joi.string(),
    newPassword: passwordComplexity(passwordOptions).required()
})


const register = async (req, res) => {
    try{
        const { userName, password, metadata, identityKey, publicMetadata } = req.body;
        const existingUser = await User.findOne({userName});
        if(existingUser){
            return res.status(HTTP_STATUS.CONFLICT).json({
                status: false,
                message: 'Username already exists.'
            })
        }

        const hashedPass = await bcrypt.hash(password, 10);
        
        await User.create({
            userName,
            password: hashedPass,
            identityKey,
            metadata,
            publicMetadata: publicMetadata || false
        });

        return res.status(HTTP_STATUS.CREATED).json({
            status: true,
            message: 'User registered successfully.',
            
        })

    }catch(err){
        console.error(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error.'
        })
    }

}

const login = async (req, res) => {
    try{
        
        const {userName, password} = req.body;
        const user = await User.findOne({userName});
        if(!user){
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: false,
                message: 'Invalid username or password'

            })
        }
        const validPass = await bcrypt.compare(password, user.password);
        if(!validPass){
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                status: false,
                message: 'Invalid username or password'

            })
        }
        const accessToken = jwt.sign({
            userId: user._id,
            userName: user.userName,
        },
        process.env.JWT_ACCESS_SECRET,
        {expiresIn: '1h'});

        const refreshToken = jwt.sign({
            userId: user._id,
            userName: user.userName,
        },
        process.env.JWT_REFRESH_SECRET,
        {expiresIn: '15d'});

        const key = `refreshToken:${userName}`
        await redis.del(key)
        await redis.set(key, refreshToken, {EX: 15*24*60*60});

        res.cookie('refreshToken',refreshToken,{
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 15*24*60*60*1000,
        })
        res.cookie('accessToken', accessToken,{
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 60*60*1000,
        })
        return res.status(HTTP_STATUS.OK).json({
            status: true,
            data: accessToken,
            user: user

        })
    }catch(err){
        console.error(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error.'
        })
    }
}

const logout = async (req, res) => {
    try{
        const refreshToken = req.cookies?.refreshToken;
        const key =`refreshToken:${req.user.userName}`
        if (refreshToken) {
            await redis.del(key)
        }
        res.clearCookie('refreshToken');
        res.clearCookie('accessToken');

        return res.status(HTTP_STATUS.OK).json({
            status: true,
            message: 'Logged out successfully.'
        })
    }catch(err){
        console.log(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error.'
        })
    }
}

const changePassword = async (req, res) => {
    try{
        const { oldPassword, newPassword} = req.body;
        const { userName } = req.user;
        const user = await User.findOne({userName});
        if(!user){
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: false,
                message: 'User not found.'
            })
        }

        const hashPass = await bcrypt.compare(oldPassword,user.password);
        if(!hashPass){
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                status: false,
                message: 'Old password is incorrect.'
            })
        }
        const salt = await bcrypt.genSalt(10);
        const hashedNewPass = await bcrypt.hash(newPassword, salt);

        user.password = hashedNewPass;
        await user.save();

        return res.status(HTTP_STATUS.OK).json({
            status: true,
            message: 'Password changed successfully.'
        })
    }catch(err){
        console.log(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error.'
        })
    }

}

const updateMetadata = async (req, res) => {    
    try{
        const {metadata} = req.body;
        const { userName } = req.user;

        if (!metadata || typeof metadata !== 'object') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                status: false,
                message: 'Invalid metadata'
            });
        }
        const user = await User.findOne({userName});
        if(!user){
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: false,
                message: 'User not found.'
            })
        }

        user.metadata = metadata;
        await user.save();

        return res.status(HTTP_STATUS.OK).json({
            status: true,
            message: 'Metadata updated successfully.'
        })
    } catch(err){
        console.log(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error.'
        })
    }
}

const publicMetadata = async (req, res) => {
    try{
        const {isPublic} = req.params;
        
        const { userName } = req.user;
        const user = await User.findOne({userName});
        
        if(!user){
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: false,
                message: 'User not found.'
            })
        }
        user.publicMetadata = isPublic === 'true';
        await user.save();
        return res.status(HTTP_STATUS.OK).json({
            status: true,
            message: 'Public metadata setting updated successfully.'
        })

    }catch (err) {
        console.log(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error.'
        })
    }
}

const refresh = async (req, res) => {
    try{
        const refreshToken = req.cookies?.refreshToken;
        if(!refreshToken){
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                status: false,
                message: 'Please log in again.'
            })
        }

        const decode = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
        const user = await User.findById(decode.userId);
        if(!user){
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: false,
                message: 'User not found.'
            })
        }
        const key = `refreshToken:${user.userName}`;
        const storedToken = await redis.get(key);
        if(!storedToken || refreshToken != storedToken){
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                status: false,
                message: 'Please log in again.'
            })
        }
        const newAccessToken = jwt.sign({
            userId: user._id,
            userName: user.userName,
        },
        process.env.JWT_ACCESS_SECRET,
        {expiresIn: '1h'});

        res.cookie("accessToken", newAccessToken,{
            httpOnly: true,
            maxAge: 60*60*1000,
            secure: true,
            sameSite: 'strict'

        })

        return res.status(HTTP_STATUS.OK).json({
            status: true,
            message: 'Access token refreshed successfully.'
        })
    }
    catch(err){
        console.log(err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: false,
            message: 'Internal server error.'
        })
    }
}
module.exports = {
    register,
    login,
    logout,
    changePassword,
    updateMetadata,
    publicMetadata,
    refresh,
    registerDto,
    loginDto,
    changePassDto
    
}