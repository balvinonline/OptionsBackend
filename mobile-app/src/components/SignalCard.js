import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const SignalCard = ({ signalAnalysis, indexSymbol }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  if (!signalAnalysis) return null;

  const { signalType, signalStrength, confidence, atmStrike } = signalAnalysis;
  const isBuy = signalType === 'BUY_CE';
  const isSell = signalType === 'BUY_PE';

  if (signalType === 'NEUTRAL') {
    return (
      <View style={styles.neutralContainer}>
        <Ionicons name="hourglass-outline" size={20} color={theme.colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={styles.neutralTitle}>NO CONFIRMED SIGNAL YET</Text>
          <Text style={styles.neutralSubtitle}>Waiting for clear momentum & PCR divergence on {indexSymbol}</Text>
        </View>
      </View>
    );
  }

  // Calculate strike recommendation
  const recommendedStrike = atmStrike ? `${indexSymbol} ${atmStrike} ${isBuy ? 'CE' : 'PE'}` : `${indexSymbol} ATM ${isBuy ? 'CE' : 'PE'}`;

  return (
    <View style={[styles.container, isBuy ? styles.containerBuy : styles.containerSell]}>
      {/* Top Tag & Confidence */}
      <View style={styles.topRow}>
        <View style={[styles.signalPill, { backgroundColor: isBuy ? theme.colors.bullish : theme.colors.bearish }]}>
          <Ionicons name={isBuy ? 'trending-up' : 'trending-down'} size={14} color="#fff" />
          <Text style={styles.signalPillText}>{signalStrength}</Text>
        </View>

        <Text style={styles.timestampText}>{new Date().toLocaleTimeString('en-IN')}</Text>
      </View>

      {/* Recommended Instrument */}
      <View style={styles.instrumentSection}>
        <Text style={styles.instrumentLabel}>RECOMMENDED OPTION</Text>
        <Text style={styles.instrumentValue}>{recommendedStrike}</Text>
      </View>

      {/* Target & Risk Levels */}
      <View style={styles.levelsRow}>
        <View style={styles.levelTile}>
          <Text style={styles.levelLabel}>CONFIDENCE</Text>
          <Text style={[styles.levelVal, { color: isBuy ? theme.colors.bullish : theme.colors.bearish }]}>{confidence}%</Text>
        </View>

        <View style={styles.levelTile}>
          <Text style={styles.levelLabel}>ACTION</Text>
          <Text style={styles.levelVal}>{isBuy ? 'BUY CE' : 'BUY PE'}</Text>
        </View>

        <View style={styles.levelTile}>
          <Text style={styles.levelLabel}>SL GUIDE</Text>
          <Text style={[styles.levelVal, { color: theme.colors.warning }]}>-20% / VWAP</Text>
        </View>
      </View>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    ...theme.shadows.glow,
  },
  containerBuy: {
    backgroundColor: '#07241c',
    borderColor: theme.colors.bullish,
  },
  containerSell: {
    backgroundColor: '#281116',
    borderColor: theme.colors.bearish,
  },
  neutralContainer: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  neutralTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  neutralSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  signalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  signalPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  timestampText: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  instrumentSection: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  instrumentLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  instrumentValue: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  levelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  levelTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  levelLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  levelVal: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
});
