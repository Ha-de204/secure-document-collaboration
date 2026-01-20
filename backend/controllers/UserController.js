const userService = require('../services/UserService');


const getUserByUserName = async (req, res) => {
        try {
            const { userName } = req.params;
            const user = await userService.findByUserName(userName);

            if (!user) {
                return res.status(404).json({ message: 'USER_NOT_FOUND' });
            }

            return res.status(200).json(user);
        } catch (error) {
            console.error('Get user info error:', error);
            return res.status(500).json({ message: 'SERVER_ERROR' });
        }
    }

const getUserById = async (req, res) => {
        try {
            const { userId } = req.params;
            const user = await userService.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'PUBLIC_KEY_NOT_FOUND' });
            }

            return res.status(200).json(user);
        } catch (error) {
            return res.status(500).json({ message: 'SERVER_ERROR' });
        }
    }

module.exports = {
    getUserById,
    getUserByUserName
}


