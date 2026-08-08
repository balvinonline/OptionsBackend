import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  ActivityIndicator,
  Alert,
  Switch,
  ScrollView,
} from 'react-native';
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

  // TOTP Login state
  const [fyersId, setFyersId] = useState('');
  const [fyersPin, setFyersPin] = useState('');
  const [totpKey, setTotpKey] = useState('');
  const [isTotpLoading, setIsTotpLoading] = useState(false);
  const [totpStatus, setTotpStatus] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);

  React.useEffect(() => {
    if (visible) {
      setInputUrl(serverUrl);
      getStoredSettings().then((s) => {
        setSoundEnabled(s.soundEnabled);
        setHapticEnabled(s.hapticEnabled);
      });
      checkTokenStatus();
    }
  }, [visible, serverUrl]);

  const checkTokenStatus = async () => {
    try {
      const res = await api.getFyersTokenStatus();
      setTotpStatus(res);
    } catch {
      // silent
    }
  };

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

  const handleTotpAutoLogin = async () => {
    setIsTotpLoading(true);
    try {
      const payload = {};
      if (fyersId.trim()) payload.fyersId = fyersId.trim();
      if (fyersPin.trim()) payload.fyersPin = fyersPin.trim();
      if (totpKey.trim()) payload.totpKey = totpKey.trim();

      const res = await api.totpLogin(payload);
      if (res && res.ok) {
        Alert.alert('✅ Success', 'Fyers Token generated automatically via TOTP! Live market stream is now active.');
        checkTokenStatus();
      } else {
        Alert.alert('❌ TOTP Login Failed', res?.error || 'Please check your Fyers credentials.');
      }
    } catch (e) {
      Alert.alert('❌ Error', e.response?.data?.error || e.message || 'Failed to communicate with server.');
    } finally {
      setIsTotpLoading(false);
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Backend URL Input */}
            <Text style={styles.inputLabel}>LIVE BACKEND SERVER URL</Text>
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

            {/* Fyers Automated TOTP Section */}
            <View style={styles.divider} />
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.inputLabel}>FYERS AUTOMATED 2FA / TOTP LOGIN</Text>
              <View style={[styles.tokenBadge, totpStatus?.accessTokenPresent ? styles.tokenActive : styles.tokenExpired]}>
                <Text style={styles.tokenBadgeText}>
                  {totpStatus?.accessTokenPresent ? '● TOKEN ACTIVE' : '○ TOKEN EXPIRED'}
                </Text>
              </View>
            </View>

            <Text style={styles.inputHelp}>
              Enter your Fyers ID, PIN, and TOTP key once to auto-refresh access tokens in 1-tap:
            </Text>

            <TextInput
              style={styles.textInput}
              value={fyersId}
              onChangeText={setFyersId}
              placeholder="Fyers User ID (e.g. XA12345)"
              placeholderTextColor={THEME.colors.textDisabled}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TextInput
              style={styles.textInput}
              value={fyersPin}
              onChangeText={setFyersPin}
              placeholder="4-Digit Fyers Login PIN"
              placeholderTextColor={THEME.colors.textDisabled}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={4}
            />

            <TextInput
              style={styles.textInput}
              value={totpKey}
              onChangeText={setTotpKey}
              placeholder="TOTP Secret Key (from Fyers 2FA setup)"
              placeholderTextColor={THEME.colors.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={styles.totpBtn}
              onPress={handleTotpAutoLogin}
              disabled={isTotpLoading}
            >
              {isTotpLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash" size={16} color="#071a26" />
                  <Text style={styles.totpBtnText}>Generate Token via TOTP (Auto Login)</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Alert Preferences */}
            <View style={styles.divider} />
            <Text style={styles.inputLabel}>NOTIFICATION PREFERENCES</Text>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Audio Trading Alerts</Text>
                <Text style={styles.switchSubtitle}>Play chime sound on signal triggers</Text>
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

            {/* Save & Reconnect */}
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
          </ScrollView>
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
    maxHeight: '92%',
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
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  inputLabel: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inputHelp: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    marginBottom: 8,
  },
  tokenBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tokenActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  tokenExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  tokenBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  textInput: {
    backgroundColor: '#071a26',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.colors.textPrimary,
    fontSize: 13,
    marginBottom: 8,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.colors.primaryDark,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  testBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  resultText: {
    fontSize: 12,
    fontWeight: '600',
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
    marginBottom: 12,
  },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#071a26',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingVertical: 8,
    borderRadius: 8,
  },
  presetCloudBtn: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  presetText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  totpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  totpBtnText: {
    color: '#071a26',
    fontSize: 13,
    fontWeight: '900',
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  switchSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  soundTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#071a26',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  soundTestText: {
    color: THEME.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    marginTop: 16,
  },
  saveBtn: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
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
    borderTopColor: THEME.colors.border,
  },
  userText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  logoutText: {
    color: THEME.colors.bearish,
    fontSize: 12,
    fontWeight: '700',
  },
});
