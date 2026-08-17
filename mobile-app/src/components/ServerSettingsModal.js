import React, { useRef, useState } from 'react';
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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { getStoredSettings, setStoredSetting, CLOUD_SERVER_URL, normalizeServerUrl } from '../services/storage';
import { soundManager } from './AudioAlertHelper';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ServerSettingsModal = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { serverUrl, updateServerUrl, logout, currentUser } = useAuth();
  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [totpStatus, setTotpStatus] = useState(null);

  // WebView Login State
  const [isTotpLoading, setIsTotpLoading] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const [authInput, setAuthInput] = useState('');
  const isProcessingRef = useRef(false);

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

  const startWebViewLogin = async () => {
    try {
      setIsTotpLoading(true);
      isProcessingRef.current = false;
      const targetUrl = normalizeServerUrl(inputUrl || serverUrl);
      setInputUrl(targetUrl);
      const resp = await fetch(`${targetUrl}/api/fyers/login-url`, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'localtunnel-bypass': 'true'
        }
      });
      const data = await resp.json();
      if (data.loginUrl) {
        setLoginUrl(data.loginUrl);
        const canOpen = await Linking.canOpenURL(data.loginUrl);
        if (canOpen) {
          await Linking.openURL(data.loginUrl);
          Alert.alert(
            'Fyers Login Opened',
            'Complete login in browser. After redirect, copy the final URL or auth_code and paste it here.'
          );
        } else {
          setShowWebView(true);
        }
      } else {
        Alert.alert('Error', data.error || 'Could not generate Login URL. Check backend keys.');
      }
    } catch(e) {
      Alert.alert('Network Error', 'Cannot reach backend server to generate login URL.');
    } finally {
      setIsTotpLoading(false);
    }
  };

  const onWebViewNavigation = async (navState) => {
    const { url } = navState;
    if (url.includes('auth_code=') || url.includes('code=')) {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setShowWebView(false);
      handleSubmitAuthCode(url);
    } else if (url.includes('error=')) {
      setShowWebView(false);
      Alert.alert('Login Failed', 'Fyers returned an error or login was cancelled.');
    }
  };

  const handleSubmitAuthCode = async (finalUrl) => {
    if (!String(finalUrl || '').trim()) {
      Alert.alert('Missing Code', 'Paste the Fyers final URL or auth_code first.');
      return;
    }
    setIsTotpLoading(true);
    try {
      const targetUrl = normalizeServerUrl(inputUrl || serverUrl);
      const resp = await fetch(`${targetUrl}/api/fyers/save-token`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'localtunnel-bypass': 'true'
        },
        body: JSON.stringify({ authCode: finalUrl })
      });
      const data = await resp.json();
      if (data.ok) {
        Alert.alert('✅ Success', 'Token Generated & Saved Successfully! Live Data is active.');
        if (data.access_token) {
          await AsyncStorage.setItem('FYERS_CACHED_TOKEN', data.access_token);
        }
        checkTokenStatus();
      } else {
        Alert.alert('❌ Error', data.error || 'Failed to verify token');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Could not connect to server.');
    } finally {
      setIsTotpLoading(false);
    }
  };

  const handleSave = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('Error', 'Server URL cannot be empty');
      return;
    }
    const cleanUrl = normalizeServerUrl(inputUrl);
    setInputUrl(cleanUrl);
    await updateServerUrl(cleanUrl);
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
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="settings" size={20} color={theme.colors.primary} />
                <Text style={styles.title}>Server & App Settings</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
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
                placeholderTextColor={theme.colors.textDisabled}
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
                  <Ionicons name="cloud" size={12} color={theme.colors.primary} />
                  <Text style={[styles.presetText, { color: theme.colors.primary }]}>Cloud Server</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.presetBtn}
                  onPress={() => setInputUrl('http://10.0.2.2:5000')}
                >
                  <Text style={styles.presetText}>Android Local</Text>
                </TouchableOpacity>
              </View>

              {/* Secure In-App Fyers Login */}
              <View style={styles.divider} />
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.inputLabel}>FYERS SECURE BROKER LOGIN</Text>
                <View style={[styles.tokenBadge, totpStatus?.accessTokenPresent ? styles.tokenActive : styles.tokenExpired]}>
                  <Text style={styles.tokenBadgeText}>
                    {totpStatus?.accessTokenPresent ? '● TOKEN ACTIVE' : '○ TOKEN EXPIRED'}
                  </Text>
                </View>
              </View>

              <Text style={styles.inputHelp}>
                Tap the button below to securely login to your Fyers account. The app will automatically intercept the token and connect you to the live market!
              </Text>

              <TouchableOpacity
                style={styles.totpBtn}
                onPress={startWebViewLogin}
                disabled={isTotpLoading}
              >
                {isTotpLoading ? (
                  <ActivityIndicator size="small" color="#071a26" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={18} color="#071a26" />
                    <Text style={styles.totpBtnText}>Secure In-App Fyers Login</Text>
                  </>
                )}
              </TouchableOpacity>

              <TextInput
                style={styles.authInput}
                placeholder="Paste Fyers final URL or auth_code"
                placeholderTextColor={theme.colors.textDisabled}
                value={authInput}
                onChangeText={setAuthInput}
                autoCapitalize="none"
                multiline
              />
              <TouchableOpacity
                style={styles.authSaveBtn}
                onPress={() => handleSubmitAuthCode(authInput)}
                disabled={isTotpLoading}
              >
                <Ionicons name="key" size={16} color={theme.colors.primary} />
                <Text style={styles.authSaveText}>Save Pasted Token</Text>
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
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
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
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>

              <TouchableOpacity style={styles.soundTestBtn} onPress={() => soundManager.testSound()}>
                <Ionicons name="volume-high" size={16} color={theme.colors.primary} />
                <Text style={styles.soundTestText}>Test Audio Alert</Text>
              </TouchableOpacity>

              {/* Save & Reconnect */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Save Settings</Text>
                </TouchableOpacity>
              </View>

              {/* User info & Logout */}
              <View style={styles.logoutRow}>
                <Text style={styles.userText}>Logged in as: {currentUser}</Text>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                  <Ionicons name="log-out-outline" size={14} color={theme.colors.bearish} />
                  <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Embedded Browser for seamless auth token interception */}
      <Modal visible={showWebView} animationType="slide" onRequestClose={() => setShowWebView(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.webViewHeader}>
            <Text style={styles.webViewTitle}>Secure Fyers Login</Text>
            <TouchableOpacity onPress={() => setShowWebView(false)} style={styles.webViewClose}>
              <Text style={styles.webViewCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: loginUrl }}
            onNavigationStateChange={onWebViewNavigation}
            onShouldStartLoadWithRequest={(request) => {
              onWebViewNavigation(request);
              return true;
            }}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.webViewLoader}>
                <ActivityIndicator size="large" color="#0f766e" />
                <Text style={{ marginTop: 10, color: '#666' }}>Loading Secure Login...</Text>
              </View>
            )}
          />
        </View>
      </Modal>
    </>
  );
};

const getStyles = (theme) => StyleSheet.create({
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
    borderTopColor: theme.colors.border,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: theme.colors.textPrimary,
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
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inputHelp: {
    color: theme.colors.textSecondary,
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
    color: theme.colors.textPrimary,
  },
  textInput: {
    backgroundColor: '#071a26',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.primaryDark,
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
    color: theme.colors.bullish,
  },
  errorText: {
    color: theme.colors.bearish,
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
    borderColor: theme.colors.border,
    paddingVertical: 8,
    borderRadius: 8,
  },
  presetCloudBtn: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  presetText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  totpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
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
  authInput: {
    backgroundColor: '#071a26',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    color: theme.colors.textPrimary,
    fontSize: 12,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  authSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#071a26',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingVertical: 9,
    borderRadius: 9,
  },
  authSaveText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  switchSubtitle: {
    color: theme.colors.textMuted,
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
    borderColor: theme.colors.border,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  soundTestText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    marginTop: 16,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
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
    borderTopColor: theme.colors.border,
  },
  userText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  logoutText: {
    color: theme.colors.bearish,
    fontSize: 12,
    fontWeight: '700',
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#0c2436',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  webViewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  webViewClose: {
    padding: 5,
  },
  webViewCloseText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  webViewLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
