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

  // 3. Hàm tạo Document thật để lấy ID hợp lệ (Dùng để test)
  const createTestDoc = async () => {
  try {
    const baseUrl = process.env.REACT_APP_API_URL;
    const res = await fetch(`${baseUrl}/documents`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title: "Tài liệu Test Cộng Tác", publicMetadata: false })
    });

    const responseData = await res.json();
    console.log("DỮ LIỆU PHẢN HỒI TỪ SERVER:", responseData);

    // Sửa điều kiện kiểm tra ở đây: lấy _id từ responseData.data
    if (responseData.status && responseData.data && responseData.data._id) {
      alert("Đã tạo Document thành công! Hệ thống sẽ chuyển bạn tới đó.");
      window.location.href = `/editor/${responseData.data._id}`;
    } else {
      alert("Lỗi: " + (responseData.message || "Không lấy được ID từ server"));
    }
  } catch (err) {
    alert("Lỗi khi tạo document: " + err.message);
  }
};

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setToken(null);
  };

  if (isChecking) return <div>Đang tải phiên làm việc...</div>;

  return (
   <BrowserRouter>
      <div className="App">
       {token && (
          <button 
            onClick={createTestDoc}
            style={{
              position: 'fixed', 
              bottom: '20px', 
              right: '20px', 
              zIndex: 9999, 
              padding: '12px 20px', 
              background: '#f1c40f',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          >
            ➕ Tạo Document Thật để Test
          </button>
        )}

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

