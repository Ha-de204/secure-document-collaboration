const mongoose = require('mongoose')

const DocKey = new mongoose.Schema({
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    epoch: { type: Number, required: true },
    encryptedDocKey: {type: String, required: true},
    signature: { type: String, required: true }, // Added signature field back
    createAt: {type: Date, default: Date.now}
})
DocKey.index({ documentId: 1, userId: 1, epoch: 1 }, { unique: true });

module.exports = mongoose.model('DocKey', DocKey)