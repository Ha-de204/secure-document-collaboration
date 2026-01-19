const User = require('../models/User')


const findByUserName = async (userName) => {
    return User.findOne({ userName })
}
const findById = async (userId) => {
    return User.findById(userId).lean()
}
const getIdentityKey = async (userId) => {
    const user = await User.findById(userId).select('identityKey').lean()
    if (!user) return null
    return user.identityKey
}
 
module.exports = {
    findByUserName,
    findById,
    getIdentityKey
}
