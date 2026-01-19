const mongoose = require('mongoose')

const User = new mongoose.Schema({
    userName: { type: String, required: true, unique: true, min:3, max:100 },
    password: {type: String, required: true},
    identityKey: { type: String, required: true },
    metadata: {type : Object},
    publicMetadata : {type: Boolean, required: true, default: false},
    createAt: {type: Date, default: Date.now}
});

module.exports = mongoose.model('User', User)
