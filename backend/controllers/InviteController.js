const inviteService = require('../services/InviteService');
const socketManager = require('../sockets/Socket');

const createInvite = async (req, res) => {
  try {
    const inviterId = req.user.userId;
    const { documentId, inviteeId, permission } = req.body;

    // Generate invite hash and signature
    const inviteHash = crypto.randomBytes(32).toString('hex');
    const signature = crypto.createSign('SHA256').update(inviteHash).sign(process.env.PRIVATE_KEY, 'hex');

    const result = await inviteService.createInvite({
      documentId,
      inviterId,
      inviteeId,
      permission: permission || 'write',
      inviteHash,
      signature
    });

    if (!result.status) {
      const statusCode = result.error === 'FORBIDDEN_ACCESS' ? 403 : 400;
      return res.status(statusCode).json({
        status: false,
        message: result.error
      });
    }

    // Notify invitee if online
    socketManager.notifyUser(inviteeId, 'invite:new', { documentId, inviterId, permission });

    return res.status(201).json(result);
  } catch (err) {
    console.error('[InviteController][createInvite]', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const getPendingInvites = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await inviteService.searchInvites({
      inviteeId: userId,
      status: 'pending'
    });

    return res.json(result);
  } catch (err) {
    console.error('[InviteController][getPendingInvites]', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const acceptInvite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { inviteId } = req.params;

    const result = await inviteService.acceptInvite({
      inviteId,
      userId
    });

    if (!result.status) {
      const statusCode = result.error === 'FORBIDDEN_ACCESS' ? 403 : 400;
      return res.status(statusCode).json({
        status: false,
        message: result.error
      });
    }

    return res.json({
      status: true,
      message: 'Invite accepted successfully',
      data: result.data
    });
  } catch (err) {
    console.error('[InviteController][acceptInvite]', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const rejectInvite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { inviteId } = req.params;

    // Kiểm tra trước
    const Invite = require('../models/Invite');
    const invite = await Invite.findById(inviteId);
    
    if (!invite) {
      return res.status(404).json({
        status: false,
        message: 'INVITE_NOT_FOUND'
      });
    }

    if (invite.inviteeId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: false,
        message: 'FORBIDDEN_ACCESS'
      });
    }

    invite.status = 'rejected';
    invite.rejectedAt = new Date();
    await invite.save();

    return res.json({
      status: true,
      message: 'Invite rejected',
      data: invite
    });
  } catch (err) {
    console.error('[InviteController][rejectInvite]', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

const revokeInvite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { inviteId } = req.params;

    const result = await inviteService.revokeInvite({
      inviteId,
      userId
    });

    if (!result.status) {
      const statusCode = result.error === 'FORBIDDEN_ACCESS' ? 403 : 404;
      return res.status(statusCode).json({
        status: false,
        message: result.error
      });
    }

    return res.json({
      status: true,
      message: 'Invite revoked',
      data: result
    });
  } catch (err) {
    console.error('[InviteController][revokeInvite]', err);
    return res.status(500).json({
      status: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  createInvite,
  getPendingInvites,
  acceptInvite,
  rejectInvite,
  revokeInvite
};
