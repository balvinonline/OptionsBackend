import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { THEME } from '../constants/theme';

export const OptionChainRow = ({ row, isATM, maxOi }) => {
  const strike = Number(row.strike);
  const ceOi = Number(row.oi_CE || 0);
  const ceOiChg = Number(row.oich_CE || 0);
  const ceLtp = Number(row.ltp_CE || 0);

  const peOi = Number(row.oi_PE || 0);
  const peOiChg = Number(row.oich_PE || 0);
  const peLtp = Number(row.ltp_PE || 0);

  const ceBarWidth = maxOi > 0 ? Math.min(100, (ceOi / maxOi) * 100) : 0;
  const peBarWidth = maxOi > 0 ? Math.min(100, (peOi / maxOi) * 100) : 0;

  const formatCompact = (val) => {
    if (!val || isNaN(val)) return '0';
    if (Math.abs(val) >= 100000) return (val / 100000).toFixed(1) + 'L';
    if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'k';
    return String(val);
  };

  return (
    <View style={[styles.row, isATM && styles.atmRow]}>
      {/* CALL SIDE */}
      <View style={styles.sideColumn}>
        {/* Visual OI Bar Background */}
        <View style={[styles.ceOiBar, { width: `${ceBarWidth}%` }]} />
        <View style={styles.cellContent}>
          <Text style={[styles.oiText, { color: THEME.colors.bearish }]}>{formatCompact(ceOi)}</Text>
          <Text style={[styles.oiChgText, ceOiChg >= 0 ? styles.positiveChg : styles.negativeChg]}>
            {ceOiChg > 0 ? `+${formatCompact(ceOiChg)}` : formatCompact(ceOiChg)}
          </Text>
          <Text style={styles.ltpText}>₹{ceLtp.toFixed(1)}</Text>
        </View>
      </View>

      {/* STRIKE CENTER */}
      <View style={[styles.strikeCenter, isATM && styles.atmStrikeCenter]}>
        <Text style={[styles.strikeText, isATM && styles.atmStrikeText]}>{strike}</Text>
        {isATM ? <Text style={styles.atmBadge}>ATM</Text> : null}
      </View>

      {/* PUT SIDE */}
      <View style={styles.sideColumn}>
        {/* Visual OI Bar Background */}
        <View style={[styles.peOiBar, { width: `${peBarWidth}%` }]} />
        <View style={[styles.cellContent, { justifyContent: 'flex-end' }]}>
          <Text style={styles.ltpText}>₹{peLtp.toFixed(1)}</Text>
          <Text style={[styles.oiChgText, peOiChg >= 0 ? styles.positiveChg : styles.negativeChg]}>
            {peOiChg > 0 ? `+${formatCompact(peOiChg)}` : formatCompact(peOiChg)}
          </Text>
          <Text style={[styles.oiText, { color: THEME.colors.bullish }]}>{formatCompact(peOi)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderLight,
    backgroundColor: THEME.colors.bgDark,
  },
  atmRow: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: THEME.colors.primary,
  },
  sideColumn: {
    flex: 1,
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  ceOiBar: {
    position: 'absolute',
    left: 0,
    top: 2,
    bottom: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 2,
  },
  peOiBar: {
    position: 'absolute',
    right: 0,
    top: 2,
    bottom: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 2,
  },
  cellContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  oiText: {
    fontSize: 11,
    fontWeight: '800',
    width: 42,
  },
  oiChgText: {
    fontSize: 10,
    fontWeight: '600',
    width: 38,
  },
  positiveChg: {
    color: THEME.colors.bullish,
  },
  negativeChg: {
    color: THEME.colors.bearish,
  },
  ltpText: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 46,
  },
  strikeCenter: {
    width: 76,
    height: '100%',
    backgroundColor: THEME.colors.bgCardElevated,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: THEME.colors.border,
  },
  atmStrikeCenter: {
    backgroundColor: THEME.colors.primary,
  },
  strikeText: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  atmStrikeText: {
    color: '#071a26',
    fontWeight: '900',
  },
  atmBadge: {
    color: '#071a26',
    fontSize: 8,
    fontWeight: '900',
    marginTop: -2,
  },
});
