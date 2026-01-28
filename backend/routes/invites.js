var express = require('express');
var router = express.Router();
const inviteController = require('../controllers/InviteController');
const authMiddleware = require('../middlewares/AuthMiddleware');

// Require auth cho tất cả routes
router.use(authMiddleware);

// POST /invites - Tạo lời mời mới (owner gửi)
router.post('/', inviteController.createInvite);

// GET /invites/pending - Lấy danh sách lời mời chờ accept
router.get('/pending', inviteController.getPendingInvites);

// PATCH /invites/:inviteId/accept - Accept lời mời
router.patch('/:inviteId/accept', inviteController.acceptInvite);

// PATCH /invites/:inviteId/reject - Reject lời mời
router.patch('/:inviteId/reject', inviteController.rejectInvite);

// PATCH /invites/:inviteId/revoke - Owner revoke lời mời
router.patch('/:inviteId/revoke', inviteController.revokeInvite);

module.exports = router;
