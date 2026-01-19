const express = require('express');
const router = express.Router();

const authController = require('../controllers/AuthController');
const auth = require('../middlewares/AuthMiddleware');
const userController = require('../controllers/UserController')
/*
const registerDto = Joi.object({
    userName: Joi.string().trim().min(3).max(100).required(),
    password: passwordComplexity(passwordOptions).required()
              .message('Password must be 8-30 characters long and include at least one uppercase letter, one lowercase letter, and one number.'),
    metadata: Joi.object().optional()
})

const loginDto = Joi.object({
    userName: Joi.string().trim(),
    password: Joi.string()
})

const changePassDto = Joi.object({
    oldPassword: Joi.string(),
    newPassword: passwordComplexity(passwordOptions).required()
})
*/
//const { userName, password, metadata } = req.body;
router.post('/register',authController.register);
//const {userName, password} = req.body;
router.post('/login',authController.login);
//const refreshToken = req.cookies?.refreshToken;
router.post('/logout',auth,authController.logout);
//const refreshToken = req.cookies?.refreshToken;
router.post('/refresh',authController.refresh);
//const { oldPassword, newPassword} = req.body;
router.put('/change-password',auth,authController.changePassword);
//const {metadata} = req.body;
router.put('/metadata',auth,authController.updateMetadata);
//const {isPublic} = req.params;
router.put('/metadata/public/:isPublic',auth,authController.publicMetadata);
router.get('/:id',userController.getUserById);
router.get('/:userName',userController.getUserByUserName)
module.exports = router