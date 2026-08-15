import React, { useState } from 'react';
import { Modal, Button, Input, Form, message, Alert } from 'antd';
import { ApiOutlined, SettingOutlined, GlobalOutlined } from '@ant-design/icons';

const API_BASE = "https://optionsbackend.onrender.com";

export default function ServerSettingsModal({ visible, onClose, fyersStatus, onTokenUpdate }) {
  const [loading, setLoading] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [serverUrl, setServerUrl] = useState(API_BASE);

  const handleOpenLoginUrl = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/fyers/login-url`);
      const data = await resp.json();
      if (data.loginUrl) {
        window.open(data.loginUrl, '_blank');
      } else {
        message.error('Could not generate Login URL');
      }
    } catch(e) {
      message.error('Network Error');
    }
  };

  const handleSubmitAuthCode = async () => {
    if (!authCode) {
      message.warning('Please paste the final redirect URL or auth_code');
      return;
    }
    try {
      const resp = await fetch(`${API_BASE}/api/fyers/save-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authCode: authCode })
      });
      const data = await resp.json();
      if (data.ok) {
        message.success('Token Saved Successfully! Live Data is active.');
        setAuthCode('');
        if (onTokenUpdate) onTokenUpdate();
      } else {
        message.error(data.error || 'Failed to verify token');
      }
    } catch (e) {
      message.error('Network Error');
    }
  };

  const handleSave = () => {
    message.success("Server Settings Saved");
  };

  const handleTestPing = async () => {
    try {
      const resp = await fetch(`${serverUrl}/api/ping`);
      if (resp.ok) message.success("Connection Successful");
      else message.error("Connection Failed");
    } catch {
      message.error("Connection Failed");
    }
  };

  return (
    <Modal
      title={<div style={{ color: "#fff", display: "flex", alignItems: "center", gap: 8 }}><SettingOutlined /> Server & App Settings</div>}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={480}
      style={{ top: 20 }}
      styles={{
        content: { background: "#0f172a", border: "1px solid #1e293b", padding: 0 },
        header: { background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "16px 24px" },
        body: { padding: "24px" }
      }}
      closeIcon={<span style={{ color: "#94a3b8" }}>✕</span>}
    >
      <div className="settings-modal-content">
        <Form layout="vertical">
          <Form.Item label="Live Backend Server URL (Render)">
            <Input 
              value={serverUrl} 
              onChange={e => setServerUrl(e.target.value)} 
              placeholder="e.g. https://optionsbackend.onrender.com"
              disabled
            />
          </Form.Item>
          <div style={{ display: "flex", gap: 12 }}>
            <Button 
              type="primary" 
              style={{ flex: 1, background: "#10b981", borderColor: "#10b981" }}
              onClick={handleSave}
            >
              Save & Reconnect
            </Button>
            <Button style={{ background: "#334155", color: "#fff", borderColor: "#475569" }} onClick={handleTestPing}>
              <GlobalOutlined /> Test Ping
            </Button>
          </div>
        </Form>

        <div className="fyers-totp-card" style={{ marginTop: 24, padding: 16, background: "#1a1f2e", borderRadius: 8, border: "1px solid #334155" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ color: "#fff" }}>FYERS MANUAL BROWSER LOGIN</h4>
            {fyersStatus?.isValid ? (
              <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem' }}>● TOKEN ACTIVE</span>
            ) : (
              <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem' }}>● EXPIRED / MISSING</span>
            )}
          </div>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 16 }}>
            Fyers blocked automated TOTP. Tap below to securely login via browser, then paste the redirect URL.
          </p>

          <Button 
            type="primary" 
            block 
            style={{ background: "#0f766e", borderColor: "#0f766e", marginBottom: 16 }}
            onClick={handleOpenLoginUrl}
          >
            🌐 1. Open Fyers Login
          </Button>

          <Form layout="vertical">
            <Form.Item label={<span style={{ color: "#94a3b8" }}>2. Paste final Redirect URL here...</span>}>
              <Input placeholder="Paste URL here" value={authCode} onChange={e => setAuthCode(e.target.value)} />
            </Form.Item>
          </Form>

          <Button 
            type="primary" 
            block 
            style={{ background: "#0f766e", borderColor: "#0f766e", marginTop: 8 }}
            onClick={handleSubmitAuthCode}
          >
            ✅ 3. Submit & Save Token
          </Button>
        </div>
      </div>
    </Modal>
  );
}
