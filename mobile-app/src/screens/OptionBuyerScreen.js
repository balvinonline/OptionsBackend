import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useMarket } from '../context/MarketContext';

export const OptionBuyerScreen = ({ onNavigate }) => {
  const { theme } = useTheme();
  const { marketData, liveGreeks, whaleAlerts } = useMarket();
  const styles = getStyles(theme);

  const chain = marketData?.chain || [];
  const spot = marketData?.spot || 0;
  
  // Find ATM strike index
  let atmIndex = -1;
  let minDiff = Infinity;
  chain.forEach((row, idx) => {
    const diff = Math.abs(row.strike - spot);
    if (diff < minDiff) {
      minDiff = diff;
      atmIndex = idx;
    }
  });

  // Top 5 ITM/OTM calls and puts around ATM
  const startIdx = Math.max(0, atmIndex - 5);
  const endIdx = Math.min(chain.length, atmIndex + 6);
  const displayChain = chain.slice(startIdx, endIdx);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Option Buyer Hub</Text>
      
      {/* Momentum & IV Header */}
      <View style={styles.headerCards}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Momentum Meter</Text>
          <Text style={styles.cardValue}>Velocity: High</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>IV Status</Text>
          <Text style={styles.cardValue}>Spiking</Text>
        </View>
      </View>

      {/* Buyer's Chain */}
      <Text style={styles.sectionTitle}>Buyer's Chain</Text>
      <View style={styles.chainContainer}>
        <View style={styles.chainRowHeader}>
          <Text style={styles.chainCol}>Call LTP</Text>
          <Text style={styles.chainColStrike}>Strike</Text>
          <Text style={styles.chainCol}>Put LTP</Text>
        </View>
        {displayChain.map((row) => (
          <View key={row.strike} style={styles.chainRow}>
            <Text style={[styles.chainCol, { color: theme.colors.success }]}>{row.ce_ltp?.toFixed(2) || '-'}</Text>
            <Text style={styles.chainColStrike}>{row.strike}</Text>
            <Text style={[styles.chainCol, { color: theme.colors.danger }]}>{row.pe_ltp?.toFixed(2) || '-'}</Text>
          </View>
        ))}
      </View>

      {/* Whale Tracker Feed */}
      <Text style={styles.sectionTitle}>Whale Tracker Feed</Text>
      <View style={styles.whaleContainer}>
        {whaleAlerts && whaleAlerts.length > 0 ? (
          whaleAlerts.map((alert, index) => (
            <View key={index} style={styles.alertRow}>
              <Text style={styles.alertText}>{JSON.stringify(alert)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.noAlertsText}>No whale alerts yet.</Text>
        )}
      </View>
    </ScrollView>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 20,
  },
  headerCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    padding: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginTop: 10,
    marginBottom: 10,
  },
  chainContainer: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chainRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: 8,
    marginBottom: 8,
  },
  chainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  chainCol: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textPrimary,
  },
  chainColStrike: {
    flex: 1,
    textAlign: 'center',
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  whaleContainer: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 40,
  },
  alertRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  alertText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  noAlertsText: {
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 10,
  }
});
