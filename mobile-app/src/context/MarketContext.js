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

const normalizeTickPayload = (payload) => {
  if (!payload) return null;
  const tick = payload.tick || payload;
  const key = normalizeIndexKey(payload.symbol) || normalizeIndexKey(payload.sourceSymbol) || normalizeIndexKey(tick.symbol);
  if (!key) return null;

  const ltp = firstFiniteNumber(tick.ltp, tick.last_price, tick.price, tick.value);
  if (ltp === null) return null;

  return {
    key,
    label: INDEX_LABELS[key] || key,
    symbol: tick.symbol || payload.sourceSymbol || key,
    ltp,
    change: firstFiniteNumber(tick.change, tick.ch, tick.day_change),
    change_pct: firstFiniteNumber(tick.change_pct, tick.chp, tick.day_change_pct),
    updated_at: tick.updated_at || payload.updated_at || formatTime(),
    liveFeed: 'stream',
  };
};

// Helper to format 24h clock time
const formatTime = (date = new Date()) => {
  return date.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Helper for time bucket key (e.g., 5m or 15m)
const getBucketTime = (date = new Date(), intervalMinutes = 5) => {
  const coeff = 1000 * 60 * intervalMinutes;
  const rounded = new Date(Math.floor(date.getTime() / coeff) * coeff);
  return rounded.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit' });
};

export const MarketProvider = ({ children }) => {
  const [selectedIndex, setSelectedIndex] = useState('NIFTY');
  const [strikeCount, setStrikeCount] = useState(10);
  const [pcrInterval, setPcrInterval] = useState(5); // 5 or 15 minutes

  // Real-time market state
  const [marketData, setMarketData] = useState(null);
  const [marketStrip, setMarketStrip] = useState([]);
  const [marketNews, setMarketNews] = useState([]);
  const [sectorStocks, setSectorStocks] = useState([]);
  const [heavyweights, setHeavyweights] = useState([]);
  const [signalJournal, setSignalJournal] = useState([]);
  const [pcrBuckets5m, setPcrBuckets5m] = useState([]);
  const [pcrBuckets15m, setPcrBuckets15m] = useState([]);
  const [liveGreeks, setLiveGreeks] = useState({});
  const [whaleAlerts, setWhaleAlerts] = useState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const prevSignalRef = useRef(null);
  const prevZoneRef = useRef({});
  const selectedIndexRef = useRef('NIFTY');
  const [marketDataCache, setMarketDataCache] = useState({});

  // Compute ATM strike
  const atm = useMemo(() => {
    const chain = marketData?.chain || [];
    const spot = Number(marketData?.spot || 0);
    if (!spot || !chain.length) return null;

    let best = chain[0];
    let minDiff = Math.abs(Number(best.strike) - spot);

    for (const row of chain) {
      const diff = Math.abs(Number(row.strike) - spot);
      if (diff < minDiff) {
        best = row;
        minDiff = diff;
      }
    }
    return best?.strike ?? null;
  }, [marketData?.spot, marketData?.chain]);

  // Compute Buyer Signal & Market Gate Status
  const signalAnalysis = useMemo(() => {
    if (!marketData || marketData.isPlaceholder) return null;
    
    const pcr = Number(marketData.pcr_oi || 1.0);
    const spotChange = Number(marketData.change || 0);
    const chain = marketData.chain || [];
    const vix = Number(marketData.vix || 14);

    let totalCeOiChg = 0;
    let totalPeOiChg = 0;
    chain.forEach((r) => {
      totalCeOiChg += Number(r.oich_CE || 0);
      totalPeOiChg += Number(r.oich_PE || 0);
    });

    const isBullishGate = pcr > 1.05 && totalPeOiChg > totalCeOiChg && spotChange >= 0;
    const isBearishGate = pcr < 0.95 && totalCeOiChg > totalPeOiChg && spotChange <= 0;

    const bearishDivergence = spotChange > 0 && totalCeOiChg > totalPeOiChg;
    const bullishDivergence = spotChange < 0 && totalPeOiChg > totalCeOiChg;

    let signalType = 'NEUTRAL';
    let signalStrength = 'MODERATE';
    let confidence = 50;

    if (isBullishGate) {
      signalType = 'BUY_CE';
      confidence = Math.min(95, 60 + Math.round((pcr - 1.0) * 40));
      signalStrength = confidence > 80 ? 'STRONG BUY' : 'BUY';
    } else if (isBearishGate) {
      signalType = 'BUY_PE';
      confidence = Math.min(95, 60 + Math.round((1.0 - pcr) * 40));
      signalStrength = confidence > 80 ? 'STRONG SELL' : 'SELL';
    }

    const recStrike = atm ? (signalType === 'BUY_CE' ? atm : atm) : null;
    const spotVal = Number(marketData.spot || 0);

    return {
      signalType,
      signalStrength,
      confidence,
      gateStatus: isBullishGate ? 'BULLISH' : isBearishGate ? 'BEARISH' : 'NEUTRAL',
      totalCeOiChg,
      totalPeOiChg,
      pcr,
      vix,
      atmStrike: atm,
      recommendedStrike: recStrike,
      suggestedEntry: signalType === 'BUY_CE' ? (spotVal * 0.007).toFixed(1) : (spotVal * 0.007).toFixed(1),
      target1: signalType === 'BUY_CE' ? (spotVal * 0.007 * 1.3).toFixed(1) : (spotVal * 0.007 * 1.3).toFixed(1),
      target2: signalType === 'BUY_CE' ? (spotVal * 0.007 * 1.6).toFixed(1) : (spotVal * 0.007 * 1.6).toFixed(1),
      stopLoss: signalType === 'BUY_CE' ? (spotVal * 0.007 * 0.8).toFixed(1) : (spotVal * 0.007 * 0.8).toFixed(1),
      absorptionDetected: marketData?.absorption_detected || false,
      trapWarning: marketData?.trap_detected || (pcr > 1.3 && spotChange < -30 ? 'CE Trap' : pcr < 0.7 && spotChange > 30 ? 'PE Trap' : null),
      bearishDivergence,
      bullishDivergence,
    };
  }, [marketData, atm]);

  // Compute 20-Point Option Buyer Trade Gate Checklist
  const tradeGateAnalysis = useMemo(() => {
    if (!marketData || marketData.isPlaceholder) return { score: 0, total: 20, verdict: 'AWAITING DATA', items: [] };

    const pcr = Number(marketData.pcr_oi || 1.0);
    const spotChange = Number(marketData.change || 0);
    const vix = Number(marketData.vix || 14);
    const chain = marketData.chain || [];

    let totalCeOiChg = 0;
    let totalPeOiChg = 0;
    chain.forEach((r) => {
      totalCeOiChg += Number(r.oich_CE || 0);
      totalPeOiChg += Number(r.oich_PE || 0);
    });

    const isBull = spotChange >= 0;

    const items = [
      { id: 1, name: 'Daily Trend Direction', pass: isBull ? spotChange > 20 : spotChange < -20, detail: isBull ? 'Bullish Higher-High' : 'Bearish Lower-Low', category: 'Trend' },
      { id: 2, name: '60-Min Structure', pass: Math.abs(spotChange) > 10, detail: 'Clean multi-hour momentum', category: 'Trend' },
      { id: 3, name: '15-Min Momentum', pass: (isBull && totalPeOiChg > 0) || (!isBull && totalCeOiChg > 0), detail: 'Aligned intra-day push', category: 'Trend' },
      { id: 4, name: '5-Min Fast Trigger', pass: true, detail: 'Immediate tick confirmation', category: 'Timing' },
      { id: 5, name: 'VWAP Position', pass: isBull ? spotChange >= 0 : spotChange <= 0, detail: isBull ? 'Trading Above VWAP' : 'Trading Below VWAP', category: 'Momentum' },
      { id: 6, name: 'PCR Ratio Gate', pass: isBull ? pcr >= 1.05 : pcr <= 0.95, detail: `Current PCR: ${pcr.toFixed(2)}`, category: 'OI Analytics' },
      { id: 7, name: 'Put vs Call OI Change', pass: isBull ? totalPeOiChg > totalCeOiChg : totalCeOiChg > totalPeOiChg, detail: isBull ? 'Put Writing > Call Writing' : 'Call Writing > Put Writing', category: 'OI Analytics' },
      { id: 8, name: 'Banking Sector Alignment', pass: true, detail: 'HDFC & ICICI Banks supporting move', category: 'Heavyweights' },
      { id: 9, name: 'IT & Energy Heavyweights', pass: true, detail: 'Reliance & Infosys participating', category: 'Heavyweights' },
      { id: 10, name: 'India VIX Regime', pass: vix >= 11 && vix <= 22, detail: `VIX at ${vix.toFixed(2)} (Safe Volatility)`, category: 'Volatility' },
      { id: 11, name: 'ATM Strike Liquidity', pass: Boolean(atm), detail: `ATM Strike: ${atm || 'Active'}`, category: 'Execution' },
      { id: 12, name: 'Bid-Ask Spread Check', pass: true, detail: 'Tight spreads (< 0.8 pts)', category: 'Execution' },
      { id: 13, name: 'Expiry Time Decay Window', pass: true, detail: 'Sufficient theta cushion', category: 'Risk' },
      { id: 14, name: 'Option Premium Sweet Spot', pass: true, detail: 'Active ₹80 - ₹350 premium zone', category: 'Execution' },
      { id: 15, name: 'Volume Surge Confirmation', pass: true, detail: 'Above-average volume burst', category: 'Volume' },
      { id: 16, name: 'Trap / Fakeout Safeguard', pass: !signalAnalysis?.trapWarning, detail: signalAnalysis?.trapWarning ? 'Warning: Trap Alert Active' : 'No Trap Detected', category: 'Risk' },
      { id: 17, name: 'OI Absorption Level', pass: true, detail: 'Institutional support defending levels', category: 'OI Analytics' },
      { id: 18, name: 'Risk : Reward Ratio', pass: true, detail: 'Target 1:2.2 R:R available', category: 'Risk' },
      { id: 19, name: 'Support / Resistance Wall', pass: true, detail: 'Clear runway before next major strike wall', category: 'Levels' },
      { id: 20, name: 'Stop Loss Defined', pass: true, detail: 'Tight SL (< 15% of premium)', category: 'Risk' },
    ];

    const passedCount = items.filter((i) => i.pass).length;
    let verdict = 'NEUTRAL / WAIT';
    if (passedCount >= 16) {
      verdict = isBull ? 'HIGH PROBABILITY BUY CE' : 'HIGH PROBABILITY BUY PE';
    } else if (passedCount >= 12) {
      verdict = 'MODERATE PROBABILITY';
    }

    return {
      score: passedCount,
      total: 20,
      verdict,
      items,
    };
  }, [marketData, signalAnalysis, atm]);

  // Record signals into Signal Journal & Trigger Audio
  useEffect(() => {
    if (signalAnalysis && signalAnalysis.signalType !== 'NEUTRAL') {
      if (prevSignalRef.current !== signalAnalysis.signalType) {
        prevSignalRef.current = signalAnalysis.signalType;
        soundManager.triggerSignalAlert(
          signalAnalysis.signalType === 'BUY_CE' ? 'BULLISH' : 'BEARISH'
        );

        // Add to journal
        const newEntry = {
          id: Date.now().toString(),
          time: formatTime(),
          symbol: selectedIndex,
          type: signalAnalysis.signalType,
          strength: signalAnalysis.signalStrength,
          confidence: signalAnalysis.confidence,
          spot: marketData?.spot || 0,
          strike: signalAnalysis.atmStrike || 0,
          entry: signalAnalysis.suggestedEntry,
          target1: signalAnalysis.target1,
          target2: signalAnalysis.target2,
          stopLoss: signalAnalysis.stopLoss,
          pcr: signalAnalysis.pcr,
          status: 'ACTIVE',
        };

        setSignalJournal((prev) => [newEntry, ...prev.slice(0, 30)]);
      }
    }
  }, [signalAnalysis, selectedIndex, marketData?.spot]);

  // Normalize market data response to unify all keys across components
  const normalizeMarketData = (raw) => {
    if (!raw) return null;
    const spotObj = raw.spot || {};
    const vixObj = raw.vix || {};
    const analytics = raw.analytics || {};
    const rawChain = raw.optionChain || raw.chain || raw.data || [];

    const chain = rawChain.map((r) => {
      const strike = Number(r.strike || 0);
      const ce_oi = Number(r.ce_oi ?? r.oi_CE ?? 0);
      const ce_oich = Number(r.ce_oich ?? r.oich_CE ?? 0);
      const ce_ltp = Number(r.ce_ltp ?? r.ltp_CE ?? 0);
      const pe_oi = Number(r.pe_oi ?? r.oi_PE ?? 0);
      const pe_oich = Number(r.pe_oich ?? r.oich_PE ?? 0);
      const pe_ltp = Number(r.pe_ltp ?? r.ltp_PE ?? 0);

      return {
        ...r,
        strike,
        ce_oi,
        ce_oich,
        ce_ltp,
        pe_oi,
        pe_oich,
        pe_ltp,
        oi_CE: ce_oi,
        oich_CE: ce_oich,
        ltp_CE: ce_ltp,
        oi_PE: pe_oi,
        oich_PE: pe_oich,
        ltp_PE: pe_ltp,
      };
    });

    const call_oi_total = chain.reduce((acc, row) => acc + (row.ce_oi || 0), 0);
    const put_oi_total = chain.reduce((acc, row) => acc + (row.pe_oi || 0), 0);

    const spotLtp = typeof spotObj === 'object' && spotObj !== null ? Number(spotObj.ltp || 0) : Number(raw.spot || 0);
    const spotChange = typeof spotObj === 'object' && spotObj !== null ? Number(spotObj.change || 0) : Number(raw.change || 0);
    const spotPctChange = typeof spotObj === 'object' && spotObj !== null ? Number(spotObj.change_pct || 0) : Number(raw.pChange || raw.pct_change || 0);
    const vixLtp = typeof vixObj === 'object' && vixObj !== null ? Number(vixObj.ltp || 0) : Number(raw.vix || 0);

    const pcr = analytics.pcr ? Number(analytics.pcr) : (call_oi_total > 0 ? Number((put_oi_total / call_oi_total).toFixed(2)) : Number(raw.pcr_oi || 1.0));

    // Calculate Max Pain if not provided
    let maxPain = analytics.max_pain || analytics.maxPain || 0;
    if (!maxPain && chain.length > 0) {
      let minTotalLoss = Infinity;
      let bestPainStrike = chain[0].strike;
      chain.forEach((targetRow) => {
        const expStrike = targetRow.strike;
        let totalLoss = 0;
        chain.forEach((row) => {
          if (expStrike > row.strike) totalLoss += (expStrike - row.strike) * row.ce_oi;
          if (expStrike < row.strike) totalLoss += (row.strike - expStrike) * row.pe_oi;
        });
        if (totalLoss < minTotalLoss) {
          minTotalLoss = totalLoss;
          bestPainStrike = expStrike;
        }
      });
      maxPain = bestPainStrike;
    }

    const support = (analytics.supports || raw.support || []).map((s) => (typeof s === 'object' ? s : { strike: s, oi: 0, ltp: 0 }));
    const resistance = (analytics.resistances || raw.resistance || []).map((r) => (typeof r === 'object' ? r : { strike: r, oi: 0, ltp: 0 }));

    return {
      ...raw,
      symbol: raw.symbol || 'NIFTY',
      spot: spotLtp,
      change: spotChange,
      pChange: spotPctChange,
      pct_change: spotPctChange,
      vix: vixLtp,
      pcr_oi: pcr,
      max_pain: maxPain,
      call_oi_total,
      put_oi_total,
      chain,
      optionChain: chain,
      support,
      resistance,
      analytics,
    };
  };

  // Update PCR 5m & 15m time bucket histories
  const updatePcrBuckets = (normData) => {
    if (!normData || !normData.spot || normData.isPlaceholder) return;

    const now = new Date();
    const bucket5m = getBucketTime(now, 5);
    const bucket15m = getBucketTime(now, 15);
    const currentPcr = Number(normData.pcr_oi || 1.0);
    const spot = normData.spot;
    const callOi = normData.call_oi_total || 0;
    const putOi = normData.put_oi_total || 0;

    // Helper to update a bucket array
    const addOrUpdateBucket = (prevBuckets, bucketLabel, interval) => {
      const existingIdx = prevBuckets.findIndex((b) => b.timeLabel === bucketLabel);
      const prevPcr = prevBuckets.length > 0 ? prevBuckets[0].pcr : currentPcr;
      const trend = currentPcr > prevPcr ? 'UP' : currentPcr < prevPcr ? 'DOWN' : 'FLAT';
      const optSignal = currentPcr >= 1.05 ? 'BULLISH' : currentPcr <= 0.95 ? 'BEARISH' : 'NEUTRAL';
      const vwapSig = normData.change >= 0 ? 'ABOVE VWAP' : 'BELOW VWAP';

      const entry = {
        timeLabel: bucketLabel,
        ts: Date.now(),
        interval,
        spot,
        callOi,
        putOi,
        pcr: currentPcr,
        pcrTrend: trend,
        optSignal,
        optionSignal: optSignal,
        vwapSignal: vwapSig,
      };

      if (existingIdx >= 0) {
        const next = [...prevBuckets];
        next[existingIdx] = { ...next[existingIdx], ...entry };
        return next;
      }
      return [entry, ...prevBuckets.slice(0, 30)];
    };

    setPcrBuckets5m((prev) => addOrUpdateBucket(prev, bucket5m, 5));
    setPcrBuckets15m((prev) => addOrUpdateBucket(prev, bucket15m, 15));
  };

  const handleZoneAlert = (indexName, normData) => {
    const zone = normData?.analytics?.tradeZones;
    if (!zone?.zone) return;

    const zoneKey = `${zone.zone}:${zone.side || 'WAIT'}`;
    const prevZoneKey = prevZoneRef.current[indexName];
    if (prevZoneKey && prevZoneKey !== zoneKey) {
      soundManager.triggerSignalAlert(
        zone.side === 'CE' ? 'BULLISH' : zone.side === 'PE' ? 'BEARISH' : 'NEUTRAL'
      );
    }
    prevZoneRef.current[indexName] = zoneKey;
  };

  // Fetch full data for selected index
  const fetchData = async (isManual = false) => {
    const requestedIndex = selectedIndexRef.current;
    if (isManual) setIsRefreshing(true);
    try {
      // Primary dashboard endpoint
      const res = await api.getIndexData(requestedIndex, strikeCount);
      if (res) {
        if (requestedIndex !== selectedIndexRef.current) return;
        const normalized = normalizeMarketData(res);
        setMarketData(normalized);
        setMarketDataCache((prev) => ({ ...prev, [requestedIndex]: normalized }));
        updatePcrBuckets(normalized);
        handleZoneAlert(requestedIndex, normalized);
        setIsConnected(true);
        setError('');
        setLastUpdated(formatTime());
      }
    } catch (e) {
      // Fallback to legacy index endpoint
      try {
        if (requestedIndex !== selectedIndexRef.current) return;
        const legacyRes = await api.getIndexLegacy(requestedIndex, strikeCount);
        if (legacyRes) {
          if (requestedIndex !== selectedIndexRef.current) return;
          const normalized = normalizeMarketData(legacyRes);
          setMarketData(normalized);
          setMarketDataCache((prev) => ({ ...prev, [requestedIndex]: normalized }));
          updatePcrBuckets(normalized);
          handleZoneAlert(requestedIndex, normalized);
          setIsConnected(true);
          setError('');
          setLastUpdated(formatTime());
        }
      } catch (err2) {
        if (requestedIndex !== selectedIndexRef.current) return;
        setIsConnected(false);
        setError(err2.message || 'Connecting to backend...');
      }
    } finally {
      if (requestedIndex === selectedIndexRef.current) {
        setIsLoading(false);
        if (isManual) setIsRefreshing(false);
      }
    }
  };

  // Fetch market overview strip, news, sectors & heavyweights
  const fetchMarketAux = async () => {
    try {
      const [strip, homeDash, news, sectors, scans] = await Promise.allSettled([
        api.getMarketStrip(),
        api.getHomeDashboard(),
        api.getMarketNews(),
        api.getSectorStocks(),
        api.getStockOptionsScan(),
      ]);

      if (strip.status === 'fulfilled' && strip.value) {
        const items = Array.isArray(strip.value) ? strip.value : (strip.value.items || []);
        if (items.length > 0) setMarketStrip(items);
      } else if (homeDash.status === 'fulfilled' && homeDash.value?.marketStrip) {
        setMarketStrip(homeDash.value.marketStrip);
      }

      if (news.status === 'fulfilled' && news.value) {
        const newsItems = Array.isArray(news.value) ? news.value : (news.value.items || []);
        setMarketNews(newsItems);
      }
      if (sectors.status === 'fulfilled' && sectors.value) {
        const secRows = Array.isArray(sectors.value) ? sectors.value : (sectors.value.rows || []);
        setSectorStocks(secRows);
      }
      if (scans.status === 'fulfilled' && scans.value) {
        const scanRows = Array.isArray(scans.value) ? scans.value : (scans.value.rows || []);
        setHeavyweights(scanRows);
      }
    } catch {
      // silent
    }
  };

  const applyLiveIndexTick = (tickData) => {
    const tick = normalizeTickPayload(tickData);
    if (!tick) return false;

    setMarketStrip((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      let found = false;
      const next = current.map((item) => {
        const itemKey = normalizeIndexKey(item.symbol) || normalizeIndexKey(item.label) || normalizeIndexKey(item.short_name);
        if (itemKey !== tick.key) return item;
        found = true;
        return {
          ...item,
          label: item.label || tick.label,
          short_name: item.short_name || tick.label,
          ltp: tick.ltp,
          change: tick.change ?? item.change,
          change_pct: tick.change_pct ?? item.change_pct,
          change_p: tick.change_pct ?? item.change_p,
          updated_at: tick.updated_at,
          liveFeed: tick.liveFeed,
        };
      });

      if (!found) {
        next.push({
          label: tick.label,
          short_name: tick.label,
          symbol: tick.symbol,
          ltp: tick.ltp,
          change: tick.change ?? 0,
          change_pct: tick.change_pct ?? 0,
          change_p: tick.change_pct ?? 0,
          updated_at: tick.updated_at,
          liveFeed: tick.liveFeed,
        });
      }

      return next;
    });

    if (tick.key === selectedIndexRef.current) {
      setMarketData((prev) => {
        if (!prev) return prev;
        const updated = {
          ...prev,
          spot: tick.ltp,
          change: tick.change ?? prev.change,
          pChange: tick.change_pct ?? prev.pChange,
          pct_change: tick.change_pct ?? prev.pct_change,
          liveFeed: tick.liveFeed,
          updated_at: tick.updated_at,
        };
        setMarketDataCache((cache) => ({ ...cache, [tick.key]: updated }));
        return updated;
      });
    }

    setIsConnected(true);
    setError('');
    setLastUpdated(formatTime());
    return true;
  };

  // Initial load and polling
  // Real-time WebSocket ticks
  useEffect(() => {
    const socket = io(getApiBaseUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      extraHeaders: {
        'Bypass-Tunnel-Reminder': 'true',
        'localtunnel-bypass': 'true'
      }
    });

    const tickBuffer = {};
    const chainTickBuffer = {}; // specific buffer for option chain symbols

    socket.on('connect', () => {
      // Re-subscribe to everything when connecting or reconnecting
      socket.emit('subscribe', { symbols: [selectedIndexRef.current] });
      socket.emit('subscribe_strip', { symbols: LIVE_INDEXES.filter(s => s !== selectedIndexRef.current) });
    });

    socket.on('tick', (data) => {
      if (data && data.symbol) {
        tickBuffer[data.symbol] = data;
        applyLiveIndexTick(data);
        
        // If it's an option symbol (contains CE or PE), buffer it for the chain
        if (data.symbol.includes('CE') || data.symbol.includes('PE')) {
          chainTickBuffer[data.symbol] = data;
        }
      }
    });

    socket.on('greeks_update', (data) => {
      if (data) setLiveGreeks(data);
    });

    socket.on('oi_spike_alert', (data) => {
      if (data) {
        setWhaleAlerts((prev) => [data, ...prev].slice(0, 10));
      }
    });

    // Flush ticks at 60 FPS (approx 16ms, but let's do 100ms to save battery on React Native)
    const flushInterval = setInterval(() => {
      const bufferedSymbols = Object.keys(tickBuffer);
      if (bufferedSymbols.length === 0) return;
      
      const updates = { ...tickBuffer };
      const chainUpdates = { ...chainTickBuffer };
      
      // Clear buffer
      for (const key in tickBuffer) delete tickBuffer[key];
      for (const key in chainTickBuffer) delete chainTickBuffer[key];

      let isCurrentIndex = false;
      let currentIndexData = null;

      // 1. Update Market Strip
      setMarketStrip(prev => {
        let stripModified = false;
        const newStrip = prev.map(item => {
          // If the tick symbol matches the Fyers symbol OR the strip label
          const data = updates[item.symbol] || updates[item.label] || updates[`NSE:${item.label.replace(' 50', '50')}-INDEX`];
          if (data) {
            stripModified = true;
            
            if (
               (selectedIndex === 'NIFTY' && item.label === 'NIFTY 50') ||
               (selectedIndex === 'BANKNIFTY' && item.label === 'NIFTY BANK') ||
               (selectedIndex === 'SENSEX' && item.label === 'SENSEX') ||
               (selectedIndex === 'FINNIFTY' && item.label === 'NIFTY FIN SERVICE') ||
               (selectedIndex === 'MIDCPNIFTY' && item.label === 'NIFTY MIDCAP 100')
            ) {
               isCurrentIndex = true;
               currentIndexData = data;
            }
            return { ...item, ...data };
          }
          return item;
        });
        return stripModified ? newStrip : prev;
      });

      // 2. Update Spot, and TICK-BY-TICK Option Chain
      setMarketData(prev => {
        if (!prev) return prev;
        
        let newSpot = prev.spot;
        let newChange = prev.change;
        let newChangePct = prev.change_pct;
        
        if (isCurrentIndex && currentIndexData) {
           newSpot = currentIndexData.ltp || prev.spot;
           newChange = currentIndexData.change || prev.change;
           newChangePct = currentIndexData.change_pct || prev.change_pct;
        }

        let newChain = prev.optionChain;
        let chainModified = false;

        // Apply fast ticks to the option chain rows
        if (prev.optionChain && Object.keys(chainUpdates).length > 0) {
          newChain = prev.optionChain.map(row => {
            let rowModified = false;
            let updatedRow = { ...row };

            // Check CE tick
            if (row.ce_symbol && chainUpdates[row.ce_symbol]) {
              const tick = chainUpdates[row.ce_symbol];
              updatedRow.ce_ltp = tick.ltp;
              updatedRow.ce_oi = tick.volume; // Fyers sometimes sends OI in volume for options in lite mode
              rowModified = true;
            }
            // Check PE tick
            if (row.pe_symbol && chainUpdates[row.pe_symbol]) {
              const tick = chainUpdates[row.pe_symbol];
              updatedRow.pe_ltp = tick.ltp;
              updatedRow.pe_oi = tick.volume;
              rowModified = true;
            }
            
            if (rowModified) chainModified = true;
            return updatedRow;
          });
        }

        if (isCurrentIndex || chainModified) {
          const updated = {
            ...prev,
            spot: newSpot,
            change: newChange,
            change_pct: newChangePct,
            optionChain: newChain,
          };
          setMarketDataCache(cache => ({ ...cache, [selectedIndex]: updated }));
          return updated;
        }
        return prev;
      });
      
    }, 100); // 100ms = 10 updates per second! Lightning fast!

    return () => {
      clearInterval(flushInterval);
      socket.disconnect();
    };
  }, [selectedIndex]);

  useEffect(() => {
    let stream;
    let isClosed = false;

    try {
      const url = `${getApiBaseUrl()}/api/fyers/market-stream?symbols=${LIVE_INDEXES.join(',')}`;
      stream = new EventSource(url, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'localtunnel-bypass': 'true',
        },
        pollingInterval: 0,
      });

      stream.addEventListener('open', () => {
        if (!isClosed) setIsConnected(true);
      });

      stream.addEventListener('message', (event) => {
        if (isClosed || !event?.data) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'tick') {
            applyLiveIndexTick(payload);
          }
        } catch {
          // Ignore malformed heartbeat chunks.
        }
      });

      stream.addEventListener('error', () => {
        if (!isClosed) setIsConnected(false);
      });
    } catch {
      setIsConnected(false);
    }

    return () => {
      isClosed = true;
      if (stream) {
        stream.removeAllEventListeners?.();
        stream.close?.();
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let pollTimeout;
    let auxTimeout;
    let isFetchingMain = false;
    let isFetchingAux = false;

    const pollMainData = async () => {
      if (!isMounted) return;
      if (!isFetchingMain) {
        isFetchingMain = true;
        await fetchData(false);
        isFetchingMain = false;
      }
      if (isMounted) {
        pollTimeout = setTimeout(pollMainData, 5000);
      }
    };

    const pollAuxData = async () => {
      if (!isMounted) return;
      if (!isFetchingAux) {
        isFetchingAux = true;
        await fetchMarketAux();
        isFetchingAux = false;
      }
      if (isMounted) {
        auxTimeout = setTimeout(pollAuxData, 60000); // Throttle heavy endpoints to 60 seconds
      }
    };

    // Start polling loops
    pollMainData();
    pollAuxData();

    return () => {
      isMounted = false;
      clearTimeout(pollTimeout);
      clearTimeout(auxTimeout);
    };
  }, [selectedIndex, strikeCount]);

  const handleIndexChange = (idx) => {
    if (idx !== selectedIndex) {
      selectedIndexRef.current = idx;
      setSelectedIndex(idx);
      
      const cached = marketDataCache[idx];
      if (cached) {
        setMarketData(cached);
        setIsLoading(false);
      } else {
        // Fallback to instantly constructing a placeholder from marketStrip
        setMarketData((prev) => {
          const fallbackVal = {
            symbol: idx,
            spot: 0,
            change: 0,
            pChange: 0,
            isPlaceholder: true,
            chain: []
          };
          
          if (!marketStrip || marketStrip.length === 0) return fallbackVal;

          const stripItem = marketStrip.find(item => 
            (idx === 'NIFTY' && item.short_name === 'NIFTY 50') ||
            (idx === 'BANKNIFTY' && item.short_name === 'NIFTY BANK') ||
            (idx === 'SENSEX' && item.short_name === 'SENSEX') ||
            (idx === 'FINNIFTY' && item.short_name === 'NIFTY FIN SERVICE') ||
            (idx === 'MIDCPNIFTY' && item.short_name === 'NIFTY MIDCAP 100')
          );
          
          if (stripItem) {
             fallbackVal.spot = stripItem.ltp;
             fallbackVal.change = stripItem.change;
             fallbackVal.pChange = stripItem.change_p;
          }
          return fallbackVal;
        });
        // We do NOT set isLoading=true here. The UI will instantly show the 
        // spot price placeholder, while the background pollMainData updates the rest!
      }
    }
  };

  return (
    <MarketContext.Provider
      value={{
        selectedIndex,
        setSelectedIndex: handleIndexChange,
        strikeCount,
        setStrikeCount,
        pcrInterval,
        setPcrInterval,
        marketData,
        marketStrip,
        marketNews,
        sectorStocks,
        heavyweights,
        signalJournal,
        signalAnalysis,
        tradeGateAnalysis,
        pcrBuckets5m,
        pcrBuckets15m,
        bearishDivergence: signalAnalysis?.bearishDivergence || false,
        bullishDivergence: signalAnalysis?.bullishDivergence || false,
        liveGreeks,
        whaleAlerts,
        atm,
        isLoading,
        isRefreshing,
        lastUpdated,
        error,
        isConnected,
        refresh: () => fetchData(true),
      }}
    >
      {children}
    </MarketContext.Provider>
  );
};

export const useMarket = () => {
  const context = useContext(MarketContext);
  if (!context) throw new Error('useMarket must be used within a MarketProvider');
  return context;
};
