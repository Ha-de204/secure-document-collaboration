import React, { useState } from 'react';
import { LogIn, UserPlus, Lock, User, Eye, EyeOff } from 'lucide-react';
import { sha256 } from 'js-sha256';
import { getDB } from "./storage/indexDbService";

import { initIdentity, unlockIdentity } from "./crypto/IdentityManager";
import { getMyKey } from './services/IdentityKy';

const Auth = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ userName: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Băm mật khẩu tại Client trước khi gửi
    const clientHashedPassword = sha256(formData.password);

    try {
      const baseUrl = process.env.REACT_APP_API_URL;
      if (!baseUrl) {
        alert("Lỗi: Không tìm thấy REACT_APP_API_URL. Hãy kiểm tra lại file .env và restart frontend!");
        return;
      }

      let payload = {
        userName: formData.userName,
        password: clientHashedPassword
      };

      if (!isLogin) {
        const identityPublicKey = await initIdentity(
          formData.userName, 
          formData.password
        );
        payload.identityKey = identityPublicKey;
      }

      const endpoint = isLogin ? '/users/login' : '/users/register';
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      console.log("HTTP status:", response.status);
      console.log("Response result:", result);

      if (!response.ok) throw new Error(result.message || 'Có lỗi xảy ra');

      if (isLogin) {
        // 1. Lưu thông tin cơ bản trước để đảm bảo không bị trống
        const token = result.data;
        const user = result.user;

        if (typeof token !== "string" || !user?._id) {
          throw new Error("Dữ liệu đăng nhập không hợp lệ");
        }

        const currentUserId = user._id || user.id;
        const currentUserName = user.userName || formData.userName;

        localStorage.setItem("accessToken", token);
        localStorage.setItem("userId", user._id || user.id || user.userId);
        localStorage.setItem("userName", user.userName || formData.userName);
        localStorage.setItem("currentUser", JSON.stringify(user));

        console.log("LocalStorage:", localStorage);

        // 2. Mới tiến hành mở khóa Identity
        try {
          await unlockIdentity(currentUserName, formData.password);
          const pubKey = await initIdentity(currentUserName, formData.password);
          const db = await getDB();
          await db.put('publicKeys', {
            userId: currentUserId,
            userName: currentUserName,
            publicKey: pubKey,
            createdAt: new Date()
          });
          console.log("✅ Đã đồng bộ Public Key vào IndexedDB");
        } catch (cryptoErr) {
          console.error("Lỗi giải mã Identity nhưng vẫn cho vào trang chính:", cryptoErr);
        }
        // 3. Thông báo thành công
        onAuthSuccess({ token, user });
      } else {
        alert('Đăng ký thành công!');
        setIsLogin(true);
        setFormData({ ...formData, password: '' });
      }
    } catch (err) {
      setError(err.message);
      localStorage.removeItem('accessToken');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon-circle">
            {isLogin ? <LogIn size={28} /> : <UserPlus size={28} />}
          </div>
          <h2>{isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}</h2>
          <p>{isLogin ? 'Chỉ bạn mới có thể mở khóa tài liệu của mình' : 'Bắt đầu bảo mật tài liệu của bạn ngay hôm nay'}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <User className="input-icon" size={18} />
            <input
              type="text"
              placeholder="UserName"
              required
              value={formData.userName}
              onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
            />
          </div>

          <div className="input-group">
            <Lock className="input-icon" size={18} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            <button 
              type="button" 
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Đang xử lý...' : (isLogin ? 'Đăng nhập' : 'Đăng ký')}
          </button>
        </form>

        <div className="auth-footer">
          <button onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đăng nhập tại đây'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;