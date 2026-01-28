
import BlockCryptoModule from "./crypto/BlockManager";
import axios from 'axios';

  const handleInviteUser = async (inviteUserName) => {
    try {

      const token = localStorage.getItem('accessToken');
      const userId = localStorage.getItem('userId');

      // Tìm kiếm người dùng
      const inviteeRes = await axios.get(`${process.env.REACT_APP_API_URL}/users/username/${inviteUserName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const invitee = inviteeRes.data;
      if (!invitee) {
        alert("Không tìm thấy user này!");
        setSavingStatus('saved');
        return;
      }

      // Kiểm tra nếu user đã được mời
      const docRes = await axios.get(`${process.env.REACT_APP_API_URL}/documents/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const currentDoc = docRes.data.data;
      if (currentDoc.shareWith.some(s => s.userId === invitee._id || s.userId._id === invitee._id)) {
        alert("User này đã được mời rồi!");
        return;
      }

      // Mã hóa DRK bằng public key của người được mời
      const inviteePublicKey = invitee.identityKey || invitee.IdentityKey;
      if (!inviteePublicKey) {
        alert("Không thể lấy public key của user này!");
        setSavingStatus('saved');
        return;
      }
      const inviteeEncryptedKey = await BlockCryptoModule.encryptWithPublicKey(inviteePublicKey, drk);

      // Tạo payload lời mời
      const invitePayload = {
        documentId: id,
        inviteeId: invitee._id,
        // Bổ sung các trường Backend yêu cầu
        permission: 'write', 
       
        signature: await BlockCryptoModule.signData(`doc:${id}|user:${invitee._id}`, window.myPrivateKey),
        encryptedDrk: inviteeEncryptedKey
      };

      // Gửi lời mời lên server
      await axios.post(`${process.env.REACT_APP_API_URL}/invites`, invitePayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Phát sự kiện qua socket
      socket?.emit("document:invite", invitePayload);

      // Cập nhật danh sách shareWith
      const updatedShareWith = [...currentDoc.shareWith, invitee._id];
      await axios.patch(`${process.env.REACT_APP_API_URL}/documents/${id}`, {
        shareWith: updatedShareWith,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSavingStatus('saved');
      alert(`✅ Đã mời ${inviteUserName} thành công!`);
    } catch (error) {
      console.error("Lỗi khi mời user:", error);
      setSavingStatus('error');
      alert("Lỗi: " + (error.response?.data?.message || error.message));
    }
  };