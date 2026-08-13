import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const SIDEBAR_WIDTH = width * 0.75;

export const Sidebar = ({ isOpen, onClose, onNavigate, activeTab, onNavigateWebFeature }) => {
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const styles = getStyles(theme);
  
  // Animation for sliding in/out
  const slideAnim = React.useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 0 : -SIDEBAR_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOpen]);

  if (!isOpen && slideAnim._value === -SIDEBAR_WIDTH) return null;

  const MENU_ITEMS = [
    { id: 'Signals', title: 'Live Signals', icon: 'flash' },
    { id: 'TradeGate', title: 'Trade Gate Rules', icon: 'shield-checkmark' },
    { id: 'Chain', title: 'Option Chain & OI', icon: 'layers' },
    { id: 'Scanner', title: 'F&O Watchlist', icon: 'trending-up' },
    { id: 'Chart', title: 'Live Chart', icon: 'stats-chart' },
    { id: 'Dashboard', title: 'Market Overview', icon: 'home' },
    { id: 'StockOptions', title: 'Stock Options Desk', icon: 'briefcase' },
  ];

  return (
    <View style={styles.overlayContainer} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Backdrop */}
      {isOpen && (
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      )}
      
      {/* Sidebar Panel */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Options Desk</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.menuList}>
          {MENU_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.menuItem, isActive && styles.menuItemActive]}
                onPress={() => {
                  onNavigate(item.id);
                  onClose();
                }}
              >
                <Ionicons 
                  name={item.icon} 
                  size={20} 
                  color={isActive ? theme.colors.primary : theme.colors.textSecondary} 
                />
                <Text style={[styles.menuItemText, isActive && styles.menuItemTextActive]}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            );
          })}
          
          <TouchableOpacity
            style={[styles.menuItem, activeTab === 'Settings' && styles.menuItemActive]}
            onPress={() => {
              onNavigate('Settings');
              onClose();
            }}
          >
            <Ionicons name="settings" size={20} color={activeTab === 'Settings' ? theme.colors.primary : theme.colors.textSecondary} />
            <Text style={[styles.menuItemText, activeTab === 'Settings' && styles.menuItemTextActive]}>
              Settings & Token Login
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            <Ionicons 
              name={isDarkMode ? 'sunny' : 'moon'} 
              size={20} 
              color={theme.colors.textPrimary} 
            />
            <Text style={styles.themeToggleText}>
              {isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: theme.colors.bgCardSolid,
    borderRightWidth: 1,
    borderRightColor: theme.colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  menuList: {
    flex: 1,
    paddingTop: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    marginVertical: 4,
    borderRadius: theme.borderRadius.md,
  },
  menuItemActive: {
    backgroundColor: theme.colors.primaryGlow,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginLeft: 15,
  },
  menuItemTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingBottom: 40,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeToggleText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginLeft: 15,
  }
});
