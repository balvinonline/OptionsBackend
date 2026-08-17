import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { getStoredSettings, setStoredSetting, normalizeServerUrl } from '../services/storage';
import { soundManager } from '../components/AudioAlertHelper';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { useTheme } from '../context/ThemeContext';

const FYERS_LOGIN_URL_CACHE_KEY = 'FYERS_LOGIN_URL_CACHE';

const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const buildFyersTokenPayload = (input = '') => {
  const value = String(input || '').trim();
  const tokenMatch = value.match(/[?&]access_token=([^&\s]+)/i);
  if (tokenMatch) {
    return { accessToken: decodeURIComponent(tokenMatch[1]) };
  }
  const prefixedToken = value.match(/^[A-Z0-9]+(?:-[0-9]+)?:eyJ/i);
  if (prefixedToken) {
    return { accessToken: value };
  }
  if (value.includes('auth_code=') || value.includes('code=') || value.startsWith('http') || value.startsWith('eyJ')) {
    return { authCode: value };
  }
  return { authCode: value };
};

const hasActiveFyersToken = (status) => Boolean(
  status?.isValid ||
  status?.accessTokenPresent ||
  status?.fyersInitialized ||
  status?.connected
);

export const SettingsScreen = () => {
  const { currentUser, logout, serverUrl } = useAuth();
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [fyersStatus, setFyersStatus] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [showServerModal, setShowServerModal] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  
  // TOTP Login State
  const [fyersId, setFyersId] = useState('');
  const [fyersPin, setFyersPin] = useState('');
  const [totpKey, setTotpKey] = useState('');

  // WebView Login State
  const [showWebView, setShowWebView] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const [authInput, setAuthInput] = useState('');
  const [cachedTokenPresent, setCachedTokenPresent] = useState(false);
  const tokenIsActive = cachedTokenPresent || hasActiveFyersToken(fyersStatus);

  const openFyersLogin = async () => {
    try {
      setTotpLoading(true);
      isProcessingRef.current = false;
      const targetUrl = normalizeServerUrl(serverUrl);
      const cachedLoginUrl = await AsyncStorage.getItem(FYERS_LOGIN_URL_CACHE_KEY);
      if (cachedLoginUrl) {
        setLoginUrl(cachedLoginUrl);
        await Linking.openURL(cachedLoginUrl);
        Alert.alert(
          'Fyers Login Opened',
          'Complete login in browser. After redirect, copy the final URL or auth_code and paste it here.'
        );
        setTotpLoading(false);
        return;
      }
      const resp = await fetchWithTimeout(`${targetUrl}/api/fyers/login-url`);
      const data = await resp.json();
      if (data.loginUrl) {
        setLoginUrl(data.loginUrl);
        await AsyncStorage.setItem(FYERS_LOGIN_URL_CACHE_KEY, data.loginUrl);
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
      Alert.alert('Backend Slow', 'Server did not answer quickly. Tap Test Ping first, then try again.');
    } finally {
      setTotpLoading(false);
    }
  };

  const startWebViewLogin = async () => {
    if (tokenIsActive) {
      Alert.alert(
        'Token already active',
        'Live token is already saved. No need to generate again now.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Refresh Anyway', onPress: openFyersLogin },
        ]
      );
      return;
    }
    openFyersLogin();
  };

  const isProcessingRef = React.useRef(false);

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

  const handleSubmitAuthCode = async (finalUrl, forceSave = false) => {
    if (!String(finalUrl || '').trim()) {
      Alert.alert('Missing Code', 'Paste the Fyers final URL or auth_code first.');
      return;
    }
    if (tokenIsActive && !forceSave) {
      Alert.alert(
        'Token already active',
        'Live token is already saved. Skip this unless you want to replace it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save Anyway', onPress: () => handleSubmitAuthCode(finalUrl, true) },
        ]
      );
      return;
    }
    setTotpLoading(true);
    try {
      const targetUrl = normalizeServerUrl(serverUrl);
      const resp = await fetchWithTimeout(`${targetUrl}/api/fyers/save-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildFyersTokenPayload(finalUrl))
      });
      const data = await resp.json();
      if (data.ok) {
        Alert.alert('✅ Success', 'Token Generated & Saved Successfully! Live Data is active.');
        setAuthInput('');
        if (data.access_token) {
          await AsyncStorage.setItem('FYERS_CACHED_TOKEN', data.access_token);
          setCachedTokenPresent(true);
        }
        const status = await api.getFyersTokenStatus();
        setFyersStatus(status);
      } else {
        Alert.alert('❌ Error', data.error || 'Failed to verify token');
      }
    } catch (e) {
      Alert.alert('Backend Slow', 'Token was not saved because the server did not answer quickly. Tap Test Ping first, then save again.');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleTotpLogin = async () => {
    if (!fyersId || !fyersPin || !totpKey) {
      Alert.alert('Missing Fields', 'Please fill Fyers ID, PIN, and TOTP Secret Key');
      return;
    }
    setTotpLoading(true);
    try {
      const res = await api.totpLogin({
        fyersId,
        fyersPin,
        totpKey
      });
      if (res.ok) {
        Alert.alert('✅ Success', 'Access Token Generated Successfully! Live Data is active.');
        const status = await api.getFyersTokenStatus();
        setFyersStatus(status);
      } else {
        Alert.alert('❌ Error', res.error || 'Failed to login via TOTP');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Could not connect to server.');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!fyersId || !fyersPin || !totpKey) {
      Alert.alert('Missing Fields', 'Please fill all fields to save credentials on server');
      return;
    }
    setTotpLoading(true);
    try {
      const res = await api.saveTotpCredentials({
        fyersId,
        fyersPin,
        totpKey
      });
      if (res.ok) {
        Alert.alert('✅ Saved', 'Credentials securely saved to .env file on server.');
        const status = await api.getFyersTokenStatus();
        setFyersStatus(status);
      } else {
        Alert.alert('❌ Error', res.error || 'Failed to save credentials');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Could not connect to server.');
    } finally {
      setTotpLoading(false);
    }
  };

  useEffect(() => {
    getStoredSettings().then((s) => {
      setSoundEnabled(s.soundEnabled);
      setHapticEnabled(s.hapticEnabled);
    });
    AsyncStorage.getItem('FYERS_CACHED_TOKEN').then((token) => {
      setCachedTokenPresent(Boolean(token));
    });

    api.getFyersTokenStatus()
      .then((res) => setFyersStatus(res))
      .catch(() => setFyersStatus({ connected: false, message: 'Backend unreachable' }));
  }, []);

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
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="settings" size={20} color={theme.colors.primary} />
          <Text style={styles.headerTitle}>SETTINGS & CONNECTIONS</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* User Card */}
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={24} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{currentUser || 'Admin'}</Text>
              <Text style={styles.userRole}>Options Desk Trader</Text>
            </View>
            <TouchableOpacity onPress={logout} style={styles.logoutPill}>
              <Ionicons name="log-out-outline" size={14} color={theme.colors.bearish} />
              <Text style={styles.logoutPillText}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          {/* Fyers Broker Status */}
          <Text style={styles.sectionHeader}>BROKER INTEGRATION</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="shield-checkmark" size={22} color={theme.colors.bullish} />
                <View>
                  <Text style={styles.cardTitle}>Fyers API v3 Feed</Text>
                  <Text style={styles.cardSubtitle}>
                    {fyersStatus?.connected ? 'Real-time WebSocket Active' : 'Connected via Backend Token'}
                  </Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: theme.colors.bullishBg }]}>
                <Text style={[styles.statusBadgeText, { color: theme.colors.bullish }]}>CONNECTED</Text>
              </View>
            </View>
          </View>

          {/* Secure In-App Login */}
          <Text style={styles.sectionHeader}>FYERS SECURE BROKER LOGIN</Text>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>FYERS ACCOUNT SYNC</Text>
              {tokenIsActive ? (
                <View style={styles.badgeSuccess}><Text style={styles.badgeText}>● TOKEN ACTIVE</Text></View>
              ) : (
                <View style={styles.badgeError}><Text style={styles.badgeText}>● EXPIRED</Text></View>
              )}
            </View>
            
            <Text style={styles.cardDescription}>
              {tokenIsActive
                ? 'Token is active. Use refresh only when the market feed stops or the broker token expires.'
                : 'Login to Fyers, then paste the final URL or token here.'}
            </Text>

            <TouchableOpacity 
              style={[styles.actionButton, { marginTop: 10 }]}
              onPress={startWebViewLogin}
              disabled={totpLoading}
            >
              {totpLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>
                    {tokenIsActive ? 'Token Active - Refresh Only If Needed' : 'Open Fyers Login'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={[styles.inputWrapper, { marginTop: 10, alignItems: 'flex-start' }]}>
              <Ionicons name="link-outline" size={18} color={theme.colors.textMuted} style={[styles.inputIcon, { marginTop: 13 }]} />
              <TextInput
                style={[styles.input, { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder="Paste Fyers final URL or auth_code"
                placeholderTextColor={theme.colors.textDisabled}
                value={authInput}
                onChangeText={setAuthInput}
                autoCapitalize="none"
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.actionButton, { marginTop: 8, backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.primary }]}
              onPress={() => handleSubmitAuthCode(authInput)}
              disabled={totpLoading}
            >
              <Ionicons name="key" size={18} color={theme.colors.primary} />
              <Text style={[styles.actionButtonText, { color: theme.colors.textPrimary }]}>Save Pasted Token</Text>
            </TouchableOpacity>

            <View style={styles.divider} />
            
            <Text style={[styles.cardTitle, { marginBottom: 10 }]}>Alternative: TOTP Login</Text>
            
            <View style={{ gap: 10 }}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={theme.colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Fyers ID (e.g. XY12345)"
                  placeholderTextColor={theme.colors.textDisabled}
                  value={fyersId}
                  onChangeText={setFyersId}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="keypad-outline" size={18} color={theme.colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="4-Digit PIN"
                  placeholderTextColor={theme.colors.textDisabled}
                  value={fyersPin}
                  onChangeText={setFyersPin}
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={4}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="key-outline" size={18} color={theme.colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="TOTP Secret (Alphanumeric)"
                  placeholderTextColor={theme.colors.textDisabled}
                  value={totpKey}
                  onChangeText={setTotpKey}
                  autoCapitalize="none"
                  secureTextEntry
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity 
                  style={[styles.actionButton, { flex: 1, backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.border }]}
                  onPress={handleSaveCredentials}
                  disabled={totpLoading}
                >
                  <Text style={[styles.actionButtonText, { color: theme.colors.textPrimary }]}>Save Keys</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionButton, { flex: 1 }]}
                  onPress={handleTotpLogin}
                  disabled={totpLoading}
                >
                  {totpLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Generate Token</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Server Host URL */}
          <Text style={styles.sectionHeader}>BACKEND CONNECTIVITY</Text>
          <TouchableOpacity style={styles.card} onPress={() => setShowServerModal(true)}>
            <View style={styles.cardRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="server" size={22} color={theme.colors.primary} />
                <View>
                  <Text style={styles.cardTitle}>Flask Server Host</Text>
                  <Text style={styles.cardSubtitle}>{serverUrl}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>

          {/* Alerts & Sound preferences */}
          <Text style={styles.sectionHeader}>ALERTS & NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Audio Chime Alerts</Text>
                <Text style={styles.settingSubtitle}>Play sound when Buy CE / Buy PE triggers</Text>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={toggleSound}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Haptic Feedback</Text>
                <Text style={styles.settingSubtitle}>Vibrate device on Gate change</Text>
              </View>
              <Switch
                value={hapticEnabled}
                onValueChange={toggleHaptic}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.testBtn} onPress={() => soundManager.testSound()}>
              <Ionicons name="volume-high" size={16} color={theme.colors.primary} />
              <Text style={styles.testBtnText}>Test Alert Audio & Vibration</Text>
            </TouchableOpacity>
          </View>

          {/* About info */}
          <View style={styles.aboutBox}>
            <Text style={styles.aboutText}>Options Trading Desk Mobile v1.0.0</Text>
            <Text style={styles.aboutSub}>Engineered for High-Frequency Option Buyers</Text>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>

        <ServerSettingsModal visible={showServerModal} onClose={() => setShowServerModal(false)} />
      </View>

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
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.bgDark,
    gap: 8,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  userRole: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  logoutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.bearishBg,
    gap: 4,
  },
  logoutPillText: {
    color: theme.colors.bearish,
    fontSize: 11,
    fontWeight: '800',
  },
  sectionHeader: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 6,
  },
  card: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  cardDescription: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  badgeSuccess: {
    backgroundColor: theme.colors.bullishBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeError: {
    backgroundColor: theme.colors.bearishBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: theme.colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  settingTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  settingSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: 10,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  testBtnText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  aboutBox: {
    alignItems: 'center',
    marginTop: 24,
    gap: 4,
  },
  aboutText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  aboutSub: {
    color: theme.colors.textDisabled,
    fontSize: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgDark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  actionButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
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
