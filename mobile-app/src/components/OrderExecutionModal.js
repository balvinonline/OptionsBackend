import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { Ionicons } from '@expo/vector-icons';

export const OrderExecutionModal = ({ visible, onClose, optionData }) => {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [qty, setQty] = useState('25');
  const [maxRisk, setMaxRisk] = useState('1000');
  const [slPoints, setSlPoints] = useState('20');
  const [isExecuting, setIsExecuting] = useState(false);

  if (!optionData) return null;

  const handleExecute = async (side) => {
    setIsExecuting(true);
    try {
      const orderPayload = {
        symbol: optionData.symbol,
        qty: parseInt(qty) || 25,
        side: side, // 1 for Buy, -1 for Sell
        type: 2, // Market
        productType: 'MARGIN'
      };
      
      const result = await api.placeOrder(orderPayload);
      
      if (result.ok) {
        Alert.alert('Order Placed!', `Successfully placed ${side === 1 ? 'BUY' : 'SELL'} for ${optionData.symbol}`);
        onClose();
      } else {
        Alert.alert('Order Failed', result.error || 'Unknown error');
      }
    } catch (err) {
      Alert.alert('Execution Error', err.message || 'Network error');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>1-Click Execution</Text>
            <TouchableOpacity onPress={onClose} disabled={isExecuting}>
              <Ionicons name="close" size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.detailsBox}>
            <Text style={styles.symbolText}>{optionData.symbol}</Text>
            <Text style={styles.ltpText}>LTP: {optionData.ltp ? optionData.ltp.toFixed(2) : '-'}</Text>
          </View>

          <View style={styles.inputRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.label}>Max Risk (₹):</Text>
              <TextInput
                style={styles.input}
                value={String(maxRisk)}
                onChangeText={(val) => {
                  setMaxRisk(val);
                  if (val && slPoints > 0) {
                    setQty(String(Math.floor(Number(val) / slPoints)));
                  }
                }}
                keyboardType="number-pad"
                placeholder="e.g. 2000"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.label}>SL Points:</Text>
              <TextInput
                style={styles.input}
                value={String(slPoints)}
                onChangeText={(val) => {
                  setSlPoints(val);
                  if (val > 0 && maxRisk > 0) {
                    setQty(String(Math.floor(maxRisk / Number(val))));
                  }
                }}
                keyboardType="number-pad"
                placeholder="e.g. 20"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Qty (Lots):</Text>
              <TextInput
                style={styles.input}
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
              />
            </View>
          </View>
          
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={16} color={theme.colors.warning} />
            <Text style={styles.warningText}>This will place a live MARKET order via your Fyers API.</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.btn, styles.btnBuy]} 
              onPress={() => handleExecute(1)}
              disabled={isExecuting}
            >
              {isExecuting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>BUY MARKET</Text>}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btn, styles.btnSell]} 
              onPress={() => handleExecute(-1)}
              disabled={isExecuting}
            >
              {isExecuting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>SELL MARKET</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  detailsBox: {
    backgroundColor: theme.colors.bgDark,
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  symbolText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  ltpText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginRight: 10,
  },
  input: {
    backgroundColor: theme.colors.bgDark,
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 100,
    textAlign: 'center',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
  },
  warningText: {
    color: theme.colors.warning,
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBuy: {
    backgroundColor: theme.colors.bullish,
  },
  btnSell: {
    backgroundColor: theme.colors.bearish,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
