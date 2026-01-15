import React, { useState, useEffect } from 'react';
import DocumentEditor from './DocumentEditor';
import Auth from './Auth';
import './styles/auth.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('accessToken'));
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL;
        // Gọi API refresh để lấy AccessToken mới từ RefreshToken trong Cookie
        const response = await fetch(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (response.ok) {
          const result = await response.json();
          // Backend của bạn trả về message thành công, Cookie accessToken tự động cập nhật
          setToken(localStorage.getItem('accessToken')); 
        } else {
          // Nếu RefreshToken hết hạn hoặc không có, bắt đăng nhập lại
          localStorage.removeItem('accessToken');
          setToken(null);
        }
      } catch (err) {
        console.error("Auth check failed", err);
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, []);

  if (isChecking) return <div>Đang tải phiên làm việc...</div>;

  return (
    <div className="App">
      {token ? (
        <DocumentEditor onLogout= {() => setToken(null)} />
      ) : (
        <Auth onAuthSuccess={(data) => setToken(data.token)} />
      )}
    </div>
  );
}

export default App;