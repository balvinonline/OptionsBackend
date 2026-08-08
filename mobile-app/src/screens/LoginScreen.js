import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { ServerSettingsModal } from '../components/ServerSettingsModal';
import { THEME } from '../constants/theme';

export const LoginScreen = () => {
  const { login, serverUrl } = useAuth();
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);
    const res = await login(username.trim(), password.trim());
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Settings quick icon top right */}
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettings(true)}>
          <Ionicons name="server-outline" size={20} color={THEME.colors.primaryLight} />
        </TouchableOpacity>

        {/* Brand Logo & Title */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Ionicons name="stats-chart" size={38} color={THEME.colors.primary} />
          </View>
          <Text style={styles.brandTitle}>OPTIONS DESK</Text>
          <Text style={styles.brandSubtitle}>Professional Option Analytics & Signals</Text>
        </View>

        {/* Card Form */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Terminal Sign In</Text>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={THEME.colors.bearish} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Username */}
          <Text style={styles.inputLabel}>USERNAME</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={THEME.colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={THEME.colors.textDisabled}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          {/* Password */}
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>PASSWORD</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={THEME.colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={THEME.colors.textDisabled}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={THEME.colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.loginBtn, isSubmitting && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#071a26" />
            ) : (
              <Text style={styles.loginBtnText}>Unlock Desk</Text>
            )}
          </TouchableOpacity>

          {/* Server Target info */}
          <TouchableOpacity
            style={styles.serverInfo}
            onPress={() => setShowSettings(true)}
          >
            <Ionicons name="wifi-outline" size={14} color={THEME.colors.textMuted} />
            <Text style={styles.serverInfoText}>Server: {serverUrl}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.bgDark,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  settingsBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    padding: 10,
    backgroundColor: THEME.colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    marginBottom: 12,
  },
  brandTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  card: {
    backgroundColor: THEME.colors.bgCardSolid,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  cardHeader: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.bearishBg,
    borderWidth: 1,
    borderColor: THEME.colors.bearishBorder,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorText: {
    color: THEME.colors.bearish,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  inputLabel: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.bgDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    height: 48,
    gap: 10,
  },
  input: {
    flex: 1,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  loginBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#071a26',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  serverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  serverInfoText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
});
