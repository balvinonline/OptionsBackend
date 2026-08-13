import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';
import { getApiBaseUrl } from '../services/api';
import { Ionicons } from '@expo/vector-icons';

export const CandlestickChart = ({ symbol = 'NIFTY', height = 260, expandedView = false }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [isExpanded, setIsExpanded] = useState(false);
  const serverUrl = getApiBaseUrl();
  const apiEndpoint = `${serverUrl}/api/fyers/history?symbol=${symbol}&resolution=5&lookback=1875`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js"></script>
        <style>
          body { margin: 0; padding: 0; background-color: ${theme.colors.bgCardSolid}; }
          #tvchart { width: 100vw; height: 100vh; }
          #loading { color: ${theme.colors.textMuted}; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: sans-serif; font-size: 14px; }
        </style>
      </head>
      <body>
        <div id="loading">Loading Chart...</div>
        <div id="tvchart"></div>
        <script>
          window.onerror = function(msg, url, lineNo, columnNo, error) {
            document.getElementById('loading').innerText = 'JS Error: ' + msg;
            return false;
          };

          const chartOptions = { 
            layout: { textColor: '${theme.colors.textMuted}', background: { type: 'solid', color: '${theme.colors.bgCardSolid}' } },
            grid: { vertLines: { color: '${theme.colors.borderLight}' }, horzLines: { color: '${theme.colors.borderLight}' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            timeScale: { timeVisible: true, secondsVisible: false, borderColor: '${theme.colors.borderLight}' },
            rightPriceScale: { borderColor: '${theme.colors.borderLight}' }
          };
          const chart = LightweightCharts.createChart(document.getElementById('tvchart'), chartOptions);
          const candleSeries = chart.addCandlestickSeries({
            upColor: '${theme.colors.bullish}', downColor: '${theme.colors.bearish}', 
            borderDownColor: '${theme.colors.bearish}', borderUpColor: '${theme.colors.bullish}',
            wickDownColor: '${theme.colors.bearish}', wickUpColor: '${theme.colors.bullish}'
          });
          
          let lastChartData = [];

          function loadHistoricalData() {
            fetch('${apiEndpoint}')
              .then(res => res.json())
              .then(data => {
                if (data && data.candles && data.candles.length > 0) {
                  document.getElementById('loading').style.display = 'none';
                  
                  const formattedData = data.candles.map(c => {
                    let timeVal = c.ts;
                    if (timeVal > 10000000000) timeVal = Math.floor(timeVal / 1000); 
                    
                    return {
                      time: timeVal + 19800, // +5:30 offset for IST hack for Lightweight charts
                      open: c.open,
                      high: c.high,
                      low: c.low,
                      close: c.close
                    };
                  });
                  
                  lastChartData = formattedData;
                  candleSeries.setData(formattedData);
                  
                  // Zoom to recent data
                  const dataLen = formattedData.length;
                  if (dataLen > 100) {
                    chart.timeScale().setVisibleRange({
                      from: formattedData[dataLen - 100].time,
                      to: formattedData[dataLen - 1].time
                    });
                  }
                } else {
                  document.getElementById('loading').innerText = 'No Data Available';
                }
              })
              .catch(err => {
                document.getElementById('loading').innerText = 'Error Loading Chart';
              });
          }

          function startLiveUpdates() {
            setInterval(() => {
              if (lastChartData.length === 0) return;
              
              fetch('${serverUrl}/api/fyers/quote?symbol=${symbol}')
                .then(res => res.json())
                .then(data => {
                  if (data && data.quote && data.quote.ltp) {
                    const ltp = data.quote.ltp;
                    const currentLast = lastChartData[lastChartData.length - 1];
                    const nowTs = Math.floor(Date.now() / 1000) + 19800;
                    
                    // If we are in the same 5-minute candle
                    if (nowTs - currentLast.time < 300) {
                      currentLast.close = ltp;
                      if (ltp > currentLast.high) currentLast.high = ltp;
                      if (ltp < currentLast.low) currentLast.low = ltp;
                      candleSeries.update(currentLast);
                    } else {
                      // Time for a new candle
                      const newCandle = {
                        time: currentLast.time + 300,
                        open: currentLast.close,
                        high: ltp,
                        low: ltp,
                        close: ltp
                      };
                      lastChartData.push(newCandle);
                      candleSeries.update(newCandle);
                    }
                  }
                })
                .catch(e => console.error(e));
            }, 3000);
          }

          loadHistoricalData();
          startLiveUpdates();
            
            window.addEventListener('resize', () => {
              chart.applyOptions({ width: window.innerWidth, height: window.innerHeight });
            });
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height: expandedView ? '100%' : height, marginHorizontal: expandedView ? 0 : 14, marginTop: expandedView ? 0 : 12 }]}>
      {!expandedView && (
        <View style={styles.header}>
          <Text style={styles.title}>{symbol} INTRADAY (5M)</Text>
          <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.expandBtn}>
            <Ionicons name="expand" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="always"
        originWhitelist={['*']}
      />

      <Modal visible={isExpanded} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsExpanded(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{symbol} INTRADAY (5M)</Text>
            <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <CandlestickChart symbol={symbol} expandedView={true} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  expandBtn: {
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
  }
});
