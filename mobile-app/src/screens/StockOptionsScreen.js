import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../services/api';
import { ServerSettingsModal } from '../components/ServerSettingsModal';

export const StockOptionsScreen = ({ onNavigate, onNavigateDesk }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState(''); // text filter

  const fetchScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const serverUrl = getApiBaseUrl();
      const res = await fetch(`${serverUrl}/api/stock-options/scan`);
      const data = await res.json();
      if (data && data.rows) {
        setStocks(data.rows);
      } else if (Array.isArray(data)) {
        setStocks(data);
      } else {
        setStocks([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScan();
    const interval = setInterval(() => {
      fetchScan();
    }, 15000); // 15 seconds auto-refresh
    return () => clearInterval(interval);
  }, [fetchScan]);

  const filteredStocks = stocks.filter(s => 
    !filter || s.symbol.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="bar-chart" size={20} color={theme.colors.primary} />
          <Text style={styles.headerTitle}>F&O STOCK SCANNER</Text>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color={theme.colors.bearish} />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={fetchScan}>
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading && stocks.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>Scanning 185+ F&O Stocks...</Text>
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 12 }}>
          <FlashList
            data={filteredStocks}
            estimatedItemSize={75}
            renderItem={({ item: stock }) => {
              const isBullish = stock.actionChangePct > 0 || stock.change_pct > 0;
              return (
                <TouchableOpacity 
                  style={[styles.stockCard, { marginBottom: 10 }]}
                  onPress={() => onNavigateDesk && onNavigateDesk(stock.symbol)}
                >
                  <View style={styles.stockLeft}>
                    <Text style={styles.stockSymbol}>{stock.symbol}</Text>
                    <Text style={styles.stockLtp}>₹{Number(stock.ltp).toFixed(2)}</Text>
                  </View>
                  
                  <View style={styles.stockRight}>
                    <View style={styles.badge}>
                      <Text style={[styles.badgeText, { color: isBullish ? theme.colors.bullish : theme.colors.bearish }]}>
                        {stock.change_pct > 0 ? '+' : ''}{Number(stock.change_pct).toFixed(2)}%
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} style={{ marginLeft: 8 }} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      <ServerSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgDark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.bgDark,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 0.5,
  },
  settingsBtn: {
    padding: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bearishBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.bearishBorder,
  },
  errorBannerText: {
    color: theme.colors.bearish,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  centerBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 12,
    gap: 10,
  },
  stockCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCardSolid,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.card,
  },
  stockLeft: {
    gap: 4,
  },
  stockSymbol: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  stockLtp: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  stockRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  }
});
