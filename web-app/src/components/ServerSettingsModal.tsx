'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Settings, X, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';

export const ServerSettingsModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [loginUrl, setLoginUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  const checkStatus = async () => {
    try {
      const res = await api.getFyersTokenStatus();
      setStatus(res);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateUrl = async () => {
    setLoading(true);
    setMessage({ text: '', type: '' });
    try {
      // The Next.js rewrite will proxy this to the backend
      const res = await fetch('/api/fyers/login-url').then(r => r.json());
      if (res.loginUrl) {
        setLoginUrl(res.loginUrl);
        window.open(res.loginUrl, '_blank');
      } else {
        setMessage({ text: res.error || 'Failed to generate URL', type: 'error' });
      }
    } catch (e: any) {
      setMessage({ text: e.message || 'Error connecting to backend', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCode = async () => {
    if (!authCode.trim()) {
      setMessage({ text: 'Please paste the auth code or URL first', type: 'error' });
      return;
    }
    
    setLoading(true);
    setMessage({ text: '', type: '' });
    
    // Extract code if user pasted full URL
    let code = authCode.trim();
    if (code.includes('auth_code=')) {
      const match = code.match(/auth_code=([^&]+)/);
      if (match) code = match[1];
    }

    try {
      const res = await fetch('/api/fyers/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authCode: code })
      }).then(r => r.json());

      if (res.success || res.ok) {
        setMessage({ text: 'Token saved successfully! Connecting to stream...', type: 'success' });
        checkStatus();
        setTimeout(() => {
          window.location.reload(); // Reload to re-initialize sockets
        }, 1500);
      } else {
        setMessage({ text: res.error || 'Failed to save token', type: 'error' });
      }
    } catch (e: any) {
      setMessage({ text: e.message || 'Error saving token', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = status?.isValid || status?.fyersInitialized;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-border bg-bg-card-elevated">
          <h2 className="text-lg font-bold flex items-center text-text-primary">
            <Settings className="w-5 h-5 mr-2 text-primary" />
            Fyers Integration
          </h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary rounded-full hover:bg-bg-card transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Status Banner */}
          <div className={`p-3 rounded-lg border flex items-center ${isConnected ? 'bg-bullish-bg border-bullish/30 text-bullish' : 'bg-bearish-bg border-bearish/30 text-bearish'}`}>
            {isConnected ? <CheckCircle className="w-5 h-5 mr-2" /> : <AlertCircle className="w-5 h-5 mr-2" />}
            <div className="text-sm font-bold">
              {isConnected ? 'Fyers Token is Active' : 'Fyers Token is Expired / Missing'}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-text-secondary">Step 1: Generate Login URL</label>
            <p className="text-xs text-text-muted mb-2">Click below to open Fyers login in a new tab. After logging in, you will be redirected to an empty page. Copy the URL of that page.</p>
            <button 
              onClick={handleGenerateUrl}
              disabled={loading}
              className="bg-primary hover:bg-primary-hover text-bg-dark font-bold py-2.5 px-4 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {loading && !loginUrl ? 'Generating...' : 'Open Fyers Login'}
            </button>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-bold text-text-secondary">Step 2: Paste Auth Code</label>
            <p className="text-xs text-text-muted mb-2">Paste the copied URL (or just the auth_code part) below.</p>
            <input 
              type="text" 
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="https://trade.fyers.in/?auth_code=..."
              className="bg-bg-dark border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary placeholder-text-muted"
            />
            <button 
              onClick={handleSaveCode}
              disabled={loading || !authCode}
              className="bg-bg-card-elevated hover:bg-border border border-border text-text-primary font-bold py-2.5 px-4 rounded-lg mt-2 transition-colors disabled:opacity-50"
            >
              {loading && authCode ? 'Saving...' : 'Save Token'}
            </button>
          </div>

          {message.text && (
            <div className={`p-3 rounded-lg text-sm text-center ${message.type === 'error' ? 'text-bearish bg-bearish-bg' : 'text-bullish bg-bullish-bg'}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
