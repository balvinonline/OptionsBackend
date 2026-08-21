import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiBaseUrl } from '../services/api';
import io from 'socket.io-client';
import EventSource from 'react-native-sse';
import { soundManager } from '../components/AudioAlertHelper';

const MarketContext = createContext(null);

export const SUPPORTED_INDEXES = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY'];

const LIVE_INDEXES = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY'];

const INDEX_LABELS = {
  NIFTY: 'NIFTY 50',
  BANKNIFTY: 'NIFTY BANK',
  SENSEX: 'SENSEX',
  FINNIFTY: 'NIFTY FIN SERVICE',
  MIDCPNIFTY: 'NIFTY MIDCAP 100',
};

const normalizeIndexKey = (value = '') => {
  const text = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!text) return '';
  if (text.includes('BANKNIFTY') || text.includes('NIFTYBANK')) return 'BANKNIFTY';
  if (text.includes('SENSEX')) return 'SENSEX';
  if (text.includes('FINNIFTY') || text.includes('FINSERVICE')) return 'FINNIFTY';
  if (text.includes('MIDCPNIFTY') || text.includes('MIDCAP')) return 'MIDCPNIFTY';
  if (text.includes('NIFTY50') || text === 'NIFTY') return 'NIFTY';
  return '';
};

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const calculateEmaSeries = (values = [], period = 9) => {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const out = [];
  clean.forEach((value, index) => {
    if (index === 0) out.push(value);
    else out.push((value - out[index - 1]) * multiplier + out[index - 1]);
  });
  return out;
};

const average = (values = []) => {
  const clean = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const nearestAbove = (levels = [], spot = 0) => {
  return levels
    .map((item) => Number(item?.strike ?? item))
    .filter((level) => Number.isFinite(level) && level >= spot)
    .sort((a, b) => a - b)[0] || null;
};

const nearestBelow = (levels = [], spot = 0) => {
  return levels
    .map((item) => Number(item?.strike ?? item))
    .filter((level) => Number.isFinite(level) && level <= spot)
    .sort((a, b) => b - a)[0] || null;
};

const normalizeTickPayload = (payload) => {
  if (!payload) return null;
  const tick = payload.tick || payload;
  const key = normalizeIndexKey(payload.symbol) || normalizeIndexKey(payload.sourceSymbol) || normalizeIndexKey(tick.symbol);
  if (!key) return null;

  const ltp = firstFiniteNumber(tick.ltp, tick.last_price, tick.price, tick.value);
  if (ltp === null) return null;

  return {
};
