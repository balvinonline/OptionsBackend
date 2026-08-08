import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MarketProvider, useMarket } from './src/context/MarketContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PcrAnalyticsScreen } from './src/screens/PcrAnalyticsScreen';
import { TradeGateScreen } from './src/screens/TradeGateScreen';
import { SignalsScreen } from './src/screens/SignalsScreen';
import { SignalJournalScreen } from './src/screens/SignalJournalScreen';
import { OptionChainScreen } from './src/screens/OptionChainScreen';
import { ChartScreen } from './src/screens/ChartScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { THEME } from './src/constants/theme';

const TABS = [
  { id: 'Overview', label: 'Overview', icon: 'speedometer', iconOutline: 'speedometer-outline' },
  { id: 'PCR', label: 'PCR Table', icon: 'bar-chart', iconOutline: 'bar-chart-outline' },
  { id: 'Gate', label: 'Trade Gate', icon: 'shield-checkmark', iconOutline: 'shield-checkmark-outline' },
  { id: 'Signals', label: 'Signals', icon: 'flash', iconOutline: 'flash-outline' },
  { id: 'Chain', label: 'Chain', icon: 'layers', iconOutline: 'layers-outline' },
  { id: 'Scanners', label: 'Scanners', icon: 'scan', iconOutline: 'scan-outline' },
];

function MainLayout() {
  const [activeTab, setActiveTab] = useState('Overview');
  const { signalAnalysis, tradeGateAnalysis } = useMarket();
  const insets = useSafeAreaInsets();

  const hasActiveSignal = signalAnalysis?.signalType && signalAnalysis.signalType !== 'NEUTRAL';
  const isBuyCe = signalAnalysis?.signalType === 'BUY_CE';
  const isGatePassed = tradeGateAnalysis?.score >= 16;

  // Clearance above Android navigation bar and iOS home indicator
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 4);

  return (
    <View style={styles.mainContainer}>
      {/* Screen Views with Keep-Alive for high performance */}
      <View style={styles.screenContainer}>
        <View style={[styles.screenWrapper, activeTab === 'Overview' && styles.screenVisible]}>
          <DashboardScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'PCR' && styles.screenVisible]}>
          <PcrAnalyticsScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Gate' && styles.screenVisible]}>
          <TradeGateScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Signals' && styles.screenVisible]}>
          <SignalsScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Journal' && styles.screenVisible]}>
          <SignalJournalScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Chain' && styles.screenVisible]}>
          <OptionChainScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Chart' && styles.screenVisible]}>
          <ChartScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Scanners' && styles.screenVisible]}>
          <ScannerScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Settings' && styles.screenVisible]}>
          <SettingsScreen onNavigate={setActiveTab} />
        </View>
      </View>

      {/* Sleek 6-Tab Bottom Navigation Bar */}
      <View style={[styles.tabBar, { paddingBottom: bottomPadding }]}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const showSignalBadge = tab.id === 'Signals' && hasActiveSignal;
          const showGateBadge = tab.id === 'Gate' && isGatePassed;

          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.6}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name={isActive ? tab.icon : tab.iconOutline}
                  size={20}
                  color={isActive ? THEME.colors.primary : THEME.colors.textMuted}
                />
                {showSignalBadge && (
                  <View
                    style={[
                      styles.signalBadgeDot,
                      { backgroundColor: isBuyCe ? THEME.colors.bullish : THEME.colors.bearish },
                    ]}
                  />
                )}
                {showGateBadge && (
                  <View
                    style={[
                      styles.gateBadgeDot,
                      { backgroundColor: THEME.colors.bullish },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function RootApp() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <MainLayout />;
}

export default function App() {
  return (
    <SafeAreaProvider style={styles.providerContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#071a26" />
      <AuthProvider>
        <MarketProvider>
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
            <RootApp />
          </SafeAreaView>
        </MarketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  providerContainer: {
    flex: 1,
    backgroundColor: '#071a26',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#071a26',
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#071a26',
  },
  screenContainer: {
    flex: 1,
    position: 'relative',
  },
  screenWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    zIndex: 0,
    pointerEvents: 'none',
  },
  screenVisible: {
    opacity: 1,
    zIndex: 1,
    pointerEvents: 'auto',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#071a26',
    borderTopWidth: 1,
    borderTopColor: 'rgba(56, 189, 248, 0.15)',
    paddingTop: 8,
    paddingHorizontal: 2,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  tabButtonActive: {
    transform: [{ scale: 1.04 }],
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: '#071a26',
  },
  gateBadgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabLabel: {
    fontSize: 9,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: THEME.colors.primary,
    fontWeight: '900',
  },
  tabLabelInactive: {
    color: THEME.colors.textMuted,
    fontWeight: '600',
  },
});
