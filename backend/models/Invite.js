const mongoose = require('mongoose')

const Invite = new mongoose.Schema({
    documentId : {type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true},      
    inviterId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    inviteeId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true} ,      
    permission: {type: String, enum: ['read', 'comment', 'write'], default: 'read' },        
    status: {type: String, enum: ['pending','accepted','rejected','expired', 'revoked'], default: 'pending' },
    createdAt: { type: Date, default: Date.now, expires: '1d' },
    expireAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },  
    
    inviteHash: { type: String, required: true},
    signature: { type: String, required: true }
})
 
module.exports = mongoose.model('Invite', Document);