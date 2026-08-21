import axios from 'axios';
import { getDefaultServerUrl, getStoredAuth, getStoredServerUrl, normalizeServerUrl } from './storage';

let currentServerUrl = getDefaultServerUrl();
// Get the backend URL.
export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('trycloudflare.com')) {
      return window.location.origin;
    }
    // Bypass Next.js rewrite proxy (which has hanging issues) by directly hitting port 5000
    // on the current hostname (works for localhost or local IP).
    return window.location.protocol + '//' + window.location.hostname + ':5000';
  }
  return 'http://127.0.0.1:5000';
};

const API_BASE_URL = getApiBaseUrl();

export const setApiBaseUrl = (url) => {
  // No-op for web storage
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use(async (config) => {
  // Bypass localtunnel warning page
  config.headers['Bypass-Tunnel-Reminder'] = 'true';
  config.headers['localtunnel-bypass'] = 'true';

  const { token } = await getStoredAuth();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  // Authentication
  login: async (username, password) => {
    const res = await apiClient.post('/api/login', { username, password });
    return res.data;
  },

  checkAuth: async () => {
    const res = await apiClient.get('/api/check_auth');
    return res.data;
  },

  // Health / Connection Test
  checkHealth: async (customUrl) => {
    const url = normalizeServerUrl(customUrl || currentServerUrl) + `/api/health?t=${Date.now()}`;
    const res = await axios.get(url, { timeout: 75000 });
    return res.data;
  },

  // Market Data & Option Chain
  getIndexData: async (indexName, strikeCount = 25) => {
    const sym = encodeURIComponent(indexName);
    const res = await apiClient.get(`/api/dashboard?index=${sym}&strikecount=${strikeCount}`);
    return res.data;
  },

  getIndexLegacy: async (indexName, strikeCount = 25) => {
    const res = await apiClient.get(`/api/index/${indexName}?strikecount=${strikeCount}`);
    return res.data;
  },

  getOptionChain: async (indexName, strikeCount = 25) => {
    const sym = encodeURIComponent(indexName);
    const res = await apiClient.get(`/api/option-chain?index=${sym}&strikecount=${strikeCount}`);
    return res.data;
  },

  getMarketStrip: async () => {
    const res = await apiClient.get('/api/market-strip');
    return res.data;
  },

  getHomeDashboard: async () => {
    const res = await apiClient.get('/api/home-dashboard');
    return res.data;
  },

  getDashboardHistory: async () => {
    const res = await apiClient.get('/api/dashboard-history');
    return res.data;
  },

  getStockOptionsScan: async () => {
    const res = await apiClient.get('/api/stock-options/scan');
    return res.data;
  },

  getStockOptionsDetail: async (symbol: string) => {
    const res = await apiClient.get(`/api/stock-options/detail?symbol=${symbol}`);
    return res.data;
  },

  getFyersTokenStatus: async () => {
    const res = await apiClient.get('/api/fyers/token-status');
    return res.data;
  },

  getFyersHistory: async (symbol: string, resolution: string = '5', lookback: number = 21600) => {
    const params: any = { symbol, resolution, lookback };
    const res = await apiClient.get('/api/fyers/history', { params });
    return res.data;
  },

  getSectorStocks: async () => {
    const res = await apiClient.get('/api/sector-stocks');
    return res.data;
  },

  saveDashboardHistory: async (historyData) => {
    const res = await apiClient.post('/api/dashboard-history', historyData);
    return res.data;
  },

  getMarketNews: async () => {
    const res = await apiClient.get('/api/market-news');
    return res.data;
  },

  totpLogin: async (credentials = {}) => {
    const res = await apiClient.post('/api/fyers/totp-login', credentials);
    return res.data;
  },

  saveTotpCredentials: async (credentials) => {
    const res = await apiClient.post('/api/fyers/save-totp-credentials', credentials);
    return res.data;
  },
};
