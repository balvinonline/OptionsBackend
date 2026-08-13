import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const MarketGateCard = ({ signalAnalysis }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);

  if (!signalAnalysis) return null;

  const { gateStatus, pcr, confidence, totalCeOiChg, totalPeOiChg, trapWarning, absorptionDetected } = signalAnalysis;

  const isBullish = gateStatus === 'BULLISH';
  const isBearish = gateStatus === 'BEARISH';

  return (
    <View style={[styles.container, isBullish ? styles.containerBullish : isBearish ? styles.containerBearish : styles.containerNeutral]}>
      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons
            name={isBullish ? 'shield-checkmark' : isBearish ? 'alert-circle' : 'pause-circle'}
            size={20}
            color={isBullish ? theme.colors.bullish : isBearish ? theme.colors.bearish : theme.colors.warning}
          />
          <Text style={styles.headerTitle}>
            TRADE GATE: {isBullish ? 'BULLISH (CE PERMITTED)' : isBearish ? 'BEARISH (PE PERMITTED)' : 'NO TRADE GATE / CHOPPY'}
          </Text>
        </View>

        <View style={[styles.scoreBadge, { backgroundColor: isBullish ? theme.colors.bullish : isBearish ? theme.colors.bearish : theme.colors.warning }]}>
          <Text style={styles.scoreText}>{confidence}% CONFIDENCE</Text>
        </View>
      </View>

      {/* Rules Checklist */}
      <View style={styles.checklist}>
        <CheckItem
          passed={pcr > 1.05 || pcr < 0.95}
          label={`PCR OI Filter: ${pcr.toFixed(2)} (${pcr >= 1.05 ? 'Bullish > 1.05' : pcr <= 0.95 ? 'Bearish < 0.95' : 'Neutral Range'})`}
        />
        <CheckItem
          passed={totalPeOiChg !== totalCeOiChg}
          label={`OI Buildup: PE Chg (${(totalPeOiChg / 1000).toFixed(0)}k) vs CE Chg (${(totalCeOiChg / 1000).toFixed(0)}k)`}
        />
        <CheckItem
          passed={!trapWarning}
          label={trapWarning ? `⚠️ Trap Detected: ${trapWarning}` : 'No Trap Detected (Clear Path)'}
          isWarning={Boolean(trapWarning)}
        />
        {absorptionDetected ? (
          <CheckItem
            passed={true}
            label="⚡ Absorption Detected (Smart Money Activity)"
            isSpecial
          />
        ) : null}
      </View>
    </View>
  );
};

const CheckItem = ({ passed, label, isWarning, isSpecial }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  return (
    <View style={styles.checkRow}>
      <Ionicons
        name={isWarning ? 'warning' : passed ? 'checkmark-circle' : 'close-circle'}
        size={16}
        color={isWarning ? theme.colors.warning : passed ? theme.colors.bullish : theme.colors.textMuted}
      />
      <Text style={[styles.checkLabel, isSpecial && { color: theme.colors.primaryLight, fontWeight: '800' }]}>
        {label}
      </Text>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    ...theme.shadows.card,
  },
  containerBullish: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: theme.colors.bullishBorder,
  },
  containerBearish: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: theme.colors.bearishBorder,
  },
  containerNeutral: {
    backgroundColor: theme.colors.bgCardSolid,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    flexShrink: 1,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scoreText: {
    color: '#071a26',
    fontSize: 10,
    fontWeight: '900',
  },
  checklist: {
    gap: 6,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
