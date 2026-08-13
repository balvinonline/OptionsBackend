import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notification } from 'antd';
import './LoginPage.css';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In production, point to the actual backend URL
      // Since it's a proxy in Vite usually, we can just use /api/login
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('authUser', username || 'Admin');
        setShowWelcome(true);
        setTimeout(() => {
          onLoginSuccess(data.token, username || 'Admin');
          navigate('/');
        }, 2000); // Wait 2s for welcome animation
      } else {
        notification.error({
          message: 'Login Failed',
          description: data.message || 'Invalid credentials'
        });
        setLoading(false);
      }
    } catch {
      notification.error({
        message: 'Network Error',
        description: 'Unable to connect to the backend server.'
      });
      setLoading(false);
    }
  };

  if (showWelcome) {
    return (
      <div className="login-container">
        <div className="welcome-splash">
          <h2>Welcome, {username}</h2>
          <div className="spinner"></div>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Terminal Access</h1>
          <p>Please log in to continue</p>
        </div>
        
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label>Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              placeholder="Enter username"
              autoComplete="username"
              required 
            />
          </div>
          
          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Enter password"
              autoComplete="current-password"
              required 
            />
          </div>
          
          <button type="submit" disabled={loading} className="login-btn">
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
