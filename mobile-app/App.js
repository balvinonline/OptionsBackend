import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MarketProvider, useMarket } from './src/context/MarketContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { TradeGateScreen } from './src/screens/TradeGateScreen';
import { SignalsScreen } from './src/screens/SignalsScreen';
import { OptionChainScreen } from './src/screens/OptionChainScreen';
import { ChartScreen } from './src/screens/ChartScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { PcrAnalyticsScreen } from './src/screens/PcrAnalyticsScreen';
import { StockOptionsScreen } from './src/screens/StockOptionsScreen';
import { StockDeskScreen } from './src/screens/StockDeskScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { OptionBuyerScreen } from './src/screens/OptionBuyerScreen';
import { ExpiryScalperScreen } from './src/screens/ExpiryScalperScreen';
import { MoreMenuScreen } from './src/screens/MoreMenuScreen';
import { Sidebar } from './src/components/Sidebar';

import { BottomTabBar } from './src/components/BottomTabBar';

function MainLayout() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [webFeatureParams, setWebFeatureParams] = useState(null);
  const [deskSymbol, setDeskSymbol] = useState(null);
  // Sidebar state removed, replaced by Bottom Tabs

  const { theme, isDarkMode } = useTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();

  const getScreenTitle = (tab) => {
    switch(tab) {
      case 'OptionBuyer': return 'Buyer Hub';
      case 'Chain': return 'Option Chain & OI';
      case 'Scanner': return 'Scanner & Screeners';
      case 'TradeGate': return 'Trade Gate Rules';
      case 'Signals': return 'Live Signals';
      case 'Chart': return 'Live Chart';
      case 'StockOptions': return 'Stock Options Desk';
      case 'Settings': return 'Settings';
      case 'More': return 'More Tools';
      case 'PCR': return 'PCR Analytics';
      case 'ExpiryScalper': return 'Expiry Scalper';
      default: return 'Options Desk';
    }
  };

  const navigateToWebFeature = (featurePath) => {
    setWebFeatureParams({ featurePath });
  };

  return (
    <View style={styles.mainContainer}>
      {/* Top Header */}
      <View style={[styles.topHeader, { paddingTop: insets.top }]}>
        {activeTab === 'Dashboard' && !deskSymbol ? (
          <View style={styles.kotakHeader}>
            <View style={styles.kotakAvatar}>
              <Ionicons name="person" size={14} color={theme.colors.bgCardSolid} />
            </View>
            <View style={styles.kotakSearch}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <Text style={styles.kotakSearchText}>Search eg: NIFTY CE</Text>
            </View>
            <View style={styles.kotakHeaderIcons}>
              <TouchableOpacity onPress={() => setActiveTab('Signals')}>
                <Ionicons name="notifications-outline" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {!deskSymbol && (
              <TouchableOpacity style={styles.backButtonPill} onPress={() => setActiveTab('Dashboard')}>
                <Ionicons name="arrow-back" size={18} color={theme.colors.textPrimary} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle}>
              {deskSymbol ? `${deskSymbol} Desk` : getScreenTitle(activeTab)}
            </Text>
          </>
        )}
      </View>

      {/* Screen Views with conditional rendering to prevent out-of-memory crashes on mobile */}
      <View style={styles.screenContainer}>
        <View style={[styles.screenWrapper, activeTab === 'Dashboard' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          <DashboardScreen onNavigate={setActiveTab} />
        </View>

        <View style={[styles.screenWrapper, activeTab === 'TradeGate' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'TradeGate' && <TradeGateScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Signals' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'Signals' && <SignalsScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Stock' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'Stock' && <StockOptionsScreen onNavigate={setActiveTab} onNavigateDesk={(sym) => setDeskSymbol(sym)} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'More' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'More' && <MoreMenuScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Settings' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'Settings' && <SettingsScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Chain' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'Chain' && <OptionChainScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Scanner' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'Scanner' && <ScannerScreen onNavigate={setActiveTab} onNavigateDesk={(sym) => setDeskSymbol(sym)} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'Chart' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'Chart' && <ChartScreen onNavigate={setActiveTab} />}
        </View>
        
        <View style={[styles.screenWrapper, activeTab === 'StockOptions' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'StockOptions' && <StockOptionsScreen onNavigateDesk={(sym) => setDeskSymbol(sym)} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'PCR' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'PCR' && <PcrAnalyticsScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'OptionBuyer' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'OptionBuyer' && <OptionBuyerScreen onNavigate={setActiveTab} />}
        </View>

        <View style={[styles.screenWrapper, activeTab === 'ExpiryScalper' && !webFeatureParams && !deskSymbol && styles.screenVisible]}>
          {activeTab === 'ExpiryScalper' && <ExpiryScalperScreen onNavigate={setActiveTab} />}
        </View>

        {deskSymbol && (
          <View style={[styles.screenWrapper, styles.screenVisible]}>
            <StockDeskScreen symbol={deskSymbol} onBack={() => setDeskSymbol(null)} />
          </View>
        )}
      </View>

      {/* Persistent Bottom Tab Bar */}
      <BottomTabBar activeTab={activeTab} onNavigate={setActiveTab} />
    </View>
  );
}

function RootApp() {
  const { isAuthenticated } = useAuth();
  const { isDarkMode, theme } = useTheme();

  return (
    <>
      <StatusBar 
        barStyle={isDarkMode ? "light-content" : "dark-content"} 
        backgroundColor={theme.colors.bgDark} 
      />
      {!isAuthenticated ? <LoginScreen /> : <MainLayout />}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <MarketProvider>
            {/* Theming inside SafeArea to ensure background matches */}
            <ThemedSafeAreaView />
          </MarketProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Separate component so we can use useTheme inside the top-level SafeAreaView
function ThemedSafeAreaView() {
  const { theme } = useTheme();
  return (
    <SafeAreaView 
      style={{ flex: 1, backgroundColor: theme.colors.bgDark }} 
      edges={['left', 'right', 'bottom']} // Exclude top if using custom header
    >
      <RootApp />
    </SafeAreaView>
  );
}

const getStyles = (theme) => StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  topHeader: {
    backgroundColor: theme.colors.bgDark,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  kotakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
  },
  kotakAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kotakSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCardSolid,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  kotakSearchText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginLeft: 8,
  },
  kotakHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
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
  backButtonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 15,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  backButtonText: {
    color: theme.colors.textPrimary,
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
