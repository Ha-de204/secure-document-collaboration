import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import DocumentEditor from './DocumentEditor';
import Auth from './Auth';
import './styles/auth.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  const [token, setToken] = useState(localStorage.getItem('accessToken'));
  const [socket, setSocket] = useState(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // 1. check phiên làm viêc
    const checkAuth = async () => {
      try {
        const baseUrl = process.env.REACT_APP_API_URL;
        // Gọi API refresh để lấy AccessToken mới từ RefreshToken trong Cookie
        const response = await fetch(`${baseUrl}/users/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.accessToken) {
            localStorage.setItem('accessToken', data.accessToken);
            setToken(data.accessToken); 
          }
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

  // 2. Quản lý kết nối Socket khi có Token
  useEffect(() => {
   if (token) {
      const baseUrl = process.env.REACT_APP_API_URL;
      const newSocket = io(baseUrl, {
        auth: { token: token },
        withCredentials: true,
        transports: ['polling', 'websocket']
      });
      setSocket(newSocket);
      return () => newSocket.disconnect();
    }else {
      setSocket(null);
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setToken(null);
  };

  if (isChecking) return <div>Đang tải phiên làm việc...</div>;

  return (
   <BrowserRouter>
      <div className="App">
        <Routes>
          {!token ? (
            // Route cho người chưa đăng nhập
            <Route path="*" element={
              <Auth onAuthSuccess={(data) => {
                localStorage.setItem('accessToken', data.token);
                setToken(data.token);
              }} />
            } />
          ) : (
            // Route cho người đã đăng nhập
            <>
              {/* Trang Editor với ID động */}
              <Route 
                path="/editor/:id" 
                element={
                  socket ? (
                    <DocumentEditor socket={socket} onLogout={handleLogout} />
                  ) : (
                    <div className="loading-screen">Đang thiết lập kết nối an toàn...</div>
                  )
                } 
              />
              
              {/* Nếu vào trang chủ, chuyển hướng đến một ID mẫu (để tránh lỗi undefined) 
                  Hoặc bạn có thể tạo trang Dashboard liệt kê danh sách tài liệu tại đây */}
              <Route path="/" element={<Navigate to="/editor/60d5ecfd7ad167123456789a" />} />
            </>
          )}
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

