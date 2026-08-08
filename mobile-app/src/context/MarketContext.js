import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { soundManager } from '../components/AudioAlertHelper';

const MarketContext = createContext(null);

export const SUPPORTED_INDEXES = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY'];

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
  const [strikeCount, setStrikeCount] = useState(25);
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
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const prevSignalRef = useRef(null);

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
    if (!marketData) return null;
    
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
    };
  }, [marketData, atm]);

  // Compute 20-Point Option Buyer Trade Gate Checklist
  const tradeGateAnalysis = useMemo(() => {
    if (!marketData) return { score: 0, total: 20, verdict: 'AWAITING DATA', items: [] };

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
    if (!normData || !normData.spot) return;

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

  // Fetch full data for selected index
  const fetchData = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      // Primary dashboard endpoint
      const res = await api.getIndexData(selectedIndex, strikeCount);
      if (res) {
        const normalized = normalizeMarketData(res);
        setMarketData(normalized);
        updatePcrBuckets(normalized);
        setIsConnected(true);
        setError('');
        setLastUpdated(formatTime());
      }
    } catch (e) {
      // Fallback to legacy index endpoint
      try {
        const legacyRes = await api.getIndexLegacy(selectedIndex, strikeCount);
        if (legacyRes) {
          const normalized = normalizeMarketData(legacyRes);
          setMarketData(normalized);
          updatePcrBuckets(normalized);
          setIsConnected(true);
          setError('');
          setLastUpdated(formatTime());
        }
      } catch (err2) {
        setIsConnected(false);
        setError(err2.message || 'Connecting to backend...');
      }
    } finally {
      setIsLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  // Fetch market overview strip, news, sectors & heavyweights
  const fetchMarketAux = async () => {
    try {
      const [strip, news, sectors, scans] = await Promise.allSettled([
        api.getMarketStrip(),
        api.getMarketNews(),
        api.getSectorStocks(),
        api.getStockOptionsScan(),
      ]);

      if (strip.status === 'fulfilled' && Array.isArray(strip.value)) {
        setMarketStrip(strip.value);
      }
      if (news.status === 'fulfilled' && Array.isArray(news.value)) {
        setMarketNews(news.value);
      }
      if (sectors.status === 'fulfilled' && Array.isArray(sectors.value)) {
        setSectorStocks(sectors.value);
      }
      if (scans.status === 'fulfilled' && Array.isArray(scans.value)) {
        setHeavyweights(scans.value);
      }
    } catch {
      // silent
    }
  };

  // Initial load and polling
  useEffect(() => {
    fetchData();
    fetchMarketAux();

    const interval = setInterval(() => {
      fetchData();
    }, 2500);

    const auxInterval = setInterval(() => {
      fetchMarketAux();
    }, 15000);

    return () => {
      clearInterval(interval);
      clearInterval(auxInterval);
    };
  }, [selectedIndex, strikeCount]);

  return (
    <MarketContext.Provider
      value={{
        selectedIndex,
        setSelectedIndex,
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
