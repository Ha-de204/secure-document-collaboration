const { optional } = require('joi');
const mongoose = require('mongoose')

const Document = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required : true},
    title: {type: String, required: false},
    epoch: {type: Number, required: true},
    metadata: {type: Object},
    shareWith: [{
        userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        permissions: {type: String, enum: ['read', 'comment', 'write'], default: 'read'} 
        }],
    publicMetadata : {type: Boolean, required: true, default: false}
})
 
module.exports = mongoose.model('Document', Document);