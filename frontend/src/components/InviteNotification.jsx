import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './invites.css';
import BlockCryptoModule from '../crypto/BlockManager';

const InviteNotification = ({ onInviteAccepted, onClose }) => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingInvites();
  }, []);

  const fetchPendingInvites = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL}/invites/pending`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.status) {
        const invites = response.data.data || [];

        // Xác thực chữ ký của từng lời mời
        const verifiedInvites = [];
        for (const invite of invites) {
          const dataToVerify = `doc:${invite.documentId._id}|user:${invite.inviteeId}`;
          const isValid = await BlockCryptoModule.verifySignature(
            dataToVerify,
            invite.signature,
            invite.inviterId.identityKey
          );

          if (isValid) {
            verifiedInvites.push(invite);
          } else {
            console.warn(`❌ Chữ ký không hợp lệ cho lời mời từ ${invite.inviterId.userName}`);
          }
        }

        setInvites(verifiedInvites);
      }
    } catch (err) {
      console.error('Lỗi fetch pending invites:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId, documentId) => {
    try {
      const token = localStorage.getItem('accessToken');
      
      // 1. Accept invite trên server
      await axios.patch(
        `${process.env.REACT_APP_API_URL}/invites/${inviteId}/accept`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      console.log("✅ Lời mời đã được chấp nhận");
      
      // 2. Callback để update UI hoặc redirect
      if (onInviteAccepted) {
        onInviteAccepted(documentId);
      }
      
      // 3. Remove from local list
      setInvites(invites.filter(i => i._id !== inviteId));
      
    } catch (err) {
      console.error('Lỗi accept invite:', err);
      alert('Lỗi: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      const token = localStorage.getItem('accessToken');
      
      await axios.patch(
        `${process.env.REACT_APP_API_URL}/invites/${inviteId}/reject`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      setInvites(invites.filter(i => i._id !== inviteId));
    } catch (err) {
      console.error('Lỗi reject invite:', err);
    }
  };

  if (loading) {
    return <div className="invite-notification">Đang tải lời mời...</div>;
  }

  if (invites.length === 0) {
    return null;
  }

  return (
    <div className="invite-notification-overlay">
      <div className="invite-notification-modal">
        <div className="invite-header">
          <h2>📬 Lời Mời Tài Liệu ({invites.length})</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="invite-list">
          {invites.map((invite) => (
            <div key={invite._id} className="invite-item">
              <div className="invite-info">
                <p className="invite-from">
                  Từ: <strong>{invite.inviterId?.userName || 'Unknown'}</strong>
                </p>
                <p className="invite-doc">
                  Tài liệu: <strong>{invite.documentId?.title || 'Không có tiêu đề'}</strong>
                </p>
                <p className="invite-permission">
                  Quyền: <span className="perm-badge">{invite.permission}</span>
                </p>
                <p className="invite-time">
                  {new Date(invite.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>

              <div className="invite-actions">
                <button
                  className="btn-accept"
                  onClick={() => handleAcceptInvite(invite._id, invite.documentId._id)}
                >
                  ✓ Chấp Nhận
                </button>
                <button
                  className="btn-reject"
                  onClick={() => handleRejectInvite(invite._id)}
                >
                  ✕ Từ Chối
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InviteNotification;
