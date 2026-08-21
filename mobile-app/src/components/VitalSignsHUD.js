import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export function VitalSignsHUD({ marketData }) {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const analytics = marketData?.analytics || {};
  const maxPain = analytics?.maxPain || analytics?.max_pain || '-';
  const regime = marketData?.analytics?.regime?.regime || 'Neutral';
  const gamma = marketData?.analytics?.gamma?.total_gex || 0;

  const getGammaColor = (val) => {
    if (val > 0) return theme.colors.bullish;
    if (val < 0) return theme.colors.bearish;
    return theme.colors.textPrimary;
  };

  return (
    <View style={styles.container}>
      <View style={styles.statBox}>
        <Text style={styles.label}>MAX PAIN</Text>
        <Text style={[styles.value, { color: theme.colors.warning }]}>{maxPain}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.statBox}>
        <Text style={styles.label}>REGIME</Text>
        <Text style={[styles.value, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {regime}
        </Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.statBox}>
        <Text style={styles.label}>GEX</Text>
        <Text style={[styles.value, { color: getGammaColor(gamma) }]} numberOfLines={1}>
          {gamma ? Number(gamma).toLocaleString() : '-'}
        </Text>
      </View>
    </View>
  );
}

const getStyles = (theme) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgCardSolid,
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: theme.colors.borderLight,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  value: {
    fontSize: 12,
    fontWeight: '900',
  },
});
