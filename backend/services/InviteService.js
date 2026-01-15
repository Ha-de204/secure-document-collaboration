const Invite = require('../models/Invite');
const Document = require('../models/Document');

const searchInvites = async ({
  documentId = null,
  inviterId = null,
  inviteeId = null,
  status = null
}) => {
  const query = {};

  if (documentId) {
    query.documentId = documentId;
  }

  if (inviterId) {
    query.inviterId = inviterId;
  }

  if (inviteeId) {
    query.inviteeId = inviteeId;
  }

  if (status) {
    query.status = status;
  }

  const invites = await Invite.find(query)
    .populate('documentId')
    .populate('inviterId', 'username')
    .populate('inviteeId', 'username')
    .sort({ createdAt: -1 })
    .lean();

  return {
    status: true,
    data: invites
  }
};

const createInvite = async ({
  documentId,
  inviterId,
  inviteeId,
  permission
}) => {

  const doc = await Document.findById(documentId);
  if (!doc.ownerId.equals(inviterId)) {
    return {
        status: false,
        error: 'FORBIDDEN_ACCESS'
    }
  }

  const exists = await Invite.findOne({
    documentId,
    inviteeId,
    status: 'pending'
  });
  if (exists) return{
    status: false,
    error: 'INVITE_ALREADY_EXISTS'
  };

  const invite = await Invite.create({
    documentId,
    inviterId,
    inviteeId,
    permission,
    expiresAt: Date.now() + 1 * 24 * 3600 * 1000
  });

  return {
    status: true,
    data: invite
  }
};

const acceptInvite = async ({ inviteId, userId }) => {
    const invite = await Invite.findById(inviteId);
    if (!invite || invite.status !== 'pending')
        throw new Error('Invalid invite');

    if (!invite.inviteeId.equals(userId))
        return {
        status: false,
        error: 'FORBIDDEN_ACCESS'
        };

    
    doc.shareWith.push({
        userId: userId,
        permission: invite.permission
    });
    await doc.save();

  invite.status = 'accepted';
  invite.acceptedAt = new Date();
  await invite.save();

  return {
    status: true,
    data: invite
  }
};
const revokeInvite = async ({ inviteId, userId }) => {
  const invite = await Invite.findById(inviteId);
  if (!invite) return{
    status: false,
    error: 'INVITE_NOT_FOUND'
  };

  if (!invite.inviterId.equals(userId))
    return{
      status: false,
      error: 'FORBIDDEN_ACCESS'
    }

  invite.status = 'revoked';
  invite.revokedAt = new Date();
  await invite.save();

  return invite;
};

module.exports = {
    createInvite,
    acceptInvite,
    revokeInvite
};