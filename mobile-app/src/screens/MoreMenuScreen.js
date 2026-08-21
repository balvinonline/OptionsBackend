import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const MoreMenuScreen = ({ onNavigate }) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const styles = getStyles(theme);

  const menuItems = [
    { title: 'Live Signals', icon: 'flash', action: () => onNavigate('Signals') },
    { title: 'Trade Gate Rules', icon: 'shield-checkmark', action: () => onNavigate('TradeGate') },
    { title: 'Live Chart', icon: 'bar-chart', action: () => onNavigate('Chart') },
    { title: 'Stock Options Desk', icon: 'briefcase', action: () => onNavigate('StockOptions') },
    { title: 'Settings & Login', icon: 'settings', action: () => onNavigate('Settings') },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More Products & Tools</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.gridContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.gridItem} onPress={item.action}>
              <View style={styles.iconContainer}>
                <Ionicons name={item.icon} size={28} color={theme.colors.primary} />
              </View>
              <Text style={styles.itemTitle}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.themeToggleBtn} onPress={toggleTheme}>
          <Ionicons name={isDark ? "sunny" : "moon"} size={24} color={theme.colors.textPrimary} />
          <Text style={styles.themeToggleText}>
            Switch to {isDark ? "Light Mode" : "Dark Mode"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 15,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  itemTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  themeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  themeToggleText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  }
});
