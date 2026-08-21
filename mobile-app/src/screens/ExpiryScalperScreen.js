import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useMarket } from '../context/MarketContext';
import { IndexHeader } from '../components/IndexHeader';
import { OrderExecutionModal } from '../components/OrderExecutionModal';
import { Ionicons } from '@expo/vector-icons';

export const ExpiryScalperScreen = () => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const { marketData, liveGreeks } = useMarket();
  const [selectedOption, setSelectedOption] = useState(null);

  const chain = marketData?.chain || [];
  
  // Filter for Zero-to-Hero candidates (Premiums < 40, High Volume/OI ratio)
  const candidates = [];
  chain.forEach(row => {
    // Call Side Analysis
    if (row.ce_ltp > 0 && row.ce_ltp <= 40) {
      const volOiRatio = (row.ce_volume || 0) / (row.ce_oi || 1);
      if (volOiRatio > 2 || (row.ce_ch > 0 && row.ce_oich > 0)) {
        candidates.push({
          type: 'CE',
          strike: row.strike,
          symbol: row.ce_symbol || row.symbol_CE,
          ltp: row.ce_ltp,
          chg: row.ce_ch,
          vol: row.ce_volume,
          oi: row.ce_oi,
          ratio: volOiRatio,
          color: theme.colors.bullish,
          icon: 'trending-up'
        });
      }
    }
    
    // Put Side Analysis
    if (row.pe_ltp > 0 && row.pe_ltp <= 40) {
      const volOiRatio = (row.pe_volume || 0) / (row.pe_oi || 1);
      if (volOiRatio > 2 || (row.pe_ch > 0 && row.pe_oich > 0)) {
        candidates.push({
          type: 'PE',
          strike: row.strike,
          symbol: row.pe_symbol || row.symbol_PE,
          ltp: row.pe_ltp,
          chg: row.pe_ch,
          vol: row.pe_volume,
          oi: row.pe_oi,
          ratio: volOiRatio,
          color: theme.colors.bearish,
          icon: 'trending-down'
        });
      }
    }
  });

  // Sort by highest Volume/OI ratio (highest momentum/squeeze potential)
  candidates.sort((a, b) => b.ratio - a.ratio);

  return (
    <View style={styles.container}>
      <IndexHeader />
      <ScrollView style={styles.scrollArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Zero-to-Hero Expiry Scalper</Text>
          <Text style={styles.subtitle}>Scanning for Out-of-the-Money options (₹5 - ₹40) with explosive Volume-to-OI ratios indicating institutional accumulation or panic squeezing.</Text>
        </View>

        {candidates.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>No Zero-to-Hero setups currently detected.</Text>
            <Text style={styles.emptySub}>Wait for massive volume spikes in OTM strikes.</Text>
          </View>
        ) : (
          candidates.map((c, i) => (
            <TouchableOpacity 
              key={i} 
              style={[styles.candidateCard, { borderColor: c.color }]}
              onPress={() => setSelectedOption({ symbol: c.symbol, ltp: c.ltp, side: c.type })}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: c.color }]}>
                  <Text style={styles.badgeText}>{c.strike} {c.type}</Text>
                </View>
                <Text style={[styles.ltpText, { color: c.color }]}>₹{c.ltp.toFixed(2)}</Text>
              </View>
              
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Momentum Ratio</Text>
                  <Text style={styles.statValue}>{c.ratio.toFixed(1)}x</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Volume</Text>
                  <Text style={styles.statValue}>{(c.vol/100000).toFixed(2)}L</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Day Change</Text>
                  <Text style={[styles.statValue, { color: c.chg > 0 ? theme.colors.bullish : theme.colors.bearish }]}>
                    {c.chg > 0 ? '+' : ''}{c.chg.toFixed(1)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.actionBtn}>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={styles.actionText}>EXECUTE SCALP</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <OrderExecutionModal 
        visible={!!selectedOption} 
        optionData={selectedOption} 
        onClose={() => setSelectedOption(null)} 
      />
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgDark },
  scrollArea: { flex: 1, padding: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 16, color: theme.colors.textPrimary, fontWeight: '600' },
  emptySub: { fontSize: 13, color: theme.colors.textMuted },
  candidateCard: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  ltpText: { fontSize: 24, fontWeight: '900' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statBox: { alignItems: 'center' },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});
