import React, { useState } from 'react';
import { LogIn, UserPlus, Lock, User, Eye, EyeOff } from 'lucide-react';
import { sha256 } from 'js-sha256';
import { getDB } from './storage/indexDbService'; 

const bufferToBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const base64ToBuffer = (base64) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

// 1. Tạo Master Key từ password 
const deriveMasterKey = async (password, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// 2. Mã hóa Private Key
const encryptData = async (masterKey, plainText) => {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    masterKey,
    enc.encode(plainText)
  );
  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv)
  };
};

// 3. Giải mã Private Key
const decryptPrivateKey = async (password, userName, encryptedData) => {
  try {
    const masterKey = await deriveMasterKey(password, userName);
    const ciphertextBuffer = base64ToBuffer(encryptedData.ciphertext);
    const ivBuffer = base64ToBuffer(encryptedData.iv);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      masterKey,
      ciphertextBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    throw new Error("Không thể giải mã khóa bảo mật. Mật khẩu có thể sai hoặc dữ liệu bị lỗi.");
  }
};

const Auth = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ userName: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Hàm sinh cặp khóa và bảo mật bằng Master Key
  const generateAndStoreKeys = async (userName, password) => {
    const db = await getDB();
    
    // Bước 1: Sinh Identity Key Pair (ECDH P-256)
    const keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true, 
      ["deriveKey"]
    );

    // Bước 2: Export khóa
    const pubKeyBuf = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privKeyBuf = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    
    const publicKeyBase64 = bufferToBase64(pubKeyBuf);
    const privateKeyPlain = bufferToBase64(privKeyBuf);

    // Bước 3: Tạo Master Key từ Password (dùng userName làm Salt)
    const masterKey = await deriveMasterKey(password, userName);

    // Bước 4: Mã hóa Private Key bằng Master Key
    const encryptedPrivKey = await encryptData(masterKey, privateKeyPlain);

    // Bước 5: Lưu vào IndexedDB
    await db.put('identityKey', {
      id: 'current_user_keys',
      userName: userName,
      publicKey: publicKeyBase64,
      encryptedPrivateKey: encryptedPrivKey.ciphertext,
      iv: encryptedPrivKey.iv, 
      createdAt: new Date().toISOString()
    });

    return publicKeyBase64;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Băm mật khẩu tại Client trước khi gửi
    const clientHashedPassword = sha256(formData.password);

    try {
      const baseUrl = process.env.REACT_APP_API_URL;
      console.log("Base API URL:", baseUrl);

      if (!baseUrl) {
        alert("Lỗi: Không tìm thấy REACT_APP_API_URL. Hãy kiểm tra lại file .env và restart frontend!");
        return;
      }

      let payload = {
        userName: formData.userName,
        password: clientHashedPassword
      };

      if (!isLogin) {
        const identityPublicKey = await generateAndStoreKeys(
          formData.userName, 
          formData.password
        );
        payload.identityKey = identityPublicKey;
        payload.publicMetadata = false;
      }

      const endpoint = isLogin ? '/users/login' : '/users/register';
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.message || 'Có lỗi xảy ra');

      if (isLogin) {
        const db = await getDB();
        const storedKey = await db.get('identityKey', 'current_user_keys');

        if (storedKey) {
          await decryptPrivateKey(
            formData.password, 
            formData.userName, 
            { ciphertext: storedKey.encryptedPrivateKey, iv: storedKey.iv }
          );
          console.log("Giải mã Private Key thành công!");
        }
        
        // Lưu Token và Username (để hiển thị)
        const token = result.data;
        localStorage.setItem('accessToken', token);
        localStorage.setItem('currentUser', formData.userName);
        onAuthSuccess({ token, userName: formData.userName});
      } else {
        alert('Đăng ký thành công!');
        setIsLogin(true);
        setFormData({ ...formData, password: '' });
      }
    } catch (err) {
      setError(err.message);
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