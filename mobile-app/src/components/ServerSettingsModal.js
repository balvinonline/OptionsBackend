import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, ActivityIndicator, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { getStoredSettings, setStoredSetting, CLOUD_SERVER_URL } from '../services/storage';
import { soundManager } from './AudioAlertHelper';
import { THEME } from '../constants/theme';

export const ServerSettingsModal = ({ visible, onClose }) => {
  const { serverUrl, updateServerUrl, logout, currentUser } = useAuth();
  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);

  React.useEffect(() => {
    setInputUrl(serverUrl);
    getStoredSettings().then((s) => {
      setSoundEnabled(s.soundEnabled);
      setHapticEnabled(s.hapticEnabled);
    });
  }, [visible, serverUrl]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.checkHealth(inputUrl);
      setTestResult({ success: true, message: `Connected! Status: ${res.status || 'OK'}` });
    } catch (e) {
      setTestResult({ success: false, message: `Failed: ${e.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('Error', 'Server URL cannot be empty');
      return;
    }
    await updateServerUrl(inputUrl);
    onClose();
  };

  const toggleSound = async (val) => {
    setSoundEnabled(val);
    await setStoredSetting('sound', val);
  };

  const toggleHaptic = async (val) => {
    setHapticEnabled(val);
    await setStoredSetting('haptic', val);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="settings" size={20} color={THEME.colors.primary} />
              <Text style={styles.title}>Server & App Settings</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Backend URL Input */}
          <Text style={styles.inputLabel}>LIVE BACKEND SERVER URL</Text>
          <Text style={styles.inputHelp}>
            24/7 Cloud URL or local PC address
          </Text>
          <TextInput
            style={styles.textInput}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder={CLOUD_SERVER_URL}
            placeholderTextColor={THEME.colors.textDisabled}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Test connection & result */}
          <View style={styles.testRow}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="wifi" size={14} color="#fff" />
                  <Text style={styles.testBtnText}>Test Ping</Text>
                </>
              )}
            </TouchableOpacity>

            {testResult ? (
              <Text style={[styles.resultText, testResult.success ? styles.successText : styles.errorText]}>
                {testResult.message}
              </Text>
            ) : null}
          </View>

          {/* Quick presets */}
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetBtn, styles.presetCloudBtn]}
              onPress={() => setInputUrl(CLOUD_SERVER_URL)}
            >
              <Ionicons name="cloud" size={12} color={THEME.colors.primary} />
              <Text style={[styles.presetText, { color: THEME.colors.primary }]}>☁️ Render Cloud (24/7)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetBtn}
              onPress={() => setInputUrl('http://10.0.2.2:5000')}
            >
              <Text style={styles.presetText}>Android Local</Text>
            </TouchableOpacity>
          </View>

          {/* Alert Preferences */}
          <View style={styles.divider} />
          <Text style={styles.inputLabel}>NOTIFICATION PREFERENCES</Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Audio Trading Alerts</Text>
              <Text style={styles.switchSubtitle}>Play chime sound on Bullish/Bearish signal triggers</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={toggleSound}
              trackColor={{ false: THEME.colors.border, true: THEME.colors.primary }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Haptic Vibration</Text>
              <Text style={styles.switchSubtitle}>Vibrate phone on trade gate change</Text>
            </View>
            <Switch
              value={hapticEnabled}
              onValueChange={toggleHaptic}
              trackColor={{ false: THEME.colors.border, true: THEME.colors.primary }}
            />
          </View>

          <TouchableOpacity style={styles.soundTestBtn} onPress={() => soundManager.testSound()}>
            <Ionicons name="volume-high" size={16} color={THEME.colors.primary} />
            <Text style={styles.soundTestText}>Test Audio Alert</Text>
          </TouchableOpacity>

          {/* Bottom Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save & Reconnect</Text>
            </TouchableOpacity>
          </View>

          {/* User info & Logout */}
          <View style={styles.logoutRow}>
            <Text style={styles.userText}>Logged in as: {currentUser}</Text>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={14} color={THEME.colors.bearish} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0c2436',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  closeBtn: {
    padding: 4,
  },
  inputLabel: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inputHelp: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: THEME.colors.bgDark,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    color: THEME.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgCardElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  testBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  resultText: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  successText: {
    color: THEME.colors.bullish,
  },
  errorText: {
    color: THEME.colors.bearish,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  presetBtn: {
    backgroundColor: THEME.colors.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  presetCloudBtn: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#0a304a',
  },
  presetText: {
    color: THEME.colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.borderLight,
    marginVertical: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  switchTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  switchSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  soundTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: THEME.colors.bgCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  soundTestText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  actions: {
    marginTop: 18,
  },
  saveBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#071a26',
    fontSize: 14,
    fontWeight: '900',
  },
  logoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderLight,
  },
  userText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logoutText: {
    color: THEME.colors.bearish,
    fontSize: 12,
    fontWeight: '800',
  },
});
