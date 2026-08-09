import React, { useState } from 'react';
import { Modal, Button, Input, Form, message, Alert } from 'antd';
import { ApiOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const API_BASE = "https://optionsbackend.onrender.com";

export default function ServerSettingsModal({ visible, onClose }) {
  const [loading, setLoading] = useState(false);
  const [fyersId, setFyersId] = useState("");
  const [fyersPin, setFyersPin] = useState("");
  const [totpKey, setTotpKey] = useState("");

  const handleTotpLogin = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/fyers/totp-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fyersId, fyersPin, totpKey })
      });
      const data = await resp.json();
      if (data.ok) {
        message.success("TOTP Login Successful! Fresh Token Active.");
        onClose();
      } else {
        message.error(data.error || "TOTP Login Failed.");
      }
    } catch (e) {
      message.error("Network Error: Could not connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<span><ApiOutlined /> Server & App Settings</span>}
      open={visible}
      onCancel={onClose}
      footer={null}
    >
      <div style={{ marginBottom: 20 }}>
        <h4>FYERS AUTOMATED 2FA / TOTP LOGIN</h4>
        <p style={{ color: '#888', fontSize: '13px' }}>
          Enter your Fyers details to instantly generate a daily token without opening a browser.
        </p>
        <Form layout="vertical">
          <Form.Item label="Fyers ID (e.g. XB15586)">
            <Input value={fyersId} onChange={e => setFyersId(e.target.value)} />
          </Form.Item>
          <Form.Item label="Fyers 4-Digit PIN">
            <Input.Password value={fyersPin} onChange={e => setFyersPin(e.target.value)} />
          </Form.Item>
          <Form.Item label="Fyers TOTP Key (32-chars)">
            <Input.Password value={totpKey} onChange={e => setTotpKey(e.target.value)} />
          </Form.Item>
          
          <Button 
            type="primary" 
            block 
            icon={<ReloadOutlined />} 
            loading={loading}
            onClick={handleTotpLogin}
          >
            ⚡ Generate Token via TOTP (Auto Login)
          </Button>
        </Form>
      </div>
      <Alert 
        message="Notice" 
        description="Fyers blocks auto-login on Cloud servers (Render). To use this button, you must run the backend on your Local PC, or generate via terminal using python backend/get_token.py." 
        type="warning" 
        showIcon 
      />
    </Modal>
  );
}
