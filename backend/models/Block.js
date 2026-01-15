const { required } = require('joi');
const mongoose = require('mongoose')

const Block = new mongoose.Schema({
    blockId: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' ,required: true},
    index: { type: Number, required: true },
    version: { type: Number, required: true},
    cipherText: { type: String, required: true },
    prevHash: {type: String, required: true},
    hash: { type: String, required: true }
})

module.exports = mongoose.model('Block', Block);