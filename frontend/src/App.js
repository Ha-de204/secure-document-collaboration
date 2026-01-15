import React, { useState } from 'react';
import DocumentEditor from './DocumentEditor';
import Auth from './Auth';
import './styles/auth.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const handleAuthSuccess = (data) => {
    setToken(data.token);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    setToken(null);
  };

  return (
    <div className="App">
      {token ? (
        <DocumentEditor onLogout={handleLogout} />
      ) : (
        <Auth onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}

export default App;