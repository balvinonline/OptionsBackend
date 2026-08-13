import React, { useState } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const OiBarChart = ({ chain, atm, expandedView = false }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [mode, setMode] = useState('OI'); // 'OI' or 'CHANGE'
  const [isExpanded, setIsExpanded] = useState(false);

  if (!chain || chain.length === 0) return null;

  // Trim chain to 11 strikes (5 ITM, ATM, 5 OTM) so it's not overcrowded
  let displayChain = chain;
  const numStrikes = 11;
  const atmIndex = displayChain.findIndex(row => Number(row.strike) === Number(atm));
  
  if (atmIndex !== -1 && displayChain.length > numStrikes && !expandedView) {
    const half = Math.floor(numStrikes / 2);
    let start = Math.max(0, atmIndex - half);
    let end = start + numStrikes;
    
    if (end > displayChain.length) {
      end = displayChain.length;
      start = Math.max(0, end - numStrikes);
    }
    displayChain = displayChain.slice(start, end);
  }

  // Derive total metrics for the banner
  const totalCeOi = chain.reduce((sum, row) => sum + (Number(row.oi_CE) || 0), 0);
  const totalPeOi = chain.reduce((sum, row) => sum + (Number(row.oi_PE) || 0), 0);
  const totalCeOich = chain.reduce((sum, row) => sum + (Number(row.oich_CE) || 0), 0);
  const totalPeOich = chain.reduce((sum, row) => sum + (Number(row.oich_PE) || 0), 0);
  const pcr = totalCeOi > 0 ? (totalPeOi / totalCeOi).toFixed(2) : '-';

  // Find max values for scaling the bars
  let maxOi = 1;
  let maxChange = 1;

  displayChain.forEach(row => {
    const ceOi = Number(row.oi_CE) || 0;
    const peOi = Number(row.oi_PE) || 0;
    const ceChg = Math.abs(Number(row.oich_CE) || 0);
    const peChg = Math.abs(Number(row.oich_PE) || 0);

    if (ceOi > maxOi) maxOi = ceOi;
    if (peOi > maxOi) maxOi = peOi;
    if (ceChg > maxChange) maxChange = ceChg;
    if (peChg > maxChange) maxChange = peChg;
  });

  const formatCompact = (val) => {
    if (!val || isNaN(val)) return '0';
    if (Math.abs(val) >= 100000) return (val / 100000).toFixed(1) + 'L';
    if (Math.abs(val) >= 1000) return (val / 1000).toFixed(0) + 'k';
    return String(val);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{mode === 'OI' ? 'Open Interest' : 'Open Interest Change'}</Text>
          <Text style={styles.subtitle}>{atm ? `₹${atm} ATM` : 'Near ATM Strikes'}</Text>
        </View>
        <View style={styles.toggleGroup}>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'OI' && styles.toggleActive]}
            onPress={() => setMode('OI')}
          >
            <Text style={[styles.toggleText, mode === 'OI' && styles.toggleTextActive]}>OI</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'CHANGE' && styles.toggleActive]}
            onPress={() => setMode('CHANGE')}
          >
            <Text style={[styles.toggleText, mode === 'CHANGE' && styles.toggleTextActive]}>Chg</Text>
          </TouchableOpacity>
        </View>
        {!expandedView && (
          <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.expandBtn}>
            <Ionicons name="expand" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>PCR</Text>
          <Text style={[styles.statVal, { color: pcr > 1 ? theme.colors.bullish : theme.colors.bearish }]}>{pcr}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Call {mode}</Text>
          <Text style={[styles.statVal, { color: theme.colors.bearish }]}>
            {formatCompact(mode === 'OI' ? totalCeOi : totalCeOich)}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Put {mode}</Text>
          <Text style={[styles.statVal, { color: theme.colors.bullish }]}>
            {formatCompact(mode === 'OI' ? totalPeOi : totalPeOich)}
          </Text>
        </View>
      </View>

      <View style={styles.chartArea}>
        {displayChain.map(row => {
          const strike = Number(row.strike);
          const isAtm = strike === Number(atm);
          
          const ceVal = mode === 'OI' ? Number(row.oi_CE) : Number(row.oich_CE);
          const peVal = mode === 'OI' ? Number(row.oi_PE) : Number(row.oich_PE);
          
          const maxVal = mode === 'OI' ? maxOi : maxChange;
          
          // Minimum bar height 2% so empty bars are slightly visible
          const ceHeight = Math.max(2, (Math.abs(ceVal || 0) / maxVal) * 100);
          const peHeight = Math.max(2, (Math.abs(peVal || 0) / maxVal) * 100);

          return (
            <View key={strike} style={[styles.barCol, isAtm && styles.atmCol]}>
              <View style={styles.barWrap}>
                <View style={[styles.bar, styles.ceBar, { height: `${ceHeight}%` }]} />
                <View style={[styles.bar, styles.peBar, { height: `${peHeight}%` }]} />
              </View>
              <Text style={styles.strikeText} numberOfLines={1} adjustsFontSizeToFit>
                {strike >= 1000 ? (strike / 1000).toFixed(1) + 'k' : strike}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.bearish }]} />
          <Text style={styles.legendText}>Call OI (Resistance)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.bullish }]} />
          <Text style={styles.legendText}>Put OI (Support)</Text>
        </View>
      </View>

      {/* Expanded Fullscreen Modal */}
      <Modal visible={isExpanded} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsExpanded(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Advanced Open Interest</Text>
            <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, padding: 10 }}>
            {/* Render itself recursively with expanded flag */}
            <OiBarChart chain={chain} atm={atm} expandedView={true} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bgCardSolid,
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgApp,
    borderRadius: 6,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  toggleActive: {
    backgroundColor: theme.colors.bgCard,
    ...theme.shadows.small,
  },
  toggleText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: theme.colors.primary,
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 12,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  statVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  chartArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120, // Revert to standard height
    paddingTop: 10,
    paddingHorizontal: 2,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  atmCol: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
  },
  barWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: '100%',
    gap: 1,
  },
  bar: {
    width: 6,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  ceBar: {
    backgroundColor: theme.colors.bearish,
  },
  peBar: {
    backgroundColor: theme.colors.bullish,
  },
  strikeText: {
    fontSize: 7.5,
    color: theme.colors.textSecondary,
    marginTop: 6,
    marginBottom: 4,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  expandBtn: {
    marginLeft: 10,
    padding: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
});
