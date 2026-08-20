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
import { Sidebar } from './src/components/Sidebar';

function MainLayout() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [webFeatureParams, setWebFeatureParams] = useState(null);
  const [deskSymbol, setDeskSymbol] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { theme, isDarkMode } = useTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();

  const navigateToWebFeature = (featurePath) => {
    setWebFeatureParams({ featurePath });
  };

  return (
    <View style={styles.mainContainer}>
      {/* Top Header with Hamburger */}
      <View style={[styles.topHeader, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.hamburgerBtn} onPress={() => setIsSidebarOpen(true)}>
          <Ionicons name="menu" size={28} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        {activeTab !== 'Dashboard' && !deskSymbol && (
          <TouchableOpacity style={styles.backButtonPill} onPress={() => setActiveTab('Dashboard')}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.textPrimary} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{deskSymbol ? `${deskSymbol} Desk` : (activeTab === 'Dashboard' ? 'Dashboard' : 'Options Desk')}</Text>
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

      {/* Sidebar Overlay Component */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onNavigate={setActiveTab}
        activeTab={activeTab}
        onNavigateWebFeature={navigateToWebFeature}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgDark,
    paddingHorizontal: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  hamburgerBtn: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
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
