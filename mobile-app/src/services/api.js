import axios from 'axios';
import { getDefaultServerUrl, getStoredAuth, getStoredServerUrl, normalizeServerUrl } from './storage';

let currentServerUrl = getDefaultServerUrl();

// Initialize server URL from storage
getStoredServerUrl().then((url) => {
  currentServerUrl = url;
});

export const setApiBaseUrl = (url) => {
  currentServerUrl = normalizeServerUrl(url);
};

export const getApiBaseUrl = () => currentServerUrl;

const apiClient = axios.create({
  timeout: 25000,
});

apiClient.interceptors.request.use(async (config) => {
  config.baseURL = currentServerUrl;
  
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

  getFyersTokenStatus: async () => {
    const res = await apiClient.get('/api/fyers/token-status');
    return res.data;
  },

  getFyersHistory: async (symbol, resolution = '5', fromDate, toDate) => {
    const params = { symbol, resolution };
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
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
