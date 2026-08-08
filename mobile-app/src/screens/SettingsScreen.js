import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { getStoredSettings, setStoredSetting } from '../services/storage';
import { soundManager } from '../components/AudioAlertHelper';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { THEME } from '../constants/theme';

export const SettingsScreen = () => {
  const { currentUser, logout, serverUrl } = useAuth();
  const [fyersStatus, setFyersStatus] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [showServerModal, setShowServerModal] = useState(false);

  useEffect(() => {
    getStoredSettings().then((s) => {
      setSoundEnabled(s.soundEnabled);
      setHapticEnabled(s.hapticEnabled);
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="settings" size={20} color={THEME.colors.primary} />
        <Text style={styles.headerTitle}>SETTINGS & CONNECTIONS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color={THEME.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{currentUser || 'Admin'}</Text>
            <Text style={styles.userRole}>Options Desk Trader</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutPill}>
            <Ionicons name="log-out-outline" size={14} color={THEME.colors.bearish} />
            <Text style={styles.logoutPillText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Fyers Broker Status */}
        <Text style={styles.sectionHeader}>BROKER INTEGRATION</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="shield-checkmark" size={22} color={THEME.colors.bullish} />
              <View>
                <Text style={styles.cardTitle}>Fyers API v3 Feed</Text>
                <Text style={styles.cardSubtitle}>
                  {fyersStatus?.connected ? 'Real-time WebSocket Active' : 'Connected via Backend Token'}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: THEME.colors.bullishBg }]}>
              <Text style={[styles.statusBadgeText, { color: THEME.colors.bullish }]}>CONNECTED</Text>
            </View>
          </View>
        </View>

        {/* Server Host URL */}
        <Text style={styles.sectionHeader}>BACKEND CONNECTIVITY</Text>
        <TouchableOpacity style={styles.card} onPress={() => setShowServerModal(true)}>
          <View style={styles.cardRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="server" size={22} color={THEME.colors.primary} />
              <View>
                <Text style={styles.cardTitle}>Flask Server Host</Text>
                <Text style={styles.cardSubtitle}>{serverUrl}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={THEME.colors.textMuted} />
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
              trackColor={{ false: THEME.colors.border, true: THEME.colors.primary }}
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
              trackColor={{ false: THEME.colors.border, true: THEME.colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.testBtn} onPress={() => soundManager.testSound()}>
            <Ionicons name="volume-high" size={16} color={THEME.colors.primary} />
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bgDark,
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
    borderBottomColor: THEME.colors.borderLight,
    backgroundColor: THEME.colors.bgDark,
    gap: 8,
  },
  headerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgCardSolid,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  userRole: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  logoutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: THEME.colors.bearishBg,
    gap: 4,
  },
  logoutPillText: {
    color: THEME.colors.bearish,
    fontSize: 11,
    fontWeight: '800',
  },
  sectionHeader: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 6,
  },
  card: {
    backgroundColor: THEME.colors.bgCardSolid,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
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
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  settingSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.borderLight,
    marginVertical: 10,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  testBtnText: {
    color: THEME.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  aboutBox: {
    alignItems: 'center',
    marginTop: 24,
    gap: 4,
  },
  aboutText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  aboutSub: {
    color: THEME.colors.textDisabled,
    fontSize: 10,
  },
});
