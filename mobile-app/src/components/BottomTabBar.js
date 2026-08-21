import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function BottomTabBar({ activeTab, onNavigate }) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const insets = useSafeAreaInsets();

  const TABS = [
    { id: 'Dashboard', icon: 'pie-chart', label: 'Dash' },
    { id: 'OptionBuyer', icon: 'rocket', label: 'Buyer Hub' },
    { id: 'ExpiryScalper', icon: 'flash', label: 'Zero Hero' },
    { id: 'Scanner', icon: 'search', label: 'Scanner' },
    { id: 'More', icon: 'grid', label: 'More' },
  ];

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 10 }]}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity 
            key={tab.id} 
            style={styles.tabButton} 
            onPress={() => onNavigate(tab.id)}
          >
            <View style={[styles.iconContainer, isActive && styles.activeIconContainer]}>
              <Ionicons 
                name={tab.icon} 
                size={22} 
                color={isActive ? theme.colors.primary : theme.colors.textMuted} 
              />
            </View>
            <Text style={[styles.tabLabel, isActive && styles.activeTabLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const getStyles = (theme) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgCardSolid,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
    ...theme.shadows.card,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  activeIconContainer: {
    backgroundColor: theme.colors.primary + '20',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  activeTabLabel: {
    color: theme.colors.primary,
  },
});
