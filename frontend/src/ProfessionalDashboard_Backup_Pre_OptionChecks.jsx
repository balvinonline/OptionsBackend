import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "antd/dist/reset.css";
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, createChart, createSeriesMarkers } from "lightweight-charts";
import { calculateVWAP, calculateEMA, calculateSupportResistance, calculateSignals } from "./utils/indicators";
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Checkbox,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  notification,
  theme,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ControlOutlined,
  CopyOutlined,
  DashboardOutlined,
  ExclamationCircleFilled,
  EyeOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HomeOutlined,
  LineChartOutlined,
  LogoutOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import "./ProfessionalDashboard.css";
import dashboardLogoSrc from "./assets/dashboard logo.png";

const ALL_INDEXES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX"];
const INDEXES = ["NIFTY", "SENSEX", "BANKNIFTY"];
const DASHBOARD_STREAM_KEYS = ["NIFTY", "BANKNIFTY", "SENSEX", "NIFTY MIDCAP 100", "NIFTY SMALLCAP 100", "NIFTY FIN SERVICE"];

const Sparkline = ({ tone, data, symbol }) => {
  const stableData = useMemo(() => {
    if (data && data.length > 0) return data;
    const seed = symbol ? symbol.charCodeAt(0) + symbol.length : 42;
    let val = 100;
    return Array.from({ length: 20 }, (_, i) => {
      val += (Math.sin(seed + i) * 5) + (tone === 'success' ? 1.5 : tone === 'error' ? -1.5 : 0);
      return val;
    });
  }, [data, symbol, tone]);

  if (!stableData || stableData.length === 0) return null;
  const max = Math.max(...stableData);
  const min = Math.min(...stableData);
  const range = max - min || 1;
  const width = 60;
  const height = 20;
  const points = stableData.map((val, i) => `${(i / (stableData.length - 1)) * width},${height - ((val - min) / range) * height}`).join(' ');
  const color = tone === 'success' ? '#52c41a' : tone === 'error' ? '#ff4d4f' : '#1890ff';
  
  return (
    <svg width={width} height={height} style={{ marginLeft: '8px', verticalAlign: 'middle' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

function isAfterMarketClose() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  
  const day = ist.getDay();
  if (day === 0 || day === 6) return true;
  
  const h = ist.getHours();
  
  if (h >= 16) return true;
  if (h < 9) return true;
  return false;
}

const INDEX_LABELS = {
  NIFTY: "NIFTY 50",
  BANKNIFTY: "BANK NIFTY",
  SENSEX: "SENSEX",
};

const INDEX_DISPLAY_LABELS = {
  NIFTY: "Nifty 50",
  BANKNIFTY: "Bank Nifty",
  SENSEX: "Sensex",
};

const INDEX_SELECT_OPTIONS = [
  { label: "All", value: "ALL" },
  ...INDEXES.map((item) => ({ label: INDEX_LABELS[item] || item, value: item })),
];

const TRADINGVIEW_SYMBOLS = {
  NIFTY: "NSE:NIFTY",
  BANKNIFTY: "NSE:BANKNIFTY",
  SENSEX: "BSE:SENSEX",
};

const STRIP_LABEL_ALIASES = {
  NIFTY: ["NIFTY 50", "NIFTY"],
  BANKNIFTY: ["BANK NIFTY", "NIFTY BANK", "BANKNIFTY"],
  SENSEX: ["SENSEX"],
};
const MIN_SECTOR_QUOTE_QUALITY = 8;
const MAX_DISPLAY_BASIS_PCT = 0.75;
const MIN_BUYER_PREMIUM = 20;
const MAX_BUYER_PREMIUM = 650;
const HOME_CACHE_KEY = "option-buyer-last-good-home";
const SIGNAL_JOURNAL_KEY = "option-buyer-signal-journal";
const OPTION_SIGNAL_HISTORY_KEY = "option-buyer-signal-history";
const GATE_HISTORY_KEY = "option-buyer-gate-history";
const FYERS_CHART_CACHE_PREFIX = "option-buyer-fyers-chart";
const FYERS_CHART_CACHE_VERSION = "v2-90d-strike";
const GATE_HISTORY_COOLDOWN_MS = 5 * 60 * 1000;
const READY_ALERT_BEEP_MUTED_KEY = "option-buyer-ready-alert-beep-muted";
const READY_ALERTS_ENABLED_KEY = "option-buyer-ready-alerts-enabled";
const PCR_HISTORY_KEY = "option-buyer-pcr-history";
const FAST_ACTION_MARKS_KEY = "option-buyer-fast-action-marks";
const PCR_TABLE_INTERVALS = [5, 15];
const OPTION_SIGNAL_HISTORY_LIMIT = 80;
const SIGNAL_JOURNAL_LIMIT = 1500;
const SIGNAL_JOURNAL_SYNC_LIMIT = 2000;
const BUYER_MODES = {
  SCALP: {
    label: "Scalp",
    minPremium: 35,
    maxPremium: 350,
    minConfidence: 62,
    minRiskReward: 1.05,
    targetMultiple: 1.22,
    stopMultiple: 0.82,
    maxTrapPct: 0.18,
  },
  INTRADAY: {
    label: "Intraday",
    minPremium: 20,
    maxPremium: 650,
    minConfidence: 60,
    minRiskReward: 1.15,
    targetMultiple: 1.35,
    stopMultiple: 0.78,
    maxTrapPct: 0.24,
  },
  SAFE: {
    label: "Safe",
    minPremium: 80,
    maxPremium: 450,
    minConfidence: 68,
    minRiskReward: 1.35,
    targetMultiple: 1.28,
    stopMultiple: 0.8,
    maxTrapPct: 0.32,
  },
};

function isNum(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function asNum(value, fallback = 0) {
  return isNum(value) ? Number(value) : fallback;
}

function formatNum(value, digits = 2) {
  if (!isNum(value)) return "-";
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function formatInt(value) {
  if (!isNum(value)) return "-";
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatCompactInt(value) {
  if (!isNum(value)) return "-";
  const num = Number(value);
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs >= 10000000) return `${sign}${formatNum(abs / 10000000, 2)}Cr`;
  if (abs >= 100000) return `${sign}${formatNum(abs / 100000, 2)}L`;
  if (abs >= 1000) return `${sign}${formatNum(abs / 1000, 1)}K`;
  return `${sign}${formatNum(abs, 0)}`;
}

function formatPrice(value) {
  return formatNum(value, 0);
}

function formatPremium(value) {
  return formatNum(value, 2);
}

function formatPct(value) {
  if (!isNum(value)) return "-";
  const num = Number(value);
  return `${num >= 0 ? "+" : ""}${formatNum(num, 2)}%`;
}

function classBySign(value) {
  const num = Number(value || 0);
  if (num > 0) return "change-up";
  if (num < 0) return "change-down";
  return "change-flat";
}

function toneBySign(value) {
  const num = Number(value || 0);
  if (num > 0) return "up";
  if (num < 0) return "down";
  return "flat";
}

function DirectionIcon({ value, tone }) {
  const num = Number(value || 0);
  const direction = tone || (num > 0 ? "up" : num < 0 ? "down" : "flat");
  if (direction === "up" || direction === "pass") return <ArrowUpOutlined className="direction-icon up" aria-hidden="true" />;
  if (direction === "down" || direction === "fail") return <ArrowDownOutlined className="direction-icon down" aria-hidden="true" />;
  if (direction === "warn") return <ArrowUpOutlined className="direction-icon warn" aria-hidden="true" />;
  return <span className="direction-icon flat" />;
}

function formatLevelList(values = []) {
  const clean = uniqueNumbers(values).slice(0, 3);
  return clean.length ? clean.map(formatPrice).join(" / ") : "-";
}

function getNearestLevel(value, levels = [], direction = "below") {
  if (!isNum(value)) return null;
  const num = Number(value);
  const clean = uniqueNumbers(levels).filter(isNum).map(Number);
  if (!clean.length) return null;
  if (direction === "above") {
    return clean.filter((level) => level >= num).sort((a, b) => a - b)[0] ?? null;
  }
  return clean.filter((level) => level <= num).sort((a, b) => b - a)[0] ?? null;
}

function getLevelDistancePct(value, level) {
  if (!isNum(value) || !isNum(level) || Number(value) === 0) return null;
  return Math.abs(Number(value) - Number(level)) / Math.abs(Number(value)) * 100;
}

function formatLevelDistance(value, level, unit = "pts") {
  if (!isNum(value) || !isNum(level)) return "";
  const distance = Math.abs(Number(value) - Number(level));
  return `${formatNum(distance, distance < 10 ? 2 : 0)} ${unit}`;
}

function buildSelectedStrikeReason({
  side,
  indexPrice,
  premium,
  indexLevels = {},
  premiumLevels = {},
  oiChange,
  moneyness,
}) {
  const optionSide = String(side || "").toUpperCase();
  const isCe = optionSide === "CE";
  const indexSupport = getNearestLevel(indexPrice, indexLevels.supports, "below");
  const indexResistance = getNearestLevel(indexPrice, indexLevels.resistances, "above");
  const premiumSupport = getNearestLevel(premium, premiumLevels.supports, "below");
  const premiumResistance = getNearestLevel(premium, premiumLevels.resistances, "above");
  const indexBarrier = isCe ? indexResistance : indexSupport;
  const premiumBarrier = premiumResistance;
  const indexBarrierPct = getLevelDistancePct(indexPrice, indexBarrier);
  const premiumBarrierPct = getLevelDistancePct(premium, premiumBarrier);
  const premiumSupportPct = getLevelDistancePct(premium, premiumSupport);
  const oiOk = isNum(oiChange) ? Number(oiChange) >= 0 : null;
  const nearIndexBarrier = isNum(indexBarrierPct) && indexBarrierPct <= 0.18;
  const nearPremiumBarrier = isNum(premiumBarrierPct) && premiumBarrierPct <= 3;
  const supportedPremium = isNum(premiumSupportPct) && premiumSupportPct <= 5;

  let decision = "WAIT";
  let tone = "warn";
  const reasons = [];

  if (!isNum(indexPrice) || !isNum(premium)) {
    return {
      decision: "WAIT",
      tone: "warn",
      title: "WAIT: price data collecting",
      text: "Index or strike premium is not ready yet.",
    };
  }

  if (isCe && nearIndexBarrier) {
    reasons.push(`index near R ${formatPrice(indexBarrier)} (${formatLevelDistance(indexPrice, indexBarrier)})`);
  } else if (!isCe && nearIndexBarrier) {
    reasons.push(`index near S ${formatPrice(indexBarrier)} (${formatLevelDistance(indexPrice, indexBarrier)})`);
  }

  if (nearPremiumBarrier) {
    reasons.push(`premium near R ${formatPremium(premiumBarrier)}`);
  }

  if (oiOk === false) {
    reasons.push("OI change not supporting yet");
  }

  if (!nearIndexBarrier && !nearPremiumBarrier && oiOk !== false) {
    decision = "BUY possible";
    tone = "up";
    reasons.push(`${optionSide} has room to next level`);
    if (supportedPremium) reasons.push(`premium holding S ${formatPremium(premiumSupport)}`);
  } else if (nearIndexBarrier || nearPremiumBarrier) {
    decision = "WAIT";
    tone = "warn";
  } else {
    decision = "AVOID";
    tone = "down";
  }

  const sideText = optionSide || "Strike";
  const moneynessText = moneyness && moneyness !== "-" ? `${moneyness} strike` : "selected strike";
  return {
    decision,
    tone,
    title: `${decision}: ${sideText} ${moneynessText}`,
    text: reasons.slice(0, 3).join("; ") || "No clear edge yet; wait for level break and premium confirmation.",
  };
}

function hasQuoteValue(item) {
  return isNum(item?.ltp) || isNum(item?.change) || isNum(item?.change_pct);
}

function hasUsefulHomeData(payload = {}) {
  if ((payload?.marketStrip || []).some(hasQuoteValue)) return true;
  return Object.values(payload?.indices || {}).some((item) => hasQuoteValue(item?.spot) || hasQuoteValue(item?.future));
}

function loadCachedHomeData() {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || "null");
    return hasUsefulHomeData(cached) ? cached : null;
  } catch {
    return null;
  }
}

function storeHomeCache(payload) {
  if (!hasUsefulHomeData(payload)) return;
  localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
    ...payload,
    cachedAt: Date.now(),
  }));
}

function getFyersChartCacheKey(symbol, resolution, scope = "index") {
  return `${FYERS_CHART_CACHE_PREFIX}:${FYERS_CHART_CACHE_VERSION}:${scope || "index"}:${symbol || "INDEX"}:${resolution || "5"}`;
}

function isFreshChartPayload(payload, resolution = "5") {
  const candles = normalizeHistoryCandles(payload);
  if (!candles.length) return false;
  const latest = normalizeTimestampMs(candles[candles.length - 1]?.ts);
  if (!latest) return false;
  const key = String(resolution || "5").toUpperCase();
  const maxAge = key === "D" || key === "1D" ? 10 * 24 * 60 * 60 * 1000 : 5 * 24 * 60 * 60 * 1000;
  return Date.now() - latest <= maxAge;
}

function loadCachedFyersChart(symbol, resolution, scope = "index") {
  try {
    const cached = JSON.parse(localStorage.getItem(getFyersChartCacheKey(symbol, resolution, scope)) || "null");
    return cached?.ok && cached?.candles?.length && isFreshChartPayload(cached, resolution) ? cached : null;
  } catch {
    return null;
  }
}

function storeCachedFyersChart(symbol, resolution, payload, scope = "index") {
  if (!payload?.ok || !payload?.candles?.length || !isFreshChartPayload(payload, resolution)) return;
  try {
    localStorage.setItem(getFyersChartCacheKey(symbol, resolution, scope), JSON.stringify({
      ...payload,
      cachedAt: Date.now(),
    }));
  } catch {
    // Storage can fail in private mode or if quota is full; live chart still works.
  }
}

function cleanMerge(existing = {}, incoming = {}) {
  const result = { ...(existing || {}) };
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = cleanMerge(result[key], value);
    } else if (value !== null && value !== undefined && value !== "") {
      result[key] = value;
    }
  });
  return result;
}

function mergeMarketStrip(existing = [], incoming = []) {
  if (!Array.isArray(incoming) || !incoming.length) return existing || [];

  const previous = new Map(
    (existing || []).map((item) => [item?.symbol || item?.label, item]).filter(([key]) => key)
  );

  return incoming.map((item) => {
    const key = item?.symbol || item?.label;
    return cleanMerge(previous.get(key), item);
  });
}

function mergeTickerPayload(existing = {}, incoming = {}) {
  if (!incoming) return existing || {};
  return {
    ...existing,
    ...incoming,
    marketStrip: mergeMarketStrip(existing?.marketStrip, incoming?.marketStrip),
    vix: cleanMerge(existing?.vix, incoming?.vix),
  };
}

function mergeIndexCard(existing = {}, incoming = {}) {
  const merged = {
    ...existing,
    ...incoming,
    spot: cleanMerge(existing?.spot, incoming?.spot),
    future: cleanMerge(existing?.future, incoming?.future),
    analytics: cleanMerge(existing?.analytics, incoming?.analytics),
  };

  if (existing?.has_data && incoming?.has_data === false) {
    merged.has_data = true;
    merged.quickBias = existing.quickBias;
  }

  return merged;
}

function sectorQuality(sectors = []) {
  if (!Array.isArray(sectors)) return 0;
  return sectors.reduce((sum, sector) => sum + asNum(sector?.valid_count ?? sector?.quoted_total, 0), 0);
}

function breadthQuality(breadth = {}) {
  return asNum(
    breadth?.total,
    asNum(breadth?.advances, 0) + asNum(breadth?.declines, 0) + asNum(breadth?.unchanged, 0)
  );
}

function mergeHomePayload(existing = {}, incoming = {}) {
  if (!incoming) return existing || {};

  const currentIndices = existing?.indices || {};
  const incomingIndices = incoming?.indices || {};
  const keys = new Set([...Object.keys(currentIndices), ...Object.keys(incomingIndices)]);
  const indices = {};

  keys.forEach((key) => {
    indices[key] = mergeIndexCard(currentIndices[key], incomingIndices[key]);
  });

  const merged = {
    ...existing,
    ...incoming,
    indices,
    marketStrip: mergeMarketStrip(existing?.marketStrip, incoming?.marketStrip),
    vix: cleanMerge(existing?.vix, incoming?.vix),
  };

  const previousSectorQuality = sectorQuality(existing?.sectorStrength);
  const incomingSectorQuality = sectorQuality(incoming?.sectorStrength);
  if (
    incoming?.sectorStrength &&
    previousSectorQuality >= MIN_SECTOR_QUOTE_QUALITY &&
    (
      incomingSectorQuality < MIN_SECTOR_QUOTE_QUALITY ||
      incomingSectorQuality < previousSectorQuality * 0.65
    )
  ) {
    merged.sectorStrength = existing.sectorStrength;
    merged.breadthStats = existing.breadthStats;
  }

  const previousBreadthQuality = breadthQuality(existing?.breadthStats);
  const incomingBreadthQuality = breadthQuality(incoming?.breadthStats);
  if (previousBreadthQuality > 0 && incoming?.breadthStats && incomingBreadthQuality < previousBreadthQuality * 0.65) {
    merged.breadthStats = existing.breadthStats;
  }

  const previousFoQuality = breadthQuality(existing?.foBreadth);
  const incomingFoQuality = breadthQuality(incoming?.foBreadth);
  if (previousFoQuality > 0 && incoming?.foBreadth && incomingFoQuality < previousFoQuality * 0.65) {
    merged.foBreadth = existing.foBreadth;
  }

  if (existing?.marketMood?.score && !incoming?.marketMood?.score) {
    merged.marketMood = existing.marketMood;
  }

  return merged;
}

function normalizeFutureForDisplay(spot = {}, future = {}) {
  const spotLtp = safeIndexLevel(spot?.ltp);
  const futureLtp = safeIndexLevel(future?.ltp);
  const basisPct = safeIndexLevel(future?.basis_pct);

  if (!spotLtp || !futureLtp) return future || {};

  const computedBasisPct = ((futureLtp - spotLtp) / spotLtp) * 100;
  const effectiveBasisPct = isNum(basisPct) ? basisPct : computedBasisPct;

  if (Math.abs(effectiveBasisPct) <= MAX_DISPLAY_BASIS_PCT) return future || {};

  return {
    ...(future || {}),
    ltp: spot?.ltp,
    change: spot?.change,
    change_pct: spot?.change_pct,
    high: spot?.high,
    low: spot?.low,
    open: spot?.open,
    prev_close: spot?.prev_close,
    volume: spot?.volume,
    vwap: spot?.vwap,
    basis: 0,
    basis_pct: 0,
    stale_quote_replaced: true,
  };
}

function biasFromChange(changePct, fallback = "Neutral") {
  if (!isNum(changePct)) return fallback || "Neutral";
  const value = Number(changePct);
  if (value >= 0.25) return "Bullish";
  if (value <= -0.25) return "Bearish";
  return "Neutral";
}

function toneFromBias(bias) {
  const text = String(bias || "").toLowerCase();
  if (text.includes("bull") || text.includes("ce")) return "success";
  if (text.includes("bear") || text.includes("pe")) return "error";
  if (text.includes("wait") || text.includes("near")) return "warning";
  return "default";
}

function devProxyUrl(url) {
  return String(url || "").replace(/^\/api/, "/backend");
}

async function fetchJson(url, timeoutMs = 60000) {
  const candidates = url.startsWith("/api") ? [devProxyUrl(url), url] : [url];
  let lastError = null;

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(candidate, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        throw new Error(`API ${response.status}: ${await response.text()}`);
      }
      const json = await response.json();
      if (json?.error) {
        throw new Error(json.error);
      }
      return json;
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("API request failed");
}

async function postJson(url, payload = {}, timeoutMs = 60000) {
  const candidates = url.startsWith("/api") ? [devProxyUrl(url), url] : [url];
  let lastError = null;

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(candidate, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`API ${response.status}: ${await response.text()}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("API request failed");
}

function getAtmStrike(chain = [], analytics = {}, spot = {}) {
  if (isNum(analytics?.straddle?.atm_strike)) return Number(analytics.straddle.atm_strike);
  const atmRow = chain.find((row) => row?.is_atm);
  if (atmRow && isNum(atmRow.strike)) return Number(atmRow.strike);
  const spotPrice = asNum(spot?.ltp, 0);
  const strikes = chain.map((row) => Number(row?.strike || 0)).filter((strike) => strike > 0);
  if (!strikes.length) return null;
  return strikes.reduce((best, strike) =>
    Math.abs(strike - spotPrice) < Math.abs(best - spotPrice) ? strike : best
  );
}

function filterNearAtm(chain = [], atmStrike, sideCount = 8) {
  if (!Array.isArray(chain) || !chain.length || !isNum(atmStrike)) return chain || [];
  const sorted = [...chain].sort((a, b) => asNum(a?.strike) - asNum(b?.strike));
  const index = sorted.findIndex((row) => Number(row?.strike) === Number(atmStrike));
  if (index < 0) return sorted.slice(0, sideCount * 2 + 1);
  return sorted.slice(Math.max(0, index - sideCount), Math.min(sorted.length, index + sideCount + 1));
}

function getOiChartInsight({
  modeIsChange = false,
  totalCallOi = 0,
  totalPutOi = 0,
  totalCallOiChange = 0,
  totalPutOiChange = 0,
  pcr = null,
  analytics = {},
  atm = null,
}) {
  const oiSpread = asNum(totalPutOi, 0) - asNum(totalCallOi, 0);
  const changeSpread = asNum(totalPutOiChange, 0) - asNum(totalCallOiChange, 0);
  const changeTotal = Math.abs(asNum(totalPutOiChange, 0)) + Math.abs(asNum(totalCallOiChange, 0));
  const changeThreshold = Math.max(changeTotal * 0.14, 1);
  const pcrValue = asNum(pcr, null);
  let tone = "neutral";
  let label = "Balanced OI";
  let detail = "Put and call positioning are close near ATM.";

  if (modeIsChange) {
    if (asNum(totalPutOiChange, 0) > 0 && asNum(totalCallOiChange, 0) > 0 && Math.abs(changeSpread) <= changeThreshold) {
      tone = "warning";
      label = "Range Build-up";
      detail = "Fresh OI is adding on both sides near ATM.";
    } else if (changeSpread > changeThreshold) {
      tone = "success";
      label = "Put Writing Stronger";
      detail = "Support pressure is building faster than call pressure.";
    } else if (changeSpread < -changeThreshold) {
      tone = "error";
      label = "Call Writing Stronger";
      detail = "Resistance pressure is building faster than put support.";
    } else if (asNum(totalPutOiChange, 0) < 0 && asNum(totalCallOiChange, 0) < 0) {
      tone = "neutral";
      label = "OI Unwinding";
      detail = "Both sides are reducing positions near ATM.";
    }
  } else if (isNum(pcrValue)) {
    if (pcrValue >= 1.15) {
      tone = "success";
      label = "Heavy Put Writing";
      detail = "Put OI is stronger than call OI near ATM.";
    } else if (pcrValue <= 0.85) {
      tone = "error";
      label = "Heavy Call Writing";
      detail = "Call OI is stronger than put OI near ATM.";
    } else {
      tone = "warning";
      label = "Balanced Range";
      detail = "PCR is neutral; price confirmation matters more.";
    }
  }

  return {
    tone,
    label,
    detail,
    chips: [
      { label: "ATM", value: formatPrice(atm) },
      { label: "Put Wall", value: formatPrice(analytics?.putWall), tone: "success" },
      { label: "Call Wall", value: formatPrice(analytics?.callWall), tone: "error" },
      { label: "Max Pain", value: formatPrice(analytics?.maxPain), tone: "warning" },
      {
        label: modeIsChange ? "Net Build" : "OI Gap",
        value: formatCompactInt(modeIsChange ? changeSpread : oiSpread),
        directionValue: modeIsChange ? changeSpread : oiSpread,
      },
    ],
  };
}

function getStrikeStep(chain = []) {
  const strikes = chain.map((row) => Number(row?.strike || 0)).filter(Boolean).sort((a, b) => a - b);
  if (strikes.length < 2) return 100;
  const diffs = [];
  for (let i = 1; i < strikes.length; i += 1) {
    const diff = strikes[i] - strikes[i - 1];
    if (diff > 0) diffs.push(diff);
  }
  return diffs.length ? Math.min(...diffs) : 100;
}

function getBuyerModeRules(mode = "INTRADAY") {
  return BUYER_MODES[mode] || BUYER_MODES.INTRADAY;
}

function getOptionMoneyness(option, spotPrice, step = 100) {
  if (!option || !isNum(option?.strike) || !isNum(spotPrice)) return "-";
  const diff = Number(option.strike) - Number(spotPrice);
  const nearAtm = Math.abs(diff) <= step * 0.55;
  if (nearAtm) return "ATM";
  if (option.side === "CE") return diff < 0 ? "ITM" : "OTM";
  return diff > 0 ? "ITM" : "OTM";
}

function getPremiumQuality(option, spotPrice, mode = "INTRADAY", step = 100) {
  const rules = getBuyerModeRules(mode);
  if (!option) return { label: "No Strike", tone: "warning", reason: "No liquid strike selected" };
  const premium = asNum(option?.premium, 0);
  const moneyness = getOptionMoneyness(option, spotPrice, step);
  if (premium < rules.minPremium) {
    return { label: "Too Cheap", tone: "error", reason: `Premium below ${rules.minPremium}` };
  }
  if (premium > rules.maxPremium) {
    return { label: "Too Costly", tone: "warning", reason: `Premium above ${rules.maxPremium}` };
  }
  if (moneyness === "OTM" && premium < 60) {
    return { label: "Weak OTM", tone: "warning", reason: "OTM premium is too thin" };
  }
  if (option.volume <= 0 || option.oi <= 0) {
    return { label: "Weak Liquidity", tone: "warning", reason: "Volume/OI is weak" };
  }
  return { label: `${moneyness} Premium`, tone: "success", reason: "Premium is tradable" };
}

function getGreekQuality(option, mode = "INTRADAY") {
  if (!option) return { label: "Greeks Wait", tone: "warning", passed: false, score: 0, reason: "No strike selected for Greeks check" };
  const rules = getBuyerModeRules(mode);
  const premium = asNum(option?.premium, 0);
  const delta = Math.abs(asNum(option?.delta, null));
  const theta = asNum(option?.theta, null);
  const gamma = asNum(option?.gamma, null);
  const vega = asNum(option?.vega, null);
  const iv = asNum(option?.iv, null);
  let score = 68;
  const notes = [];

  if (isNum(delta)) {
    if (delta >= 0.38 && delta <= 0.68) {
      score += 14;
      notes.push(`Delta ${formatNum(delta, 2)} tradable`);
    } else if (delta >= 0.28 && delta <= 0.78) {
      score += 2;
      notes.push(`Delta ${formatNum(delta, 2)} watch`);
    } else {
      score -= 22;
      notes.push(`Delta ${formatNum(delta, 2)} is not ideal`);
    }
  } else {
    score -= 6;
    notes.push("Delta unavailable");
  }

  if (isNum(theta) && premium > 0) {
    const thetaDrag = Math.abs(theta) / premium;
    if (thetaDrag > 0.35) {
      score -= 20;
      notes.push("Theta drag high");
    } else if (thetaDrag > 0.22) {
      score -= 8;
      notes.push("Theta drag watch");
    } else {
      score += 5;
      notes.push("Theta drag controlled");
    }
  }

  if (isNum(iv)) {
    if (iv >= 12 && iv <= 34) {
      score += 7;
      notes.push(`IV ${formatNum(iv, 1)} ok`);
    } else if (iv > 45) {
      score -= 14;
      notes.push(`IV ${formatNum(iv, 1)} stretched`);
    } else if (iv > 0) {
      score -= 3;
      notes.push(`IV ${formatNum(iv, 1)} watch`);
    }
  }

  if (isNum(gamma) && gamma <= 0) score -= 5;
  if (isNum(vega) && isNum(iv) && iv > 42 && vega > 0.25) {
    score -= 6;
    notes.push("Vega risk in high IV");
  }
  if (premium < rules.minPremium || premium > rules.maxPremium) score -= 15;

  const cleanScore = Math.max(0, Math.min(100, Math.round(score)));
  if (cleanScore >= 72) {
    return { label: "Greeks OK", tone: "success", passed: true, score: cleanScore, reason: notes.slice(0, 2).join("; ") || "Greeks support the strike" };
  }
  if (cleanScore >= 55) {
    return { label: "Greeks Watch", tone: "warning", passed: true, score: cleanScore, reason: notes.slice(0, 2).join("; ") || "Greeks need monitoring" };
  }
  return { label: "Greeks Fail", tone: "error", passed: false, score: cleanScore, reason: notes.slice(0, 2).join("; ") || "Greeks are not supportive" };
}

function normalizeHistoryCandles(history = {}) {
  const source = Array.isArray(history) ? history : Array.isArray(history?.candles) ? history.candles : [];
  return source
    .map((row) => {
      const isArr = Array.isArray(row);
      const rawTime = isArr ? row[0] : (row?.ts || row?.time || row?.timestamp || row?.t || row?.date || row?.datetime || 0);
      return {
        ts: normalizeTimestampMs(rawTime),
        open: asNum(isArr ? row[1] : row?.open, null),
        high: asNum(isArr ? row[2] : row?.high, null),
        low: asNum(isArr ? row[3] : row?.low, null),
        close: asNum(isArr ? row[4] : row?.close, null),
        volume: asNum(isArr ? row[5] : row?.volume, null),
      };
    })
    .filter((row) => ["open", "high", "low", "close"].every((key) => isNum(row[key])))
    .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
}

function normalizeTimestampMs(value) {
  const stamp = isNum(value) ? Number(value) : Date.parse(value);
  if (!stamp) return 0;
  return stamp < 10000000000 ? stamp * 1000 : stamp;
}

function formatFreshnessAge(ageMs) {
  if (!isNum(ageMs) || Number(ageMs) < 0) return "-";
  const minutes = Math.floor(Number(ageMs) / 60000);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m old` : `${hours}h old`;
  const days = Math.floor(hours / 24);
  return `${days}d old`;
}

function getHistoryFreshness(history = {}, resolution = "5") {
  const candles = normalizeHistoryCandles(history);
  const label = resolution === "D" ? "Daily" : `${resolution}m`;
  if (!candles.length) {
    return {
      label: `${label} Collect`,
      shortLabel: "Collect",
      tone: "warning",
      passed: false,
      ageLabel: "-",
      reason: `${label} candle data unavailable`,
    };
  }

  const lastTs = normalizeTimestampMs(candles[candles.length - 1]?.ts);
  if (!lastTs) {
    return {
      label: `${label} No Time`,
      shortLabel: "No Time",
      tone: "warning",
      passed: false,
      ageLabel: "-",
      reason: `${label} candle timestamp unavailable`,
    };
  }

  const ageMs = Math.max(0, Date.now() - lastTs);
  const maxAgeMs = resolution === "D" ? 4 * 24 * 60 * 60 * 1000 : Number(resolution || 5) * 3 * 60 * 1000;
  const passed = ageMs <= maxAgeMs;
  return {
    label: `${label} ${passed ? "Fresh" : "Stale"}`,
    shortLabel: passed ? "Fresh" : "Stale",
    tone: passed ? "success" : "error",
    passed,
    ageLabel: formatFreshnessAge(ageMs),
    lastTs,
    reason: passed ? `${label} candle updated ${formatFreshnessAge(ageMs)}` : `${label} candle is stale (${formatFreshnessAge(ageMs)})`,
  };
}

function getCombinedFreshness(freshness = {}) {
  const items = [
    ["5m", freshness.five],
    ["60m", freshness.hourly],
    ["15m", freshness.fifteen],
    ["D", freshness.daily],
  ].filter(([, item]) => item);
  const failed = items.filter(([, item]) => item?.passed === false);
  const passed = failed.length === 0 && items.every(([, item]) => item?.passed);
  return {
    passed,
    tone: passed ? "success" : failed.some(([, item]) => item?.tone === "error") ? "error" : "warning",
    label: passed ? "Data Fresh" : "Data Stale",
    compact: items.map(([name, item]) => `${name} ${item?.shortLabel || "Collect"}`).join(" / "),
    reason: items.map(([name, item]) => `${name}: ${item?.ageLabel || "-"}`).join(", "),
  };
}

function getFiveMinuteConfirmation(history = {}, side, signal = {}, spot) {
  const candles = normalizeHistoryCandles(history);
  if (!side) return { label: "5m Wait", tone: "warning", passed: false, reason: "No option side selected" };
  if (candles.length < 4) return { label: "5m Collecting", tone: "warning", passed: false, reason: "Need more 5m candles" };

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const recent = candles.slice(-5);
  const avgRange = recent.reduce((sum, row) => sum + Math.max(0, Number(row.high) - Number(row.low)), 0) / recent.length;
  const close = asNum(spot, last.close);
  const entry = safeIndexLevel(signal?.entry);
  const red = last.close < last.open;
  const green = last.close > last.open;
  const breakDown = close < prev.low || (isNum(entry) && close <= entry);
  const breakOut = close > prev.high || (isNum(entry) && close >= entry);
  const meaningfulMove = avgRange > 0 ? Math.abs(Number(close) - Number(prev.close)) >= avgRange * 0.18 : true;

  if (side === "PE") {
    if ((breakDown || red) && meaningfulMove) {
      return { label: "5m Confirmed", tone: "success", passed: true, reason: `5m close supports PE below ${formatPrice(prev.low)}` };
    }
    if (green && close > prev.close) {
      return { label: "5m Against", tone: "error", passed: false, reason: "5m candle is against PE setup" };
    }
    return { label: "5m Watch", tone: "warning", passed: false, reason: "Wait for 5m breakdown confirmation" };
  }

  if ((breakOut || green) && meaningfulMove) {
    return { label: "5m Confirmed", tone: "success", passed: true, reason: `5m close supports CE above ${formatPrice(prev.high)}` };
  }
  if (red && close < prev.close) {
    return { label: "5m Against", tone: "error", passed: false, reason: "5m candle is against CE setup" };
  }
  return { label: "5m Watch", tone: "warning", passed: false, reason: "Wait for 5m breakout confirmation" };
}

function calculateEma(values = [], period = 20) {
  const clean = values.filter(isNum).map(Number);
  if (clean.length < period) return null;
  const multiplier = 2 / (period + 1);
  const seed = clean.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  return clean.slice(period).reduce((ema, value) => (value - ema) * multiplier + ema, seed);
}

function getLastCandleValue(candles = [], key) {
  const row = [...candles].reverse().find((item) => isNum(item?.[key]));
  return isNum(row?.[key]) ? Number(row[key]) : null;
}

function calculateAtr(candles = [], period = 10) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    const prevClose = Number(candles[i - 1].close);
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trs.slice(-period);
  return recent.length === period ? recent.reduce((sum, value) => sum + value, 0) / period : null;
}

function calculateSuperTrendDirection(candles = [], period = 10, multiplier = 3) {
  if (!Array.isArray(candles) || candles.length < period + 2) return null;
  let finalUpper = null;
  let finalLower = null;
  let direction = 1;

  for (let i = period; i < candles.length; i += 1) {
    const window = candles.slice(0, i + 1);
    const atr = calculateAtr(window, period);
    const current = candles[i];
    const prev = candles[i - 1];
    if (!isNum(atr) || !current || !prev) continue;
    const hl2 = (Number(current.high) + Number(current.low)) / 2;
    const basicUpper = hl2 + multiplier * Number(atr);
    const basicLower = hl2 - multiplier * Number(atr);
    finalUpper = finalUpper === null || basicUpper < finalUpper || Number(prev.close) > finalUpper ? basicUpper : finalUpper;
    finalLower = finalLower === null || basicLower > finalLower || Number(prev.close) < finalLower ? basicLower : finalLower;
    if (Number(current.close) > finalUpper) direction = 1;
    else if (Number(current.close) < finalLower) direction = -1;
  }

  return direction;
}

function calculateDmiDirection(candles = [], period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const moves = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const prev = candles[i - 1];
    const upMove = Number(current.high) - Number(prev.high);
    const downMove = Number(prev.low) - Number(current.low);
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      Number(current.high) - Number(current.low),
      Math.abs(Number(current.high) - Number(prev.close)),
      Math.abs(Number(current.low) - Number(prev.close))
    );
    moves.push({ plusDm, minusDm, tr });
  }
  const recent = moves.slice(-period);
  const trSum = recent.reduce((sum, row) => sum + row.tr, 0);
  if (!trSum) return null;
  const plusDi = (recent.reduce((sum, row) => sum + row.plusDm, 0) / trSum) * 100;
  const minusDi = (recent.reduce((sum, row) => sum + row.minusDm, 0) / trSum) * 100;
  return { plusDi, minusDi, direction: plusDi > minusDi ? 1 : minusDi > plusDi ? -1 : 0 };
}

function calculateObvDirection(candles = [], lookback = 8) {
  const usable = (candles || []).filter((row) => isNum(row.close) && isNum(row.volume));
  if (usable.length < lookback + 2) return null;
  let obv = 0;
  const values = [];
  for (let i = 1; i < usable.length; i += 1) {
    if (Number(usable[i].close) > Number(usable[i - 1].close)) obv += Number(usable[i].volume || 0);
    else if (Number(usable[i].close) < Number(usable[i - 1].close)) obv -= Number(usable[i].volume || 0);
    values.push(obv);
  }
  const current = values[values.length - 1];
  const previous = values[Math.max(0, values.length - 1 - lookback)];
  return { current, previous, direction: current > previous ? 1 : current < previous ? -1 : 0 };
}

function directionalCheck(direction, side, bullishLabel, bearishLabel, waitLabel = "Collect") {
  if (!side || !isNum(direction)) return { label: waitLabel, tone: "warning", passed: false, direction: 0 };
  const label = Number(direction) > 0 ? bullishLabel : Number(direction) < 0 ? bearishLabel : "Flat";
  const passed = side === "CE" ? Number(direction) > 0 : side === "PE" ? Number(direction) < 0 : false;
  return { label, tone: passed ? "success" : Number(direction) === 0 ? "warning" : "error", passed, direction: Number(direction) };
}

function compactTrendCheckLabel(check = {}) {
  const label = String(check.label || "");
  if (check.key === "supertrend") return label.includes("Collect") ? "ST -" : `ST ${label}`;
  if (check.key === "di") {
    if (label.includes("Collect")) return "DI -";
    if (label.includes("+DI")) return "+DI";
    if (label.includes("-DI")) return "-DI";
    return "DI Flat";
  }
  if (check.key === "obv") {
    if (label.includes("Collect")) return "OBV -";
    if (label.includes("Buying")) return "OBV Buy";
    if (label.includes("Selling")) return "OBV Sell";
    return "OBV Flat";
  }
  if (check.key === "pivot") {
    if (label.includes("Collect")) return "Pivot -";
    if (label.includes("Above")) return "Pivot Up";
    if (label.includes("Below")) return "Pivot Dn";
    return "Pivot Flat";
  }
  return label || "-";
}

function getTrendEngineConfirmation({ detail = {}, analytics = {}, side = "", timeframeHistory = {}, price }) {
  const fifteen = normalizeHistoryCandles(getTimeframeHistoryBlock(timeframeHistory, "15"));
  const five = normalizeHistoryCandles(getTimeframeHistoryBlock(timeframeHistory, "5"));
  const prevLevels = analytics?.previousDayLevels || detail?.previousDayLevels || {};
  const pivot = asNum(analytics?.pivot ?? analytics?.previousDayPivot ?? prevLevels?.pivot, null);
  const lastPrice = asNum(price ?? getLastCandleValue(five, "close") ?? detail?.spot?.ltp ?? detail?.future?.ltp, null);

  const superDirection = calculateSuperTrendDirection(fifteen);
  const di = calculateDmiDirection(fifteen);
  const obv = calculateObvDirection(five.length ? five : fifteen);
  const pivotDirection = isNum(lastPrice) && isNum(pivot) ? (Number(lastPrice) > Number(pivot) ? 1 : Number(lastPrice) < Number(pivot) ? -1 : 0) : null;

  const checks = [
    { key: "supertrend", title: "SuperTrend", ...directionalCheck(superDirection, side, "Bull", "Bear", "ST Collect") },
    {
      key: "di",
      title: "DI",
      ...directionalCheck(di?.direction, side, "+DI Lead", "-DI Lead", "DI Collect"),
      plusDi: isNum(di?.plusDi) ? Number(di.plusDi.toFixed(1)) : null,
      minusDi: isNum(di?.minusDi) ? Number(di.minusDi.toFixed(1)) : null,
    },
    { key: "obv", title: "OBV", ...directionalCheck(obv?.direction, side, "Buying", "Selling", "OBV Collect") },
    { key: "pivot", title: "Pivot", ...directionalCheck(pivotDirection, side, "Above Pivot", "Below Pivot", "Pivot Collect"), pivot },
  ];

  const usable = checks.filter((item) => item.label && !String(item.label).includes("Collect"));
  const passedCount = checks.filter((item) => item.passed).length;
  const oppositeCount = usable.filter((item) => item.tone === "error").length;
  const tone = passedCount >= 3 ? "success" : oppositeCount >= 2 ? "error" : "warning";
  const label = passedCount >= 3 ? "Trend OK" : oppositeCount >= 2 ? "Trend Bad" : "Trend Watch";
  const compact = checks.map(compactTrendCheckLabel).join(" | ");
  return {
    label,
    compact,
    tone,
    passed: passedCount >= 3,
    scoreImpact: passedCount >= 3 ? 6 : oppositeCount >= 2 ? -6 : 0,
    checks,
    passedCount,
    total: checks.length,
    reason: checks.map((item) => `${item.title}: ${item.label}`).join(" | "),
  };
}

function getEmaTrendConfirmation(history = {}, side, label = "Trend") {
  const candles = normalizeHistoryCandles(history);
  if (!side) return { label: `${label} Wait`, tone: "warning", passed: false, reason: "No option side selected" };
  if (candles.length < 55) return { label: `${label} Collect`, tone: "warning", passed: false, reason: `Need more ${label} candles for EMA 20/50` };

  const closes = candles.map((row) => row.close);
  const close = Number(closes[closes.length - 1]);
  const ema20 = calculateEma(closes, 20);
  const ema50 = calculateEma(closes, 50);
  if (!isNum(ema20) || !isNum(ema50)) return { label: `${label} Collect`, tone: "warning", passed: false, reason: `EMA unavailable on ${label}` };

  const bullish = close > ema20 && close > ema50 && ema20 > ema50;
  const bearish = close < ema20 && close < ema50 && ema20 < ema50;
  const passed = side === "CE" ? bullish : side === "PE" ? bearish : false;
  const trendLabel = bullish ? "Bull EMA" : bearish ? "Bear EMA" : "Sideways";
  return {
    label: `${label} ${trendLabel}`,
    tone: passed ? "success" : trendLabel === "Sideways" ? "warning" : "error",
    passed,
    ema20: Number(ema20.toFixed(2)),
    ema50: Number(ema50.toFixed(2)),
    close,
    reason: passed
      ? `${label} EMA 20/50 supports ${side}`
      : `${label} EMA 20/50 does not support ${side}`,
  };
}

function getGapFirst15Check(history = {}, side) {
  const candles = normalizeHistoryCandles(history);
  if (!side) return { label: "Gap Wait", tone: "warning", passed: false, reason: "No option side selected" };
  const sessionStart = getSessionStartTs();
  const today = candles.filter((row) => Number(row.ts || 0) >= sessionStart);
  if (today.length < 4) return { label: "Gap Collect", tone: "warning", passed: false, reason: "Need first 15m candles" };
  const now = new Date();
  const openingNoise = now.getHours() === 9 && now.getMinutes() < 25;
  const first = today[0];
  const first15 = today.slice(0, 3);
  const current = today[today.length - 1];
  const previous = candles.filter((row) => Number(row.ts || 0) < sessionStart).slice(-1)[0];
  const first15High = Math.max(...first15.map((row) => Number(row.high)));
  const first15Low = Math.min(...first15.map((row) => Number(row.low)));
  const gapPct = isNum(previous?.close) ? ((Number(first.open) - Number(previous.close)) / Number(previous.close)) * 100 : null;
  const sustainedUp = Number(current.close) >= Number(first.open) && Number(current.close) > first15High;
  const sustainedDown = Number(current.close) <= Number(first.open) && Number(current.close) < first15Low;
  if (openingNoise) return { label: "Open Noise", tone: "warning", passed: false, reason: "Avoid immediate opening trade before 9:25" };
  if (side === "CE") {
    const passed = sustainedUp || (!isNum(gapPct) && Number(current.close) > first15High);
    return {
      label: passed ? "Gap/15m OK" : "Gap Wait",
      tone: passed ? "success" : "warning",
      passed,
      reason: passed ? `Price sustained above first 15m high ${formatPrice(first15High)}` : "Wait for gap sustain or first 15m high break",
    };
  }
  const passed = sustainedDown || (!isNum(gapPct) && Number(current.close) < first15Low);
  return {
    label: passed ? "Gap/15m OK" : "Gap Wait",
    tone: passed ? "success" : "warning",
    passed,
    reason: passed ? `Price sustained below first 15m low ${formatPrice(first15Low)}` : "Wait for gap sustain or first 15m low break",
  };
}

function getVolumeBreakoutQuality(history = {}, side) {
  const candles = normalizeHistoryCandles(history).filter((row) => isNum(row.volume) && Number(row.volume) > 0);
  if (!side) return { label: "Volume Wait", tone: "warning", passed: false, reason: "No option side selected" };
  if (candles.length < 22) return { label: "Volume Collect", tone: "warning", passed: false, reason: "Need more candles for average volume" };

  const last = candles[candles.length - 1];
  const previous = candles.slice(-21, -1);
  const avgVolume = previous.reduce((sum, row) => sum + Number(row.volume || 0), 0) / previous.length;
  const ratio = avgVolume > 0 ? Number((Number(last.volume || 0) / avgVolume).toFixed(2)) : null;
  const directionOk = side === "CE" ? Number(last.close) >= Number(last.open) : side === "PE" ? Number(last.close) <= Number(last.open) : false;
  const passed = isNum(ratio) && ratio >= 1.5 && directionOk;
  return {
    label: passed ? "Volume Spike" : isNum(ratio) ? `${formatNum(ratio, 2)}x Vol` : "Volume N/A",
    tone: passed ? "success" : isNum(ratio) && ratio >= 1.2 ? "warning" : "error",
    passed,
    ratio,
    reason: passed ? `${formatNum(ratio, 2)}x average volume supports ${side}` : "Breakout volume is not strong enough",
  };
}

function getSmartMoneyTraction(chain = [], analytics = {}, side = "", underlyingPrice) {
  if (!Array.isArray(chain) || !chain.length || !side || !underlyingPrice) return { tone: "warning", label: "No Setup", detail: "Waiting for signal" };
  
  if (side === "CE") {
    const resistances = analytics.resistances || [];
    let nearestRes = [...resistances].sort((a,b) => a - b).find((r) => r > underlyingPrice);
    if (!nearestRes && analytics.callWall && analytics.callWall > underlyingPrice) nearestRes = analytics.callWall;
    if (!nearestRes) return { tone: "success", label: "Blue Sky", passed: true, detail: "No immediate resistance detected" };
    
    const strikeRow = chain.find(r => Number(r.strike) === Number(nearestRes));
    if (!strikeRow) return { tone: "warning", label: `R1 @ ${nearestRes}`, passed: true, detail: "Tracking resistance" };
    
    const oich = asNum(strikeRow.ce_oich, 0);
    if (oich < -20000) return { tone: "success", label: "Short Covering", passed: true, detail: `${formatCompactInt(Math.abs(oich))} Call writers panicking at ${nearestRes}` };
    if (oich > 50000) return { tone: "error", label: "Resistance Defended", passed: false, detail: `${formatCompactInt(oich)} Call writers added at ${nearestRes}` };
    return { tone: "warning", label: `R1 @ ${nearestRes}`, passed: true, detail: "Normal OI activity at resistance" };
  }
  
  if (side === "PE") {
    const supports = analytics.supports || [];
    let nearestSup = [...supports].sort((a,b) => b - a).find((s) => s < underlyingPrice);
    if (!nearestSup && analytics.putWall && analytics.putWall < underlyingPrice) nearestSup = analytics.putWall;
    if (!nearestSup) return { tone: "success", label: "Free Fall", passed: true, detail: "No immediate support detected" };
    
    const strikeRow = chain.find(r => Number(r.strike) === Number(nearestSup));
    if (!strikeRow) return { tone: "warning", label: `S1 @ ${nearestSup}`, passed: true, detail: "Tracking support" };
    
    const oich = asNum(strikeRow.pe_oich, 0);
    if (oich < -20000) return { tone: "success", label: "Long Unwinding", passed: true, detail: `${formatCompactInt(Math.abs(oich))} Put writers panicking at ${nearestSup}` };
    if (oich > 50000) return { tone: "error", label: "Support Defended", passed: false, detail: `${formatCompactInt(oich)} Put writers added at ${nearestSup}` };
    return { tone: "warning", label: `S1 @ ${nearestSup}`, passed: true, detail: "Normal OI activity at support" };
  }
  return { tone: "warning", label: "Neutral", detail: "No directional bias" };
}

function getOiPcrConfirmation({ side, pcr, oiTotals = {} }) {
  if (!side) return { label: "OI Wait", tone: "warning", passed: false, reason: "No option side selected" };
  const pcrValue = asNum(pcr, null);
  const putChange = asNum(oiTotals.putOiChange, null);
  const callChange = asNum(oiTotals.callOiChange, null);
  const netPutMinusCall = isNum(putChange) && isNum(callChange) ? Number(putChange) - Number(callChange) : null;
  const pcrOk = side === "CE" ? isNum(pcrValue) && Number(pcrValue) >= 1 : side === "PE" ? isNum(pcrValue) && Number(pcrValue) <= 1 : false;
  const oiOk = side === "CE" ? isNum(netPutMinusCall) && Number(netPutMinusCall) >= 0 : side === "PE" ? isNum(netPutMinusCall) && Number(netPutMinusCall) <= 0 : false;
  const passed = Boolean(pcrOk && (oiOk || !isNum(netPutMinusCall)));
  return {
    label: passed ? "OI/PCR OK" : "OI/PCR Conflict",
    tone: passed ? "success" : "warning",
    passed,
    reason: passed ? `PCR ${formatNum(pcrValue, 2)} supports ${side}` : `PCR/OI not fully aligned for ${side}`,
  };
}

function getVixProfessionalCheck(vix = {}) {
  const level = asNum(vix?.ltp, null);
  const change = asNum(vix?.change_pct, null);
  if (!isNum(level) && !isNum(change)) return { label: "VIX Collect", tone: "warning", passed: false, reason: "VIX unavailable" };
  const passed = (!isNum(level) || Number(level) < 22) && (!isNum(change) || Number(change) >= -4);
  return {
    label: passed ? "VIX OK" : "VIX Risk",
    tone: passed ? "success" : "warning",
    passed,
    reason: passed ? "VIX is acceptable for option buying" : "VIX is falling fast or too elevated",
  };
}

function getBidAskSpreadCheck(option = {}) {
  const premium = asNum(option?.premium, null);
  const bid = asNum(option?.bid, null);
  const ask = asNum(option?.ask, null);
  if (!isNum(bid) || !isNum(ask) || Number(bid) <= 0 || Number(ask) <= 0 || !isNum(premium)) {
    return { label: "Spread Collect", tone: "warning", passed: true, reason: "Bid/ask unavailable; using OI and volume liquidity" };
  }
  const spread = Number(ask) - Number(bid);
  const spreadPct = Number(premium) > 0 ? (spread / Number(premium)) * 100 : null;
  const passed = isNum(spreadPct) && Number(spreadPct) <= 3;
  return {
    label: passed ? "Tight Spread" : "Wide Spread",
    tone: passed ? "success" : Number(spreadPct) <= 5 ? "warning" : "error",
    passed,
    spread,
    spreadPct,
    reason: passed ? `Bid/ask spread ${formatNum(spreadPct, 1)}%` : `Wide bid/ask spread ${formatNum(spreadPct, 1)}%`,
  };
}

function getExpiryDateFromDetail(detail = {}) {
  const analytics = detail?.analytics || {};
  const chain = detail?.optionChain || [];
  const raw = detail?.expiry || detail?.expiryDate || detail?.expiry_date || analytics?.expiry || analytics?.expiryDate || analytics?.expiry_date ||
    chain.find((row) => row?.expiry || row?.expiryDate || row?.expiry_date)?.expiry ||
    chain.find((row) => row?.expiry || row?.expiryDate || row?.expiry_date)?.expiryDate ||
    chain.find((row) => row?.expiry || row?.expiryDate || row?.expiry_date)?.expiry_date;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getExpiryDayCheck(detail = {}) {
  const expiry = getExpiryDateFromDetail(detail);
  if (!expiry) return { label: "Expiry Collect", tone: "warning", passed: true, reason: "Expiry date unavailable" };
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const expiryDay = new Date(expiry);
  expiryDay.setHours(0, 0, 0, 0);
  const days = Math.round((expiryDay.getTime() - today.getTime()) / 86400000);
  const lateExpiry = days <= 0 && (now.getHours() > 12 || (now.getHours() === 12 && now.getMinutes() >= 0));
  if (lateExpiry) return { label: "Expiry Risk", tone: "error", passed: false, reason: "Expiry-day afternoon theta risk; avoid fresh buys" };
  if (days <= 0) return { label: "Expiry Day", tone: "warning", passed: true, reason: "Expiry day; use smaller size and faster exits" };
  if (days <= 1) return { label: "Expiry Near", tone: "warning", passed: true, reason: `${days} day to expiry; theta risk elevated` };
  return { label: `${days}d Expiry`, tone: "success", passed: true, reason: "Enough time to expiry for option buying" };
}

function getHeavyweightConfirmation(symbol, side, sectors = []) {
  if (!side) return { label: "Heavy Wait", tone: "warning", passed: false, reason: "No option side selected" };
  const names = symbol === "BANKNIFTY"
    ? ["bank", "financial"]
    : symbol === "SENSEX"
      ? ["bank", "financial", "it", "oil"]
      : ["bank", "financial", "it", "oil", "energy"];
  const matches = (sectors || []).filter((sector) => {
    const name = String(sector?.name || "").toLowerCase();
    return names.some((needle) => name.includes(needle));
  }).filter((sector) => isNum(sector?.change_pct));
  if (!matches.length) return { label: "Heavy Collect", tone: "warning", passed: true, reason: "Heavyweight sector confirmation unavailable" };
  const avg = matches.reduce((sum, sector) => sum + Number(sector.change_pct), 0) / matches.length;
  const passed = side === "CE" ? avg >= 0 : avg <= 0;
  return {
    label: passed ? "Heavy OK" : "Heavy Diverge",
    tone: passed ? "success" : "warning",
    passed,
    reason: `${matches.map((sector) => sector.name).slice(0, 3).join(", ")} avg ${formatPct(avg)} ${passed ? "supports" : "does not support"} ${side}`,
  };
}

function buildProfessionalTradeGate({
  setupSide,
  signal,
  vwapState,
  volumeBreakout,
  oiPcr,
  vixCheck,
  premiumQuality,
  plan,
  timeframe,
  fifteenTrend,
  dailyTrend,
  hourlyTrend,
  gapCheck,
  spreadCheck,
  expiryCheck,
  heavyweightCheck,
  trendEngine,
  dataFreshness,
  premiumMomentum,
  trigger,
  sessionQuality,
}) {
  const rr = asNum(plan?.riskReward, null);
  const freshness = getCombinedFreshness(dataFreshness);
  const setupChecks = [
    {
      key: "trend",
      label: "Trend",
      passed: Boolean(String(signal?.bias || "").match(/bull|bear/i)) && setupSide,
      tone: String(signal?.bias || "").match(/bull|bear/i) ? "success" : "warning",
      detail: signal?.bias || "No Bias",
    },
    { key: "daily", label: "Daily", passed: Boolean(dailyTrend?.passed), tone: dailyTrend?.tone || "warning", detail: dailyTrend?.label || "Collect" },
    { key: "h60", label: "60m", passed: Boolean(hourlyTrend?.passed), tone: hourlyTrend?.tone || "warning", detail: hourlyTrend?.label || "Collect" },
    { key: "m15", label: "15m", passed: Boolean(fifteenTrend?.passed), tone: fifteenTrend?.tone || "warning", detail: fifteenTrend?.label || "Collect" },
    { key: "vwap", label: "VWAP", passed: Boolean(vwapState?.aligned), tone: vwapState?.aligned ? "success" : "warning", detail: vwapState?.label || "VWAP N/A" },
    { key: "oiPcr", label: "OI/PCR", passed: Boolean(oiPcr?.passed), tone: oiPcr?.tone || "warning", detail: oiPcr?.label || "Collect" },
    { key: "vix", label: "VIX", passed: Boolean(vixCheck?.passed), tone: vixCheck?.tone || "warning", detail: vixCheck?.label || "Collect" },
    { key: "heavy", label: "Heavy", passed: heavyweightCheck?.passed !== false, tone: heavyweightCheck?.tone || "warning", detail: heavyweightCheck?.label || "Collect" },
    { key: "trendEngine", label: "Trend Engine", passed: trendEngine?.passed !== false && trendEngine?.tone !== "error", tone: trendEngine?.tone || "warning", detail: trendEngine?.label || "Collect" },
    { key: "strike", label: "Strike", passed: premiumQuality?.tone === "success", tone: premiumQuality?.tone || "warning", detail: premiumQuality?.label || "No Strike" },
    { key: "rr", label: "R:R", passed: isNum(rr) && Number(rr) >= 2, tone: isNum(rr) && Number(rr) >= 2 ? "success" : isNum(rr) && Number(rr) >= 1.5 ? "warning" : "error", detail: isNum(rr) ? formatNum(rr, 2) : "-" },
    { key: "freshness", label: "Data", passed: freshness.passed, tone: freshness.tone, detail: freshness.compact },
  ];
  const entryChecks = [
    { key: "m5", label: "5m", passed: Boolean(timeframe?.passed), tone: timeframe?.tone || "warning", detail: timeframe?.label || "Collect" },
    { key: "gap", label: "Gap", passed: Boolean(gapCheck?.passed), tone: gapCheck?.tone || "warning", detail: gapCheck?.label || "Collect" },
    { key: "volume", label: "Volume", passed: Boolean(volumeBreakout?.passed), tone: volumeBreakout?.tone || "warning", detail: volumeBreakout?.label || "Collect" },
    { key: "spread", label: "Spread", passed: spreadCheck?.passed !== false, tone: spreadCheck?.tone || "warning", detail: spreadCheck?.label || "Collect" },
    { key: "expiry", label: "Expiry", passed: expiryCheck?.passed !== false, tone: expiryCheck?.tone || "warning", detail: expiryCheck?.label || "Collect" },
    { key: "premium", label: "Premium", passed: Boolean(premiumMomentum?.passed), tone: premiumMomentum?.tone || "warning", detail: premiumMomentum?.label || "Collect" },
    { key: "trigger", label: "Trigger", passed: Boolean(trigger?.ready), tone: trigger?.tone || "warning", detail: trigger?.label || "Wait" },
    { key: "session", label: "Session", passed: sessionQuality?.passed !== false, tone: sessionQuality?.tone || "warning", detail: sessionQuality?.label || "Check" },
  ];
  const checks = [...setupChecks, ...entryChecks];
  const setupScore = setupChecks.filter((item) => item.passed).length;
  const entryScore = entryChecks.filter((item) => item.passed).length;
  const score = checks.filter((item) => item.passed).length;
  const failed = checks.filter((item) => !item.passed);
  const hardBlocks = [
    !setupSide ? "No option side" : "",
    !vwapState?.aligned ? "VWAP conflict" : "",
    (isNum(rr) && Number(rr) < 1.5) ? "R:R below 1:1.5" : "",
    freshness.tone === "error" ? "Stale candle data" : "",
    expiryCheck?.tone === "error" ? "Expiry-day theta risk" : "",
    spreadCheck?.tone === "error" ? "Wide bid/ask spread" : "",
    sessionQuality?.passed === false ? "Session blocked" : "",
    trigger?.invalidated ? "Setup invalidated" : "",
  ].filter(Boolean);
  const setupPassMinimum = Math.ceil(setupChecks.length * 0.5);
  const entryPassMinimum = Math.ceil(entryChecks.length * 0.8);
  const decision = trigger?.continuation
    ? "TRAIL"
    : hardBlocks.length
      ? "AVOID"
      : setupScore < setupPassMinimum
        ? "AVOID"
        : entryScore < entryPassMinimum
          ? "WAIT"
          : "READY";
  const reason = decision === "TRAIL"
    ? "Target crossed; trail only while checks stay aligned"
    : hardBlocks.length
      ? `Avoid: ${hardBlocks.slice(0, 3).join(", ")}`
      : decision === "READY"
        ? `Ready: ${checks.filter((item) => item.passed).slice(0, 4).map((item) => item.label).join(", ")} aligned`
        : decision === "WAIT"
          ? `Wait: needs ${failed.slice(0, 3).map((item) => item.label).join(", ")}`
          : `Avoid: needs ${failed.slice(0, 3).map((item) => item.label).join(", ")}`;
  return {
    score,
    total: checks.length,
    setupScore,
    setupTotal: setupChecks.length,
    entryScore,
    entryTotal: entryChecks.length,
    decision,
    hardBlocks,
    passed: decision === "READY" || decision === "TRAIL",
    label: decision.charAt(0) + decision.slice(1).toLowerCase(),
    tone: decision === "READY" || decision === "TRAIL" ? "success" : decision === "WAIT" ? "warning" : "error",
    reason,
    actionReason: reason,
    freshness,
    setupChecks,
    entryChecks,
    checks,
  };
}

function getDirectionalMoneynessBias(strike, spotPrice, side) {
  if (!isNum(strike) || !isNum(spotPrice)) return 0;
  if (side === "CE") return Number(strike) <= Number(spotPrice) ? 1 : -1;
  if (side === "PE") return Number(strike) >= Number(spotPrice) ? 1 : -1;
  return 0;
}

function selectTradableOption(chain = [], spotPrice = 0, bias = "Neutral", mode = "INTRADAY") {
  const side = String(bias || "").toLowerCase().includes("bear") ? "PE" : "CE";
  const directional = String(bias || "").toLowerCase().includes("bull") || String(bias || "").toLowerCase().includes("bear");
  if (!directional || !chain.length || !spotPrice) return null;

  const rules = getBuyerModeRules(mode);
  const step = getStrikeStep(chain);
  const candidates = chain
    .map((row) => {
      const strike = Number(row?.strike || 0);
      const premium = Number(side === "CE" ? row?.ce_ltp : row?.pe_ltp || 0);
      const bid = Number(side === "CE" ? row?.ce_bid : row?.pe_bid || 0);
      const ask = Number(side === "CE" ? row?.ce_ask : row?.pe_ask || 0);
      const oi = Number(side === "CE" ? row?.ce_oi : row?.pe_oi || 0);
      const oiChange = Number(side === "CE" ? row?.ce_oich : row?.pe_oich || 0);
      const volume = Number(side === "CE" ? row?.ce_volume : row?.pe_volume || 0);
      const iv = Number(side === "CE" ? row?.ce_iv : row?.pe_iv || row?.iv || 0);
      const delta = Number(side === "CE" ? row?.ce_delta : row?.pe_delta || 0);
      const gamma = Number(side === "CE" ? row?.ce_gamma : row?.pe_gamma || 0);
      const theta = Number(side === "CE" ? row?.ce_theta : row?.pe_theta || 0);
      const vega = Number(side === "CE" ? row?.ce_vega : row?.pe_vega || 0);
      const historySymbol = side === "CE" ? row?.ce_symbol : row?.pe_symbol;
      if (!strike || premium < rules.minPremium || premium > rules.maxPremium || volume <= 0) return null;

      const distance = Math.abs(strike - spotPrice);
      const moneyness = getOptionMoneyness({ strike, side }, spotPrice, step);
      const directionalBias = getDirectionalMoneynessBias(strike, spotPrice, side);
      if (distance > step * 1.6) return null;
      if (directionalBias < 0 && distance > step * 0.7) return null;
      let score = 0;
      score += Math.max(0, 32 - (distance / step) * 8);
      score += Math.min(volume / 100000, 22);
      score += Math.min(oi / 200000, 18);
      score += oiChange > 0 ? 12 : 3;
      score += premium >= 60 && premium <= 320 ? 16 : premium <= 500 ? 8 : 2;
      score += moneyness === "ATM" ? 10 : moneyness === "ITM" ? 12 : -16;
      score += directionalBias > 0 ? 12 : -14;
      score += iv > 0 && iv <= 28 ? 8 : iv > 36 ? -8 : 2;

      return { strike, side, premium, bid, ask, oi, oiChange, volume, iv, delta, gamma, theta, vega, historySymbol, score: Number(score.toFixed(2)), distance, moneyness, directionalBias };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.directionalBias - a.directionalBias || a.distance - b.distance);

  return candidates[0] || null;
}

function selectDisplayOption(chain = [], spotPrice = 0, bias = "Neutral") {
  if (!Array.isArray(chain) || !chain.length || !isNum(spotPrice)) return null;
  const directional = String(bias || "").toLowerCase().includes("bull") || String(bias || "").toLowerCase().includes("bear");
  if (!directional) return null;
  const side = String(bias || "").toLowerCase().includes("bear") ? "PE" : "CE";
  const step = getStrikeStep(chain);
  const candidates = chain
    .map((row) => {
      const strike = Number(row?.strike || 0);
      const premium = Number(side === "CE" ? row?.ce_ltp : row?.pe_ltp || 0);
      const bid = Number(side === "CE" ? row?.ce_bid : row?.pe_bid || 0);
      const ask = Number(side === "CE" ? row?.ce_ask : row?.pe_ask || 0);
      const oi = Number(side === "CE" ? row?.ce_oi : row?.pe_oi || 0);
      const oiChange = Number(side === "CE" ? row?.ce_oich : row?.pe_oich || 0);
      const volume = Number(side === "CE" ? row?.ce_volume : row?.pe_volume || 0);
      const iv = Number(side === "CE" ? row?.ce_iv : row?.pe_iv || row?.iv || 0);
      const delta = Number(side === "CE" ? row?.ce_delta : row?.pe_delta || 0);
      const gamma = Number(side === "CE" ? row?.ce_gamma : row?.pe_gamma || 0);
      const theta = Number(side === "CE" ? row?.ce_theta : row?.pe_theta || 0);
      const vega = Number(side === "CE" ? row?.ce_vega : row?.pe_vega || 0);
      const historySymbol = side === "CE" ? row?.ce_symbol : row?.pe_symbol;
      if (!strike || (!premium && !oi && !volume && !iv)) return null;
      const distance = Math.abs(strike - Number(spotPrice));
      const directionalBias = getDirectionalMoneynessBias(strike, spotPrice, side);
      if (distance > step * 1.6) return null;
      if (directionalBias < 0 && distance > step * 0.7) return null;
      return {
        strike,
        side,
        premium,
        bid,
        ask,
        oi,
        oiChange,
        volume,
        iv,
        delta,
        gamma,
        theta,
        vega,
        historySymbol,
        distance,
        moneyness: getOptionMoneyness({ strike, side }, spotPrice, step),
        directionalBias,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.directionalBias - a.directionalBias || a.distance - b.distance || b.volume - a.volume || b.oi - a.oi);

  return candidates[0] || null;
}

function roundTick(value, tick = 0.05) {
  if (!isNum(value)) return null;
  return Number((Math.round(Number(value) / tick) * tick).toFixed(2));
}

function estimateDelta(option) {
  const delta = Math.abs(asNum(option?.delta, 0));
  if (delta > 0 && delta <= 1) return delta;
  return 0.5;
}

function buildOptionBuyerPlan(signal = {}, option, underlyingPrice, mode = "INTRADAY") {
  if (!option || !isNum(option?.premium)) return null;

  const rules = getBuyerModeRules(mode);
  const entry = Number(option.premium);
  if (entry < rules.minPremium) return null;
  const side = String(option.side || "").toUpperCase();
  const delta = estimateDelta(option);
  const ref = isNum(underlyingPrice) ? Number(underlyingPrice) : asNum(signal?.entry, 0);
  const indexTarget = safeIndexLevel(signal?.target);
  const indexStop = safeIndexLevel(signal?.stoploss);
  let validIndexTarget = null;
  let validIndexStop = null;

  let targetMove = null;
  let stopMove = null;

  if (side === "CE") {
    if (isNum(indexTarget) && indexTarget > ref) {
      validIndexTarget = indexTarget;
      targetMove = indexTarget - ref;
    }
    if (isNum(indexStop) && indexStop < ref) {
      validIndexStop = indexStop;
      stopMove = ref - indexStop;
    }
  } else if (side === "PE") {
    if (isNum(indexTarget) && indexTarget < ref) {
      validIndexTarget = indexTarget;
      targetMove = ref - indexTarget;
    }
    if (isNum(indexStop) && indexStop > ref) {
      validIndexStop = indexStop;
      stopMove = indexStop - ref;
    }
  }

  const fallbackTarget = entry * rules.targetMultiple;
  const fallbackStop = entry * rules.stopMultiple;
  let target = isNum(targetMove) ? entry + targetMove * delta : fallbackTarget;
  let stoploss = isNum(stopMove) ? entry - stopMove * delta : fallbackStop;

  target = Math.max(target, entry * rules.targetMultiple);
  stoploss = Math.min(stoploss, entry * 0.84);
  stoploss = Math.max(stoploss, entry * Math.min(rules.stopMultiple, 0.8));

  const risk = entry - stoploss;
  const reward = target - entry;

  return {
    entry: roundTick(entry),
    target: roundTick(target),
    stoploss: roundTick(stoploss),
    risk: roundTick(risk),
    reward: roundTick(reward),
    riskReward: risk > 0 ? roundTick(reward / risk, 0.01) : null,
    delta: roundTick(delta, 0.01),
    indexTrigger: ref || null,
    indexTarget: validIndexTarget,
    indexStop: validIndexStop,
    watchOnly: entry > rules.maxPremium,
  };
}

function safeIndexLevel(value) {
  return isNum(value) ? Number(value) : null;
}

function evaluateTrade(option, signal = {}, mode = "INTRADAY") {
  if (!option) {
    return { label: "Wait", tone: "warning", score: 35, reason: "No directional strike selected." };
  }

  const rules = getBuyerModeRules(mode);
  const confidence = asNum(signal?.confidence, 0);
  const premium = asNum(option?.premium, 0);
  if (premium < rules.minPremium || premium > rules.maxPremium) {
    return { label: "Avoid", tone: "error", score: 20, reason: "Premium is outside tradable range." };
  }
  const liquidity = Math.min(100, option.volume / 4500 + option.oi / 9000 + (option.oiChange > 0 ? 18 : 4));
  const premiumScore = premium >= 80 && premium <= 280 ? 88 : premium >= 40 && premium <= 450 ? 62 : 34;
  const quality = Math.round(confidence * 0.35 + liquidity * 0.3 + premiumScore * 0.25 + Math.min(option.score, 100) * 0.1);

  if (quality >= 72 && confidence >= rules.minConfidence) {
    return { label: "Trade Ready", tone: "success", score: quality, reason: "Direction, liquidity, and premium are aligned." };
  }
  if (quality >= 55) {
    return { label: "Wait for Trigger", tone: "warning", score: quality, reason: "Setup is usable, but confirmation is still needed." };
  }
  return { label: "Avoid", tone: "error", score: quality, reason: "Risk or execution quality is weak." };
}

function getDecayState(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 14 * 60 + 30) {
    return { label: "Extreme decay", tone: "error", note: "Prefer only fast ATM/ITM breakout trades." };
  }
  if (minutes >= 13 * 60 + 15) {
    return { label: "High decay", tone: "warning", note: "Avoid slow OTM buying; keep premium SL tight." };
  }
  return { label: "Normal", tone: "success", note: "Premium buying conditions depend on momentum." };
}

function getMomentumState(spot = {}, future = {}, side = "") {
  const changePct = asNum(spot?.change_pct ?? future?.change_pct, null);
  if (!isNum(changePct)) return { label: "Unknown", tone: "warning", aligned: false, reason: "Momentum unavailable" };
  const value = Number(changePct);
  const directionOk = side === "CE" ? value > 0 : side === "PE" ? value < 0 : false;
  if (Math.abs(value) < 0.08) return { label: "Slow", tone: "warning", aligned: false, reason: "Move is too slow for option buying" };
  if (!directionOk) return { label: "Against", tone: "error", aligned: false, reason: "Momentum is against selected option" };
  if (Math.abs(value) >= 0.25) return { label: "Strong", tone: "success", aligned: true, reason: "Momentum supports premium buying" };
  return { label: "Building", tone: "warning", aligned: true, reason: "Momentum is building, wait for trigger" };
}

function getVwapState(spot = {}, future = {}, side = "") {
  const price = asNum(spot?.ltp ?? future?.ltp, null);
  const vwap = asNum(spot?.vwap ?? future?.vwap, null);
  if (!isNum(price) || !isNum(vwap)) {
    return { label: "VWAP N/A", tone: "warning", aligned: false, reason: "VWAP unavailable" };
  }
  const diffPct = ((Number(price) - Number(vwap)) / Number(vwap)) * 100;
  const aligned = side === "CE" ? diffPct >= 0 : side === "PE" ? diffPct <= 0 : false;
  const sideLabel = diffPct >= 0 ? "Above VWAP" : "Below VWAP";
  return {
    label: sideLabel,
    tone: aligned ? "success" : "warning",
    aligned,
    diffPct: Number(diffPct.toFixed(2)),
    reason: aligned ? "VWAP supports selected side" : "VWAP does not support selected side",
  };
}

function getVolumeQuality(option, chain = []) {
  if (!option || !isNum(option.volume)) return { label: "Vol N/A", tone: "warning", ratio: null, reason: "Volume unavailable" };
  const sideKey = option.side === "CE" ? "ce_volume" : "pe_volume";
  const vols = (chain || []).map((row) => asNum(row?.[sideKey], null)).filter(isNum).map(Number).sort((a, b) => a - b);
  if (!vols.length) return { label: "Vol N/A", tone: "warning", ratio: null, reason: "Volume unavailable" };
  const median = vols[Math.floor(vols.length / 2)] || 1;
  const ratio = median > 0 ? Number((Number(option.volume) / median).toFixed(1)) : null;
  if (ratio >= 2) return { label: "Vol Spike", tone: "success", ratio, reason: `${ratio}x median option volume` };
  if (ratio >= 1) return { label: "Active Vol", tone: "success", ratio, reason: `${ratio}x median option volume` };
  return { label: "Low Vol", tone: "warning", ratio, reason: `${ratio}x median option volume` };
}

function getNearestLevelDistance(levels = [], spot, side) {
  if (!isNum(spot)) return null;
  const price = Number(spot);
  const filtered = (levels || []).filter(isNum).map(Number).filter((level) => side === "CE" ? level > price : level < price);
  if (!filtered.length) return null;
  const nearest = side === "CE" ? Math.min(...filtered) : Math.max(...filtered);
  const points = Math.abs(nearest - price);
  return {
    level: nearest,
    points,
    pct: price ? (points / price) * 100 : null,
  };
}

function getTrapStatus(option, spot, analytics = {}, mode = "INTRADAY") {
  if (!option) return { label: "Not Checked", tone: "warning", reason: "No option selected" };
  const rules = getBuyerModeRules(mode);
  const side = option.side;
  const levelList = side === "CE"
    ? [...(analytics?.resistances || []), analytics?.callWall]
    : [...(analytics?.supports || []), analytics?.putWall];
  const distance = getNearestLevelDistance(levelList, spot, side);
  if (!distance || !isNum(distance.pct)) {
    return { label: "Clear", tone: "success", distance, reason: "No nearby trap level" };
  }
  if (distance.pct <= rules.maxTrapPct) {
    return {
      label: "Near S/R",
      tone: "warning",
      distance,
      reason: `${side === "CE" ? "Resistance" : "Support"} only ${formatPrice(distance.points)} pts away`,
    };
  }
  return {
    label: "Room",
    tone: "success",
    distance,
    reason: `${formatPrice(distance.points)} pts room to next ${side === "CE" ? "resistance" : "support"}`,
  };
}

function getPriceOverrideSignal({ side, price, vwapState = {}, analytics = {}, levels = {}, foActivity = {}, oiPcr = {} }) {
  const spot = asNum(price, null);
  if (!side || !isNum(spot)) {
    return { active: false, label: "No Override", tone: "neutral", reason: "Price unavailable" };
  }
  const supports = uniqueNumbers([...(levels?.supports || []), ...(analytics?.supports || []), analytics?.putWall]);
  const resistances = uniqueNumbers([...(levels?.resistances || []), ...(analytics?.resistances || []), analytics?.callWall]);
  const brokenResistance = side === "CE"
    ? resistances.filter((level) => Number(level) <= Number(spot)).sort((a, b) => b - a)[0]
    : null;
  const brokenSupport = side === "PE"
    ? supports.filter((level) => Number(level) >= Number(spot)).sort((a, b) => a - b)[0]
    : null;
  const levelBreak = side === "CE" ? brokenResistance : brokenSupport;
  const vwapOk = Boolean(vwapState?.aligned);
  const backgroundWeak = foActivity?.passed === false || oiPcr?.passed === false;
  const active = Boolean(vwapOk && isNum(levelBreak));
  return {
    active,
    label: active ? `Override ${side} Scalp` : "No Override",
    tone: active ? "success" : "neutral",
    side,
    level: levelBreak,
    backgroundWeak,
    reason: active
      ? `${side === "CE" ? "Above VWAP and broke resistance" : "Below VWAP and broke support"} ${formatPrice(levelBreak)}${backgroundWeak ? " despite weak breadth/OI" : ""}`
      : "Needs VWAP alignment plus level breakout",
  };
}

function getTriggerStatus(option, plan, spot, signal = {}, context = {}) {
  if (!option || !plan) return { label: "Wait", tone: "warning", invalidated: false, ready: false, reason: "No actionable option plan" };
  const side = option.side;
  const trigger = safeIndexLevel(plan.indexTrigger ?? signal?.entry ?? spot);
  const stop = safeIndexLevel(plan.indexStop ?? signal?.stoploss);
  const target = safeIndexLevel(plan.indexTarget ?? signal?.target);
  const price = safeIndexLevel(spot);

  if (!isNum(price)) return { label: "Wait", tone: "warning", invalidated: false, ready: false, reason: "Spot unavailable" };
  if (side === "CE" && isNum(stop) && price <= stop) {
    return { label: "Invalid", tone: "error", invalidated: true, ready: false, reason: `Invalid below ${formatPrice(stop)}` };
  }
  if (side === "PE" && isNum(stop) && price >= stop) {
    return { label: "Invalid", tone: "error", invalidated: true, ready: false, reason: `Invalid above ${formatPrice(stop)}` };
  }
  if ((side === "CE" && isNum(target) && price >= target) || (side === "PE" && isNum(target) && price <= target)) {
    const canTrail =
      context?.momentum?.aligned &&
      context?.volumeQuality?.tone === "success" &&
      context?.premiumQuality?.tone !== "error" &&
      asNum(signal?.confidence, 0) >= 68;
    if (canTrail) {
      return {
        label: "Trail",
        tone: "success",
        invalidated: false,
        ready: true,
        targetCrossed: true,
        continuation: true,
        reason: "Target crossed; trail only while momentum, liquidity, and premium quality hold",
      };
    }
    return { label: "Book", tone: "warning", invalidated: false, ready: false, targetCrossed: true, reason: "Target crossed; book or wait for fresh setup" };
  }
  if (side === "CE" && isNum(trigger) && price < trigger) {
    return { label: "Wait Above", tone: "warning", invalidated: false, ready: false, reason: `Buy only above ${formatPrice(trigger)}` };
  }
  if (side === "PE" && isNum(trigger) && price > trigger) {
    return { label: "Wait Below", tone: "warning", invalidated: false, ready: false, reason: `Buy only below ${formatPrice(trigger)}` };
  }
  return { label: "Trigger Ready", tone: "success", invalidated: false, ready: true, reason: "Entry trigger is active" };
}

function nearestBelow(values = [], price) {
  const ref = asNum(price, null);
  if (!isNum(ref)) return null;
  return uniqueNumbers(values).filter((value) => value < ref).sort((a, b) => b - a)[0] ?? null;
}

function nearestAbove(values = [], price) {
  const ref = asNum(price, null);
  if (!isNum(ref)) return null;
  return uniqueNumbers(values).filter((value) => value > ref).sort((a, b) => a - b)[0] ?? null;
}

function sideFromBias(bias = "") {
  const text = String(bias || "").toLowerCase();
  if (text.includes("bear")) return "PE";
  if (text.includes("bull")) return "CE";
  return "";
}

function deriveBuyerSignal(detail = {}) {
  const analytics = detail?.analytics || {};
  const base = analytics?.tradeSignalPanel || {};
  if (String(base?.bias || "").match(/bull|bear/i)) return base;

  const spot = detail?.spot || {};
  const future = detail?.future || {};
  const ref = asNum(spot?.ltp ?? future?.ltp ?? base?.entry, null);
  if (!isNum(ref)) return base;

  const scores = analytics?.biasScores || {};
  let bullish = asNum(scores?.bullish, 0);
  let bearish = asNum(scores?.bearish, 0);
  const structure = String(analytics?.breakoutBreakdown?.signal || analytics?.breakoutBreakdown?.bias || "");
  const dominance = String(analytics?.callPutDominance?.bias || "");
  const gexBias = String(analytics?.gexSummary?.gexBias || "");
  const pcr = asNum(analytics?.pcr, null);

  if (/bull|breakout/i.test(structure)) bullish += /near/i.test(structure) ? 1 : 2;
  if (/bear|breakdown/i.test(structure)) bearish += /near/i.test(structure) ? 1 : 2;
  if (/bull/i.test(dominance)) bullish += 1;
  if (/bear/i.test(dominance)) bearish += 1;
  if (/positive/i.test(gexBias)) bullish += 1;
  if (/negative/i.test(gexBias)) bearish += 1;
  if (isNum(pcr)) {
    if (pcr <= 0.9) bearish += 1;
    if (pcr >= 1.1) bullish += 1;
  }

  const tradeSignals = Array.isArray(analytics?.tradeSignals) ? analytics.tradeSignals : [];
  bullish += tradeSignals.filter((item) => /bull/i.test(item?.bias || "")).length * 0.5;
  bearish += tradeSignals.filter((item) => /bear/i.test(item?.bias || "")).length * 0.5;

  if (Math.abs(bullish - bearish) < 1) return base;

  const bias = bearish > bullish ? "Bearish" : "Bullish";
  const supports = analytics?.supports || analytics?.supportResistance?.supports || [];
  const resistances = analytics?.resistances || analytics?.supportResistance?.resistances || [];
  const projectedMove = asNum(analytics?.intradayRangeProjection?.projectedMove ?? base?.projectedMove, null);
  const breakoutLevel = asNum(analytics?.breakoutBreakdown?.breakoutLevel ?? base?.breakoutLevel, null);
  const breakdownLevel = asNum(analytics?.breakoutBreakdown?.breakdownLevel ?? base?.breakdownLevel, null);

  let entry = bias === "Bearish" ? breakdownLevel : breakoutLevel;
  if (!isNum(entry)) entry = ref;

  let target = bias === "Bearish" ? nearestBelow(supports, ref) : nearestAbove(resistances, ref);
  let stoploss = bias === "Bearish" ? nearestAbove(resistances, ref) : nearestBelow(supports, ref);

  if (!isNum(target) && isNum(projectedMove)) {
    target = bias === "Bearish" ? ref - projectedMove * 0.55 : ref + projectedMove * 0.55;
  }
  if (!isNum(stoploss) && isNum(projectedMove)) {
    stoploss = bias === "Bearish" ? ref + projectedMove * 0.28 : ref - projectedMove * 0.28;
  }

  const confidence = Math.min(76, Math.round(56 + Math.abs(bullish - bearish) * 5));
  const risk = isNum(entry) && isNum(stoploss) ? Math.abs(entry - stoploss) : null;
  const reward = isNum(entry) && isNum(target) ? Math.abs(target - entry) : null;

  return {
    ...base,
    action: bias === "Bearish" ? "Watch PE / Bearish setup" : "Watch CE / Bullish setup",
    bias,
    entry: safeIndexLevel(entry),
    target: safeIndexLevel(target),
    stoploss: safeIndexLevel(stoploss),
    confidence,
    riskReward: isNum(risk) && risk > 0 && isNum(reward) ? Number((reward / risk).toFixed(2)) : null,
    bullishScore: bullish,
    bearishScore: bearish,
    projectedMove,
    breakoutLevel,
    breakdownLevel,
    source: "option_chain_fallback",
  };
}

function stabilizeBuyerSignal(signal = {}, detail = {}, foBreadth = {}) {
  const side = sideFromBias(signal?.bias);
  if (!side) return signal;

  const analytics = detail?.analytics || {};
  const spot = detail?.spot || {};
  const future = detail?.future || {};
  const price = asNum(spot?.ltp ?? future?.ltp, null);
  const vwap = asNum(spot?.vwap ?? future?.vwap, null);
  const changePct = asNum(spot?.change_pct ?? future?.change_pct, null);
  const confidence = asNum(signal?.confidence, null);
  const bullishScore = asNum(signal?.bullishScore ?? analytics?.biasScores?.bullish, null);
  const bearishScore = asNum(signal?.bearishScore ?? analytics?.biasScores?.bearish, null);
  const edge = isNum(bullishScore) && isNum(bearishScore) ? Math.abs(Number(bullishScore) - Number(bearishScore)) : null;
  const breakoutLevel = asNum(signal?.breakoutLevel ?? analytics?.breakoutBreakdown?.breakoutLevel, null);
  const breakdownLevel = asNum(signal?.breakdownLevel ?? analytics?.breakoutBreakdown?.breakdownLevel, null);
  const netPct = asNum(foBreadth?.netPct, null);
  const hasVwap = isNum(price) && isNum(vwap) && Number(vwap) > 0;
  const vwapAligned = !hasVwap || (side === "CE" ? Number(price) >= Number(vwap) : Number(price) <= Number(vwap));
  const levelAligned = !isNum(price)
    ? true
    : side === "CE"
      ? isNum(breakoutLevel) && Number(price) >= Number(breakoutLevel)
      : isNum(breakdownLevel) && Number(price) <= Number(breakdownLevel);
  const moveAligned = !isNum(changePct) || (side === "CE" ? Number(changePct) >= 0.18 : Number(changePct) <= -0.18);
  const breadthAgainst = isNum(netPct) && (side === "CE" ? Number(netPct) <= -8 : Number(netPct) >= 8);
  const weakEdge = isNum(edge) && Number(edge) < 2;
  const weakConfidence = isNum(confidence) && Number(confidence) < 62;
  const microMove = isNum(changePct) && Math.abs(Number(changePct)) < 0.18;

  if (breadthAgainst || weakEdge || weakConfidence || (!levelAligned && !vwapAligned) || (!moveAligned && !levelAligned) || (microMove && !levelAligned)) {
    const reasons = [
      breadthAgainst ? "breadth against" : "",
      weakEdge ? "weak CE/PE edge" : "",
      weakConfidence ? "low confidence" : "",
      !vwapAligned ? "VWAP not aligned" : "",
      !moveAligned && !levelAligned ? "move not strong enough" : "",
      microMove && !levelAligned ? "small move; no breakout" : "",
    ].filter(Boolean);
    return {
      ...signal,
      action: "Wait: side not stable",
      bias: "Neutral",
      confidence: isNum(confidence) ? confidence : 0,
      stabilityBlocked: true,
      stabilityReason: reasons.join(", ") || "Side confirmation is not stable yet",
    };
  }

  return {
    ...signal,
    sideStable: true,
  };
}

function getMarketSessionQuality(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 9 * 60 + 20) {
    return { label: "Opening Wait", tone: "warning", passed: false, reason: "Avoid fresh option buys before the opening range settles" };
  }
  if (minutes < 9 * 60 + 35) {
    return { label: "Open Noise", tone: "warning", passed: true, reason: "Opening premium is noisy; use smaller size or wait for clean confirmation" };
  }
  if (minutes <= 11 * 60 + 30) {
    return { label: "Trend Window", tone: "success", passed: true, reason: "Best window for directional option buying" };
  }
  if (minutes <= 13 * 60 + 45) {
    return { label: "Decay Zone", tone: "warning", passed: true, reason: "Midday decay risk; require premium momentum" };
  }
  if (minutes <= 15 * 60) {
    return { label: "Late Momentum", tone: "warning", passed: true, reason: "Late momentum can work, but reversals are faster" };
  }
  return { label: "No Fresh Trade", tone: "error", passed: false, reason: "Market close window; avoid new option buys" };
}

function getPremiumMomentumQuality(historyRows = [], option) {
  if (!option || !isNum(option?.premium)) {
    return { label: "Premium Wait", tone: "warning", passed: false, delta: null, reason: "No premium data for selected strike" };
  }
  const current = Number(option.premium);
  const comparable = [...(historyRows || [])].reverse().find((row) =>
    row?.strike === option.strike && row?.side === option.side && isNum(row?.premium)
  );
  if (!comparable) {
    return { label: "Premium Collecting", tone: "warning", passed: false, delta: null, reason: "Need one more premium tick for confirmation" };
  }
  const previous = Number(comparable.premium);
  const delta = Number((current - previous).toFixed(2));
  const pct = previous > 0 ? (delta / previous) * 100 : 0;
  if (delta > 0.15 || pct > 0.25) {
    return { label: "Premium Rising", tone: "success", passed: true, delta, pct, reason: `Premium improving by ${formatPremium(delta)}` };
  }
  if (delta < -0.15 || pct < -0.25) {
    return { label: "Premium Weak", tone: "error", passed: false, delta, pct, reason: `Premium cooling by ${formatPremium(Math.abs(delta))}` };
  }
  return { label: "Premium Flat", tone: "warning", passed: false, delta, pct, reason: "Premium has not expanded yet" };
}

function getFoActivityGate(foBreadth = {}, side) {
  const total = asNum(foBreadth?.total || foBreadth?.quotedTotal, 0);
  const universe = asNum(foBreadth?.universeTotal || total, 0);
  const coverage = asNum(foBreadth?.coveragePct, universe > 0 ? (total / universe) * 100 : null);
  const netPct = asNum(foBreadth?.netPct, null);
  const advPct = asNum(foBreadth?.advPct, null);
  const decPct = asNum(foBreadth?.decPct, null);
  const source = foBreadth?.official ? "NSE F&O" : "F&O proxy";
  const detail = isNum(netPct)
    ? `${source} net ${formatPct(netPct)}${isNum(coverage) ? `, coverage ${formatNum(coverage, 0)}%` : ""}`
    : `${source} activity collecting`;

  if (!side) {
    return { label: "Wait", tone: "warning", passed: false, scoreImpact: -6, reason: "No option side selected for F&O confirmation", detail };
  }
  if (!total || !isNum(netPct)) {
    return { label: "Wait", tone: "warning", passed: false, scoreImpact: -10, reason: "F&O breadth/activity is not ready yet", detail };
  }
  if (isNum(coverage) && Number(coverage) < 55) {
    return { label: "Thin", tone: "warning", passed: false, scoreImpact: -8, reason: `F&O coverage only ${formatNum(coverage, 0)}%; wait for better market activity`, detail };
  }

  if (side === "CE") {
    if (Number(netPct) <= -12 || Number(decPct) >= 64) {
      return { label: "Conflict", tone: "error", passed: false, scoreImpact: -22, reason: `CE blocked because F&O breadth is bearish (${formatPct(netPct)})`, detail };
    }
    if (Number(netPct) >= 8 || Number(advPct) >= 54) {
      return { label: "Support", tone: "success", passed: true, scoreImpact: 8, reason: `CE confirmed by positive F&O activity (${formatPct(netPct)})`, detail };
    }
    return { label: "Mixed", tone: "warning", passed: false, scoreImpact: -8, reason: `CE needs stronger F&O support; current net is ${formatPct(netPct)}`, detail };
  }

  if (side === "PE") {
    if (Number(netPct) >= 12 || Number(advPct) >= 64) {
      return { label: "Conflict", tone: "error", passed: false, scoreImpact: -22, reason: `PE blocked because F&O breadth is bullish (${formatPct(netPct)})`, detail };
    }
    if (Number(netPct) <= -8 || Number(decPct) >= 54) {
      return { label: "Support", tone: "success", passed: true, scoreImpact: 8, reason: `PE confirmed by weak F&O activity (${formatPct(netPct)})`, detail };
    }
    return { label: "Mixed", tone: "warning", passed: false, scoreImpact: -8, reason: `PE needs stronger bearish F&O support; current net is ${formatPct(netPct)}`, detail };
  }

  return { label: "Wait", tone: "warning", passed: false, scoreImpact: -6, reason: "Unknown option side for F&O confirmation", detail };
}

function getNoTradeGate({ option, plan, signal, quality, premiumQuality, momentum, trap, trigger, decay, greekQuality, timeframe, premiumMomentum, sessionQuality, foActivity, professionalGate, mode }) {
  const blockers = [];
  const add = (label, tone, reason) => blockers.push({ label, tone, reason });
  const rules = getBuyerModeRules(mode);
  const confidence = asNum(signal?.confidence, 0);

  if (trigger?.invalidated) add("Invalid", "error", trigger.reason);
  if (!String(signal?.bias || "").match(/bull|bear/i)) add("No Bias", "warning", "No directional bias");
  if (!option) add("No Strike", "error", "No liquid tradable strike");
  if (!plan) add("No Plan", "error", "No valid premium plan");
  if (foActivity?.passed === false) add(foActivity.label, foActivity.tone || "warning", foActivity.reason);
  if (professionalGate && professionalGate.passed === false) add(professionalGate.label, professionalGate.tone || "warning", professionalGate.reason);
  if (sessionQuality?.passed === false) add(sessionQuality.label, sessionQuality.tone, sessionQuality.reason);
  if (premiumQuality?.tone === "error") add(premiumQuality.label, "error", premiumQuality.reason);
  if (greekQuality?.passed === false) add(greekQuality.label, "error", greekQuality.reason);
  if (timeframe?.passed === false) add(timeframe.label, timeframe.tone || "warning", timeframe.reason);
  if (premiumMomentum?.passed === false) add(premiumMomentum.label, premiumMomentum.tone || "warning", premiumMomentum.reason);
  if (confidence < rules.minConfidence && signal?.source !== "option_chain_fallback") add("Low Confidence", "warning", `Confidence below ${rules.minConfidence}%`);
  if (decay?.tone === "error") add("Decay", "error", decay.note);
  if (momentum?.tone === "error" || momentum?.label === "Slow") add("Momentum", "warning", momentum.reason);
  if (trap?.label === "Near S/R") add("S/R Trap", "warning", trap.reason);
  if (isNum(plan?.riskReward) && Number(plan.riskReward) < rules.minRiskReward) add("Weak R:R", "warning", `R:R below ${formatNum(rules.minRiskReward, 2)}`);
  if (quality?.tone === "error") add("Quality", "error", quality.reason);
  if (trigger?.ready === false && !trigger?.targetCrossed) add(trigger.label, trigger.tone || "warning", trigger.reason);

  const primary = blockers.find((item) => item.tone === "error") || blockers[0] || null;
  return {
    blocked: Boolean(primary),
    label: primary?.label || "Tradable",
    tone: primary?.tone || "success",
    reason: primary?.reason || "All required filters are aligned",
    blockers,
  };
}

function getNoTradeReason({ option, plan, signal, quality, premiumQuality, momentum, trap, trigger, decay, greekQuality, timeframe, premiumMomentum, sessionQuality, foActivity, professionalGate, mode }) {
  const rules = getBuyerModeRules(mode);
  const confidence = asNum(signal?.confidence, 0);
  if (trigger?.invalidated) return trigger.reason;
  if (trigger?.targetCrossed && trigger?.continuation) return "Target crossed; trail continuation only";
  if (trigger?.targetCrossed) return trigger.reason;
  if (!String(signal?.bias || "").match(/bull|bear/i)) return "No directional bias";
  if (!option) return "No liquid tradable strike";
  if (!plan) return "No valid premium plan";
  if (foActivity?.passed === false) return foActivity.reason;
  if (professionalGate?.passed === false) return professionalGate.reason;
  if (sessionQuality?.passed === false) return sessionQuality.reason;
  if (premiumQuality?.tone === "error") return premiumQuality.reason;
  if (greekQuality?.passed === false) return greekQuality.reason;
  if (timeframe?.passed === false) return timeframe.reason;
  if (premiumMomentum?.passed === false) return premiumMomentum.reason;
  if (confidence < rules.minConfidence && signal?.source !== "option_chain_fallback") return `Confidence below ${rules.minConfidence}%`;
  if (decay?.tone === "error") return decay.note;
  if (momentum?.tone === "error") return momentum.reason;
  if (momentum?.label === "Slow") return momentum.reason;
  if (trap?.label === "Near S/R") return trap.reason;
  if (isNum(plan?.riskReward) && Number(plan.riskReward) < rules.minRiskReward) return `R:R below ${formatNum(rules.minRiskReward, 2)}`;
  if (quality?.tone === "error") return quality.reason;
  if (trigger?.ready === false) return trigger.reason;
  if (decay?.tone === "warning") return decay.note;
  return "Clean enough to monitor";
}

function getTimeframeHistoryBlock(timeframeHistory = {}, resolution = "5") {
  if (!timeframeHistory) return {};
  if (Array.isArray(timeframeHistory?.candles)) {
    return resolution === "5" ? timeframeHistory : {};
  }
  return timeframeHistory?.[resolution] || timeframeHistory?.[String(resolution).toUpperCase()] || {};
}

function getVolumeAbsorptionTrap(fiveMinuteCandles, side) {
  if (!fiveMinuteCandles || fiveMinuteCandles.length < 5) return { passed: true, label: "No Absorp", detail: "Not enough data" };
  const last = fiveMinuteCandles[fiveMinuteCandles.length - 1];
  const vols = fiveMinuteCandles.map(c => asNum(c.volume, 0)).filter(v => v > 0).sort((a,b)=>a-b);
  const medianVol = vols[Math.floor(vols.length/2)] || 1;
  const candleSize = Math.abs(asNum(last.high, 0) - asNum(last.low, 0));
  const sizes = fiveMinuteCandles.map(c => Math.abs(asNum(c.high, 0) - asNum(c.low, 0))).filter(s => s > 0).sort((a,b)=>a-b);
  const medianSize = sizes[Math.floor(sizes.length/2)] || 1;
  
  const volRatio = asNum(last.volume, 0) / medianVol;
  const sizeRatio = candleSize / medianSize;
  
  if (volRatio > 2.5 && sizeRatio < 0.6) {
      if (side === "PE") {
         return { passed: false, label: "Smart Accumulating", detail: "TRAP: Huge volume on small candle. Smart Money is absorbing selling. Do not buy PE.", tone: "error" };
      } else if (side === "CE") {
         return { passed: false, label: "Smart Distributing", detail: "TRAP: Huge volume on small candle. Smart Money is absorbing buying. Do not buy CE.", tone: "error" };
      }
  }
  return { passed: true, label: "Normal Vol", detail: "Volume action is normal.", tone: "success" };
}

function getLiquiditySweepTrap(fiveMinuteCandles, side, analytics, spot) {
  if (!fiveMinuteCandles || !fiveMinuteCandles.length) return { passed: true, label: "No Sweep", detail: "Not enough data", tone: "neutral" };
  
  const candles = fiveMinuteCandles.slice(-3);
  const pdh = asNum(analytics?.previousDayHigh, null);
  const pdl = asNum(analytics?.previousDayLow, null);
  const high = asNum(spot?.high, null);
  const low = asNum(spot?.low, null);

  if (side === "CE") {
    for (const c of candles) {
       const cHigh = asNum(c.high, 0);
       const cClose = asNum(c.close, 0);
       const cOpen = asNum(c.open, 0);
       const cLow = asNum(c.low, 0);
       if ((pdh && cHigh > pdh && cClose < pdh) || (high && cHigh >= high && cClose < cHigh - (cHigh-cLow)*0.5)) {
           if (cClose < cOpen) {
               return { passed: false, label: "Fake Breakout", detail: "TRAP WARNING: Price swept the highs to hunt stop losses and reversed.", tone: "error" };
           }
       }
    }
  } else if (side === "PE") {
    for (const c of candles) {
       const cLow = asNum(c.low, 999999);
       const cClose = asNum(c.close, 0);
       const cOpen = asNum(c.open, 0);
       const cHigh = asNum(c.high, 0);
       if ((pdl && cLow < pdl && cClose > pdl) || (low && cLow <= low && cClose > cLow + (cHigh-cLow)*0.5)) {
           if (cClose > cOpen) {
               return { passed: false, label: "Fake Breakdown", detail: "TRAP WARNING: Price swept the lows to hunt stop losses and reversed.", tone: "error" };
           }
       }
    }
  }
  
  return { passed: true, label: "No Traps", detail: "No liquidity sweep detected.", tone: "success" };
}

function getIvRankQuality(analytics) {
  const ivp = asNum(analytics?.ivp, null) ?? asNum(analytics?.ivRank, null);
  if (ivp === null) return { passed: true, label: "IV Unknown", detail: "IV Rank data missing", tone: "neutral", scoreImpact: 0 };
  
  if (ivp > 80) return { passed: false, label: `IVR High (${ivp}%)`, detail: `High IV Rank (${ivp}%); massive crush risk`, tone: "error", scoreImpact: -15 };
  if (ivp > 50) return { passed: true, label: `IVR Elev (${ivp}%)`, detail: `Elevated IV Rank (${ivp}%); slight crush risk`, tone: "warning", scoreImpact: -5 };
  if (ivp < 30) return { passed: true, label: `IVR Low (${ivp}%)`, detail: `Low IV Rank (${ivp}%); safe for buying`, tone: "success", scoreImpact: 5 };
  return { passed: true, label: `IVR Mid (${ivp}%)`, detail: `Normal IV Rank (${ivp}%)`, tone: "neutral", scoreImpact: 0 };
}

function getMaxPainShift(analytics) {
  const current = asNum(analytics?.maxPain, null);
  const open = asNum(analytics?.openMaxPain, null) ?? asNum(analytics?.previousMaxPain, null);
  
  if (!current || !open || current === open) return { label: "Static", tone: "neutral", direction: 0 };
  
  if (current > open) return { label: `Shift Up (${formatPrice(open)}->${formatPrice(current)})`, tone: "success", direction: 1 };
  return { label: `Shift Dn (${formatPrice(open)}->${formatPrice(current)})`, tone: "error", direction: -1 };
}

function getFiiFlowBias(fiiDii, side) {
  const longOi = asNum(fiiDii?.fii?.indexOptions?.long, 0);
  const shortOi = asNum(fiiDii?.fii?.indexOptions?.short, 0);
  const total = longOi + shortOi;
  
  if (total === 0) return { passed: true, label: "FII Neutral", detail: "FII Index Flow Neutral", tone: "neutral", bias: 0 };
  
  const ratio = longOi / total;
  
  if (ratio > 0.55) {
      const isTrap = side === "PE";
      return { passed: !isTrap, label: `FIIs Buying Calls (${(ratio*100).toFixed(0)}%)`, detail: isTrap ? "TRAP: Trend is Bearish but FIIs are Long" : "FIIs are heavily buying Calls", tone: isTrap ? "error" : "success", bias: 1 };
  }
  
  if (ratio < 0.45) {
      const isTrap = side === "CE";
      return { passed: !isTrap, label: `FIIs Shorting (${((1-ratio)*100).toFixed(0)}%)`, detail: isTrap ? "TRAP: Trend is Bullish but FIIs are Shorting" : "FIIs are heavily Shorting", tone: isTrap ? "error" : "success", bias: -1 };
  }
  
  return { passed: true, label: "FII Mixed", detail: "FII Index Flow Mixed", tone: "neutral", bias: 0 };
}

function getEventBlocker() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  const h = ist.getHours();
  const m = ist.getMinutes();
  
  // 2:30 PM Volatility / Expiry
  if (h === 14 && m >= 30 && m <= 45) {
    return { blocked: true, label: "2:30 Volatility Block", detail: "2:30 PM Expiry Volatility Risk. Wait 15m.", tone: "error" };
  }
  
  return { blocked: false, label: "No Event Risk", tone: "success" };
}

function buildBuyerSetup(detail, vix = {}, mode = "INTRADAY", timeframeHistory = {}, optionHistoryRows = [], foBreadth = {}, sectors = [], fiiDii = {}) {
  const analytics = detail?.analytics || {};
  const signal = stabilizeBuyerSignal(deriveBuyerSignal(detail), detail, foBreadth);
  const spot = detail?.spot || {};
  const future = detail?.future || {};
  const chain = detail?.optionChain || [];
  const underlyingPrice = asNum(spot?.ltp || future?.ltp);
  const strikeStep = getStrikeStep(chain);
  const option = selectTradableOption(chain, underlyingPrice, signal?.bias, mode);
  const displayOption = option || selectDisplayOption(chain, underlyingPrice, signal?.bias);
  const activeOption = option || displayOption;
  const plan = buildOptionBuyerPlan(signal, activeOption, underlyingPrice, mode);
  const quality = evaluateTrade(activeOption, signal, mode);
  const decay = getDecayState();
  const confidence = asNum(signal?.confidence, 0);
  const rr = asNum(plan?.riskReward, 0);
  const vixPct = asNum(vix?.change_pct, 0);
  const pcr = asNum(analytics?.pcr, null);
  const premiumQuality = getPremiumQuality(activeOption, underlyingPrice, mode, strikeStep);
  const momentum = getMomentumState(spot, future, activeOption?.side);
  const vwapState = getVwapState(spot, future, activeOption?.side);
  const volumeQuality = getVolumeQuality(activeOption, chain);
  const trap = getTrapStatus(activeOption, underlyingPrice, analytics, mode);
  const greekQuality = getGreekQuality(activeOption, mode);
  const fiveMinuteHistory = getTimeframeHistoryBlock(timeframeHistory, "5");
  const fifteenMinuteHistory = getTimeframeHistoryBlock(timeframeHistory, "15");
  const fiveMinuteCandles = normalizeHistoryCandles(fiveMinuteHistory);
  const trapDetector = getLiquiditySweepTrap(fiveMinuteCandles, activeOption?.side, analytics, spot);
  const volumeAbsorption = getVolumeAbsorptionTrap(fiveMinuteCandles, activeOption?.side);
  const hourlyHistory = getTimeframeHistoryBlock(timeframeHistory, "60");
  const dailyHistory = getTimeframeHistoryBlock(timeframeHistory, "D");
  const timeframeFreshness = {
    five: getHistoryFreshness(fiveMinuteHistory, "5"),
    fifteen: getHistoryFreshness(fifteenMinuteHistory, "15"),
    hourly: getHistoryFreshness(hourlyHistory, "60"),
    daily: getHistoryFreshness(dailyHistory, "D"),
  };
  const timeframe = getFiveMinuteConfirmation(fiveMinuteHistory, activeOption?.side, signal, underlyingPrice);
  const fifteenTrend = getEmaTrendConfirmation(fifteenMinuteHistory, activeOption?.side, "15m");
  const hourlyTrend = getEmaTrendConfirmation(hourlyHistory, activeOption?.side, "60m");
  const dailyTrend = getEmaTrendConfirmation(dailyHistory, activeOption?.side, "Daily");
  const gapCheck = getGapFirst15Check(fiveMinuteHistory, activeOption?.side);
  const volumeBreakout = getVolumeBreakoutQuality(fiveMinuteHistory, activeOption?.side);
  const spreadCheck = getBidAskSpreadCheck(activeOption);
  const expiryCheck = getExpiryDayCheck(detail);
  const heavyweightCheck = getHeavyweightConfirmation(detail?.symbol, activeOption?.side, sectors);
  const premiumMomentum = getPremiumMomentumQuality(optionHistoryRows, activeOption);
  const sessionQuality = getMarketSessionQuality();
  const foActivity = getFoActivityGate(foBreadth, activeOption?.side);
  const cardLevels = getCardLevels(detail, {});
  const trendEngine = getTrendEngineConfirmation({
    detail,
    analytics,
    side: activeOption?.side,
    timeframeHistory,
    price: underlyingPrice,
  });
  const trigger = getTriggerStatus(activeOption, plan, underlyingPrice, signal, { momentum, volumeQuality, premiumQuality });
  const oiTotals = chain.reduce((acc, row) => {
    acc.callOi += asNum(row?.ce_oi, 0);
    acc.putOi += asNum(row?.pe_oi, 0);
    acc.callOiChange += asNum(row?.ce_oich, 0);
    acc.putOiChange += asNum(row?.pe_oich, 0);
    return acc;
  }, { callOi: 0, putOi: 0, callOiChange: 0, putOiChange: 0 });
  const oiPcr = getOiPcrConfirmation({ side: activeOption?.side, pcr, oiTotals });
  const priceOverrideFinal = getPriceOverrideSignal({
    side: activeOption?.side,
    price: underlyingPrice,
    vwapState,
    analytics,
    levels: cardLevels,
    foActivity,
    oiPcr,
  });
  const smartMoney = getSmartMoneyTraction(chain, analytics, activeOption?.side, underlyingPrice);
  const vixCheck = getVixProfessionalCheck(vix);
  
  const ivRankQuality = getIvRankQuality(analytics);
  const maxPainShift = getMaxPainShift(analytics);
  const fiiFlow = getFiiFlowBias(fiiDii, activeOption?.side);
  const eventBlocker = getEventBlocker();
  
  if (eventBlocker.blocked) {
    trigger.ready = false;
    trigger.invalidated = true;
    trigger.reason = eventBlocker.label;
  }
  
  const professionalGate = buildProfessionalTradeGate({
    setupSide: activeOption?.side,
    signal,
    vwapState,
    volumeBreakout,
    oiPcr,
    vixCheck,
    premiumQuality,
    plan,
    timeframe,
    fifteenTrend,
    dailyTrend,
    hourlyTrend,
    gapCheck,
    spreadCheck,
    expiryCheck,
    heavyweightCheck,
    trendEngine,
    dataFreshness: timeframeFreshness,
    premiumMomentum,
    trigger,
    sessionQuality,
  });
  const noTradeGate = getNoTradeGate({ option, plan, signal, quality, premiumQuality, momentum, trap, trigger, decay, greekQuality, timeframe, premiumMomentum, sessionQuality, foActivity, professionalGate, mode });
  const noTradeReason = noTradeGate.reason || getNoTradeReason({ option, plan, signal, quality, premiumQuality, momentum, trap, trigger, decay, greekQuality, timeframe, premiumMomentum, sessionQuality, foActivity, professionalGate, mode });

  const warnings = [];
  if (!option && displayOption) warnings.push("Nearest strike only; wait for clean trigger");
  if (!displayOption) warnings.push("No option-chain strike available");
  if (!String(signal?.bias || "").match(/bull|bear/i)) warnings.push("No directional bias");
  if (signal?.stabilityBlocked) warnings.push(signal.stabilityReason);
  if (confidence < getBuyerModeRules(mode).minConfidence && signal?.source !== "option_chain_fallback") warnings.push(`Confidence below ${getBuyerModeRules(mode).minConfidence}%`);
  if (rr > 0 && rr < getBuyerModeRules(mode).minRiskReward) warnings.push("Reward/risk is weak");
  if (decay.tone !== "success") warnings.push(decay.note);
  if (premiumQuality.tone === "error") warnings.push(premiumQuality.reason);
  if (greekQuality.tone === "error") warnings.push(greekQuality.reason);
  if (timeframe.tone !== "success") warnings.push(timeframe.reason);
  if (hourlyTrend.tone === "error") warnings.push(hourlyTrend.reason);
  if (gapCheck.tone !== "success") warnings.push(gapCheck.reason);
  if (spreadCheck.tone === "error") warnings.push(spreadCheck.reason);
  if (expiryCheck.tone === "error") warnings.push(expiryCheck.reason);
  if (heavyweightCheck.tone === "warning" && heavyweightCheck.passed === false) warnings.push(heavyweightCheck.reason);
  if (trendEngine.tone === "error") warnings.push(trendEngine.reason);
  if (premiumMomentum.tone !== "success") warnings.push(premiumMomentum.reason);
  if (foActivity.tone !== "success") warnings.push(foActivity.reason);
  if (!professionalGate.passed) warnings.push(professionalGate.reason);
  if (sessionQuality.tone !== "success") warnings.push(sessionQuality.reason);
  if (momentum.tone === "error" || momentum.label === "Slow") warnings.push(momentum.reason);
  if (vwapState.tone === "warning" && activeOption) warnings.push(vwapState.reason);
  if (smartMoney?.passed === false) warnings.push(smartMoney.detail);
  if (ivRankQuality.passed === false) warnings.push(ivRankQuality.detail);
  if (fiiFlow.passed === false && ((fiiFlow.bias === -1 && activeOption?.side === "CE") || (fiiFlow.bias === 1 && activeOption?.side === "PE"))) warnings.push(fiiFlow.detail);
  if (maxPainShift.direction === -1 && activeOption?.side === "CE") warnings.push("Max Pain shifting DOWN while buying Call");
  if (maxPainShift.direction === 1 && activeOption?.side === "PE") warnings.push("Max Pain shifting UP while buying Put");
  if (eventBlocker.blocked) warnings.push(eventBlocker.detail);
  if (volumeQuality.label === "Low Vol") warnings.push(volumeQuality.reason);
  if (trap.label === "Near S/R") warnings.push(trap.reason);
  if (trigger.invalidated || (trigger.ready === false && !trigger.targetCrossed)) warnings.push(trigger.reason);
  if (trigger.targetCrossed && !trigger.continuation) warnings.push(trigger.reason);
  if (vixPct < -4) warnings.push("VIX falling fast; premium expansion may be limited");

  let score = quality.score;
  score += confidence >= 70 ? 8 : confidence >= getBuyerModeRules(mode).minConfidence ? 4 : -8;
  score += rr >= 1.5 ? 8 : rr >= getBuyerModeRules(mode).minRiskReward ? 4 : rr > 0 ? -8 : -12;
  score += premiumQuality.tone === "success" ? 5 : premiumQuality.tone === "warning" ? -4 : -12;
  score += greekQuality.tone === "success" ? 5 : greekQuality.tone === "warning" ? -4 : -14;
  score += timeframe.passed ? 8 : timeframe.tone === "warning" ? -6 : -16;
  score += hourlyTrend.passed ? 5 : hourlyTrend.tone === "warning" ? -2 : -8;
  score += gapCheck.passed ? 4 : gapCheck.tone === "warning" ? -2 : -8;
  score += spreadCheck.tone === "success" ? 4 : spreadCheck.tone === "error" ? -10 : 0;
  score += expiryCheck.tone === "success" ? 3 : expiryCheck.tone === "error" ? -14 : -2;
  score += heavyweightCheck.tone === "success" ? 4 : heavyweightCheck.passed === false ? -6 : 0;
  score += asNum(trendEngine.scoreImpact, 0);
  score += premiumMomentum.passed ? 8 : premiumMomentum.tone === "warning" ? -6 : -16;
  score += asNum(foActivity.scoreImpact, foActivity.passed ? 6 : -8);
  score += professionalGate.passed ? 10 : professionalGate.score >= 5 ? -5 : -18;
  score += sessionQuality.tone === "success" ? 4 : sessionQuality.tone === "warning" ? -3 : -15;
  score += momentum.aligned ? 5 : -8;
  score += vwapState.aligned ? 4 : activeOption ? -4 : 0;
  score += volumeQuality.tone === "success" ? 4 : volumeQuality.label === "Low Vol" ? -5 : 0;
  score += trap.tone === "success" ? 4 : -6;
  score += trigger.ready ? 6 : trigger.invalidated ? -25 : -6;
  score += vixPct >= 0 ? 3 : vixPct < -4 ? -6 : -2;
  score += ivRankQuality.scoreImpact;
  score += ((maxPainShift.direction === 1 && activeOption?.side === "CE") || (maxPainShift.direction === -1 && activeOption?.side === "PE")) ? 5 : maxPainShift.direction !== 0 ? -5 : 0;
  score += eventBlocker.blocked ? -30 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  const action = trigger.continuation ? "Trail beyond target" : trigger.targetCrossed ? "Book / Recheck" : trigger.invalidated ? "Setup Invalid" : priceOverrideFinal.active && noTradeGate.blocked ? priceOverrideFinal.label : noTradeGate.blocked ? `No Trade: ${noTradeGate.label}` : priceOverrideFinal.active ? priceOverrideFinal.label : !option && displayOption ? "Watch nearest strike" : warnings.length ? "Wait / Trigger only" : signal?.action || "Wait";
  const tone = trigger.invalidated || !displayOption ? "error" : priceOverrideFinal.active ? "warning" : noTradeGate.tone === "error" || score < 45 ? "error" : score >= 70 && !noTradeGate.blocked ? "success" : "warning";

  return {
    symbol: detail?.symbol,
    label: detail?.label || INDEX_LABELS[detail?.symbol] || detail?.symbol,
    action,
    tone,
    score,
    signal,
    option,
    displayOption,
    plan,
    quality,
    decay,
    premiumQuality,
    greekQuality,
    timeframe,
    fifteenTrend,
    dailyTrend,
    hourlyTrend,
    gapCheck,
    spreadCheck,
    expiryCheck,
    heavyweightCheck,
    trendEngine,
    timeframeFreshness,
    volumeBreakout,
    oiPcr,
    smartMoney,
    priceOverride: priceOverrideFinal,
    ivRankQuality,
    maxPainShift,
    fiiFlow,
    trapDetector,
    volumeAbsorption,
    eventBlocker,
    vixCheck,
    professionalGate,
    premiumMomentum,
    foActivity,
    sessionQuality,
    noTradeGate,
    momentum,
    vwapState,
    volumeQuality,
    trap,
    trigger,
    noTradeReason,
    warnings,
    analytics,
    oiTotals,
    optionChain: chain,
    spotQuote: spot,
    futureQuote: future,
    pcr,
    maxPain: analytics?.maxPain,
    straddle: analytics?.straddle,
    spot: underlyingPrice,
  };
}

function pickBestBuyerSetup(setups = []) {
  return [...setups]
    .filter((setup) => setup?.option && setup?.plan && !setup?.trigger?.invalidated)
    .sort((a, b) => b.score - a.score || asNum(b?.plan?.riskReward, 0) - asNum(a?.plan?.riskReward, 0))[0] || null;
}

function uniqueNumbers(values = []) {
  const seen = new Set();
  return values
    .filter(isNum)
    .map(Number)
    .filter((value) => {
      const key = String(Math.round(value * 100) / 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getCardLevels(card = {}, strip = {}) {
  const analytics = card?.analytics || {};
  const spot = asNum(strip?.ltp ?? card?.spot?.ltp ?? card?.future?.ltp, null);
  const previous = analytics?.previousDayLevels || {};
  const supports = uniqueNumbers([
    ...(analytics?.supports || []),
    analytics?.putWall,
    previous?.s1,
    previous?.s2,
    previous?.low,
  ])
    .filter((value) => !isNum(spot) || value <= spot)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const resistances = uniqueNumbers([
    ...(analytics?.resistances || []),
    analytics?.callWall,
    previous?.r1,
    previous?.r2,
    previous?.high,
  ])
    .filter((value) => !isNum(spot) || value >= spot)
    .sort((a, b) => a - b)
    .slice(0, 3);

  return { supports, resistances };
}

function getStripForSymbol(stripByLabel = {}, symbol) {
  return (STRIP_LABEL_ALIASES[symbol] || [INDEX_LABELS[symbol], symbol])
    .map((label) => stripByLabel[String(label || "").toUpperCase()])
    .find(Boolean) || {};
}

function stripLabelToIndexSymbol(label = "") {
  const key = String(label || "").toUpperCase();
  return INDEXES.find((symbol) => (STRIP_LABEL_ALIASES[symbol] || []).some((alias) => String(alias).toUpperCase() === key)) || null;
}

function getStripSortIndex(label = "") {
  const key = String(label || "").toUpperCase();
  if (key.includes("NIFTY 50") || key === "NIFTY") return 1;
  if (key.includes("BANK")) return 2;
  if (key.includes("SENSEX")) return 3;
  if (key.includes("SMALLCAP")) return 4;
  if (key.includes("FIN")) return 5;
  if (key.includes("MIDCAP")) return 6;
  return 99;
}

function normalizeLiveTick(tick = {}, previous = {}) {
  if (!isNum(tick?.ltp)) return previous || {};
  const vwap = tick.vwap ?? tick.atp ?? tick.avg_trade_price ?? tick.avgTradePrice ?? tick.average_trade_price ?? tick.averageTradePrice;
  return {
    ...(previous || {}),
    ltp: Number(tick.ltp),
    change: isNum(tick.change) ? Number(tick.change) : previous?.change,
    change_pct: isNum(tick.change_pct) ? Number(tick.change_pct) : previous?.change_pct,
    volume: isNum(tick.volume) ? Number(tick.volume) : previous?.volume,
    vwap: isNum(vwap) ? Number(vwap) : previous?.vwap,
    updated_at: tick.timestamp || tick.updated_at || previous?.updated_at,
    ts: tick.ts || previous?.ts,
    source: "fyers_ws",
  };
}

function applyTickToQuote(quote = {}, tick = {}) {
  if (!isNum(tick?.ltp)) return quote || {};
  const vwap = tick.vwap ?? tick.atp ?? tick.avg_trade_price ?? tick.avgTradePrice ?? tick.average_trade_price ?? tick.averageTradePrice;
  return {
    ...(quote || {}),
    ltp: tick.ltp,
    change: isNum(tick.change) ? tick.change : quote?.change,
    change_pct: isNum(tick.change_pct) ? tick.change_pct : quote?.change_pct,
    volume: isNum(tick.volume) ? tick.volume : quote?.volume,
    vwap: isNum(vwap) ? vwap : quote?.vwap,
    updated_at: tick.updated_at || quote?.updated_at,
    source: "fyers_ws",
  };
}

function applyLiveTicksToMarketStrip(items = [], liveTickMap = {}) {
  if (!Array.isArray(items)) return items || [];
  return items.map((item) => {
    const labelKey = String(item?.label || item?.symbol || "").toUpperCase();
    const symbol = stripLabelToIndexSymbol(item?.label || item?.symbol);
    const tick = (symbol ? liveTickMap?.[symbol] : null) || liveTickMap?.[labelKey];
    return tick ? applyTickToQuote(item, tick) : item;
  });
}

function applyLiveTicksToIndexCards(cards = {}, liveTickMap = {}) {
  const next = { ...(cards || {}) };
  INDEXES.forEach((symbol) => {
    const tick = liveTickMap?.[symbol];
    if (!tick || !isNum(tick.ltp) || !next?.[symbol]) return;
    const card = next[symbol] || {};
    next[symbol] = {
      ...card,
      spot: applyTickToQuote(card.spot || {}, tick),
      has_data: true,
      liveFeed: "fyers_ws",
    };
  });
  return next;
}

function mergeImpliedStripValues(items = [], setups = []) {
  const setupMap = setups.reduce((acc, setup) => {
    if (setup?.symbol) acc[setup.symbol] = setup;
    return acc;
  }, {});

  return (items || []).map((item) => {
    if (hasQuoteValue(item)) return item;
    const symbol = stripLabelToIndexSymbol(item?.label);
    const setup = symbol ? setupMap[symbol] : null;
    if (!setup || !isNum(setup?.spot)) return item;
    return {
      ...item,
      ltp: setup.spot,
      change: null,
      change_pct: null,
      source: "option_chain_implied",
    };
  });
}

function getSetupCommand(setup, fallbackBias = "Neutral") {
  const bias = setup?.signal?.bias || fallbackBias || "Neutral";
  const side = setup?.option?.side;
  if (setup?.option && side) return side === "PE" ? "Buy PE" : "Buy CE";
  if (String(bias).toLowerCase().includes("bear")) return "PE watch";
  if (String(bias).toLowerCase().includes("bull")) return "CE watch";
  return "Wait";
}

function loadPcrHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PCR_HISTORY_KEY) || "{}") || {};
    const cleaned = cleanPcrHistory(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(cleaned)) {
      persistLocalJson(PCR_HISTORY_KEY, cleaned);
    }
    return cleaned;
  } catch {
    return {};
  }
}

function cleanPcrHistory(history = {}) {
  const next = {};
  INDEXES.forEach((symbol) => {
    PCR_TABLE_INTERVALS.forEach((interval) => {
      const key = getPcrHistoryKey(symbol, interval);
      const primaryRows = Array.isArray(history?.[key]) ? history[key] : [];
      const legacyRows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
      const sourceRows = primaryRows.length ? primaryRows : legacyRows;
      const rows = bucketPcrRows(sourceRows, interval).slice(-80);
      if (!rows.length) return;
      next[key] = rows;
      if (interval === 5) next[symbol] = rows;
    });
  });
  return next;
}

function loadOptionSignalHistory() {
  try {
    return trimObjectHistory(JSON.parse(localStorage.getItem(OPTION_SIGNAL_HISTORY_KEY) || "{}") || {}, OPTION_SIGNAL_HISTORY_LIMIT);
  } catch {
    return {};
  }
}

function loadSignalJournal() {
  try {
    const rows = JSON.parse(localStorage.getItem(SIGNAL_JOURNAL_KEY) || "[]") || [];
    return mergeArrayHistory([], rows, SIGNAL_JOURNAL_LIMIT, signalJournalKey);
  } catch {
    return [];
  }
}

function trimObjectHistory(history = {}, limit = OPTION_SIGNAL_HISTORY_LIMIT) {
  const next = {};
  Object.entries(history || {}).forEach(([key, rows]) => {
    if (!Array.isArray(rows)) return;
    next[key] = rows.slice(-limit);
  });
  return next;
}

function persistLocalJson(key, value, fallbackValue = null) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`localStorage write failed for ${key}`, err);
    try {
      if (fallbackValue !== null) {
        localStorage.setItem(key, JSON.stringify(fallbackValue));
        return true;
      }
      localStorage.removeItem(key);
    } catch (fallbackErr) {
      console.warn(`localStorage fallback failed for ${key}`, fallbackErr);
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore storage cleanup failures.
      }
    }
    return false;
  }
}

function loadGateHistory() {
  try {
    return JSON.parse(localStorage.getItem(GATE_HISTORY_KEY) || "[]") || [];
  } catch {
    return [];
  }
}

function makeSignalJournalRow(setup = {}, strip = {}) {
  const option = setup?.option || setup?.displayOption || {};
  if (!setup?.symbol || !option?.side || !isNum(option?.strike)) return null;
  return {
    ts: Date.now(),
    time: new Date().toISOString(),
    symbol: setup.symbol,
    label: setup.label,
    spot: isNum(strip?.ltp) ? Number(strip.ltp) : isNum(setup.spot) ? Number(setup.spot) : null,
    spotChange: isNum(strip?.change) ? Number(strip.change) : null,
    spotChangePct: isNum(strip?.change_pct) ? Number(strip.change_pct) : null,
    bias: setup?.signal?.bias || "",
    action: setup.action || "",
    readiness: setup?.trigger?.label || "",
    targetCrossed: Boolean(setup?.trigger?.targetCrossed),
    continuation: Boolean(setup?.trigger?.continuation),
    reason: setup?.trigger?.reason || setup.noTradeReason || "",
    score: isNum(setup.score) ? Number(setup.score) : null,
    side: option.side,
    strike: Number(option.strike),
    moneyness: option.moneyness || "",
    premium: isNum(option.premium) ? Number(option.premium) : null,
    entry: isNum(setup?.plan?.entry) ? Number(setup.plan.entry) : null,
    target: isNum(setup?.plan?.target) ? Number(setup.plan.target) : null,
    stoploss: isNum(setup?.plan?.stoploss) ? Number(setup.plan.stoploss) : null,
    riskReward: isNum(setup?.plan?.riskReward) ? Number(setup.plan.riskReward) : null,
    indexTrigger: isNum(setup?.plan?.indexTrigger) ? Number(setup.plan.indexTrigger) : null,
    indexTarget: isNum(setup?.plan?.indexTarget) ? Number(setup.plan.indexTarget) : null,
    indexStop: isNum(setup?.plan?.indexStop) ? Number(setup.plan.indexStop) : null,
    pcr: isNum(setup.pcr) ? Number(setup.pcr) : null,
    oi: isNum(option.oi) ? Number(option.oi) : null,
    oiChange: isNum(option.oiChange) ? Number(option.oiChange) : null,
    iv: isNum(option.iv) ? Number(option.iv) : null,
    volume: isNum(option.volume) ? Number(option.volume) : null,
    delta: isNum(option.delta) ? Number(option.delta) : null,
    gamma: isNum(option.gamma) ? Number(option.gamma) : null,
    theta: isNum(option.theta) ? Number(option.theta) : null,
    vega: isNum(option.vega) ? Number(option.vega) : null,
    fiveMinute: setup?.timeframe?.label || "",
    greekQuality: setup?.greekQuality?.label || "",
    premiumMomentum: setup?.premiumMomentum?.label || "",
    session: setup?.sessionQuality?.label || "",
    blocker: setup?.noTradeGate?.blocked ? setup.noTradeGate.label : "",
    momentum: setup?.momentum?.label || "",
    liquidity: setup?.volumeQuality?.label || "",
    premiumQuality: setup?.premiumQuality?.label || "",
    professionalDecision: setup?.professionalGate?.decision || "",
    professionalScore: isNum(setup?.professionalGate?.score) ? Number(setup.professionalGate.score) : null,
    professionalTotal: isNum(setup?.professionalGate?.total) ? Number(setup.professionalGate.total) : null,
    professionalReason: setup?.professionalGate?.reason || "",
    professionalFreshness: setup?.professionalGate?.freshness?.compact || "",
  };
}

function makeProfessionalGateHistoryRow(setup = {}, strip = {}) {
  const gate = setup?.professionalGate || {};
  if (!setup?.symbol || !gate?.decision) return null;
  const option = setup?.option || setup?.displayOption || {};
  return {
    ts: Date.now(),
    time: new Date().toISOString(),
    symbol: setup.symbol,
    label: setup.label,
    spot: isNum(strip?.ltp) ? Number(strip.ltp) : isNum(setup.spot) ? Number(setup.spot) : null,
    side: option?.side || "",
    strike: isNum(option?.strike) ? Number(option.strike) : null,
    decision: gate.decision,
    score: isNum(gate.score) ? Number(gate.score) : null,
    total: isNum(gate.total) ? Number(gate.total) : null,
    setupScore: isNum(gate.setupScore) ? Number(gate.setupScore) : null,
    setupTotal: isNum(gate.setupTotal) ? Number(gate.setupTotal) : null,
    entryScore: isNum(gate.entryScore) ? Number(gate.entryScore) : null,
    entryTotal: isNum(gate.entryTotal) ? Number(gate.entryTotal) : null,
    tone: gate.tone || "",
    reason: gate.reason || "",
    actionReason: gate.actionReason || gate.reason || "",
    freshness: gate.freshness?.compact || "",
    blockers: Array.isArray(gate.hardBlocks) ? gate.hardBlocks.slice(0, 5) : [],
    pcr: isNum(setup.pcr) ? Number(setup.pcr) : null,
    vwap: setup?.vwapState?.label || "",
    timeframe: setup?.timeframe?.label || "",
    fifteenTrend: setup?.fifteenTrend?.label || "",
    dailyTrend: setup?.dailyTrend?.label || "",
    volume: setup?.volumeBreakout?.label || "",
  };
}

function shouldRecordSignal(setup = {}) {
  const activeOption = setup?.option || setup?.displayOption;
  if (!setup?.symbol || !activeOption || !setup?.plan) return false;
  if (setup?.trigger?.invalidated) return false;
  const score = asNum(setup?.score, 0);
  const triggerActive = setup?.trigger?.ready || setup?.trigger?.targetCrossed || setup?.trigger?.continuation;
  const hasGateRead = Boolean(setup?.professionalGate?.decision);
  const hasPlanLevels = isNum(setup?.plan?.entry) || isNum(setup?.plan?.indexTrigger);
  return Boolean(hasPlanLevels && (triggerActive || hasGateRead || score >= 20));
}

function signalJournalKey(row = {}) {
  return signalIdentityKey(row);
}

function signalIdentityKey(row = {}) {
  return [
    getSessionStartTs(row.ts || Date.now()),
    row.symbol || "",
    row.side || "",
    isNum(row.strike) ? Number(row.strike) : "",
  ].join("|");
}

function stableSignalLevel(value) {
  return isNum(value) ? Number(Number(value).toFixed(2)) : "";
}

function professionalGateHistoryKey(row = {}) {
  return [
    row.symbol,
    row.side || "NA",
    isNum(row.strike) ? Number(row.strike) : "NA",
    row.decision || "NA",
    row.reason || row.actionReason || "",
  ].join("|");
}

function rowUniqueKey(row = {}, fallbackPrefix = "row") {
  return [
    fallbackPrefix,
    row.symbol || row.label || "",
    row.side || "",
    isNum(row.strike) ? Number(row.strike) : "",
    row.decision || row.readiness || row.time || "",
    row.ts || row.bucketTs || "",
  ].join("|");
}

function mergeArrayHistory(localRows = [], remoteRows = [], limit = 1500, keyFn = rowUniqueKey) {
  const map = new Map();
  [...(remoteRows || []), ...(localRows || [])].forEach((row) => {
    if (!row || typeof row !== "object") return;
    map.set(keyFn(row), row);
  });
  return [...map.values()]
    .sort((a, b) => Number(a?.ts || a?.bucketTs || 0) - Number(b?.ts || b?.bucketTs || 0))
    .slice(-limit);
}

function mergeObjectHistory(localHistory = {}, remoteHistory = {}, limit = 120) {
  const keys = new Set([...Object.keys(remoteHistory || {}), ...Object.keys(localHistory || {})]);
  const next = {};
  keys.forEach((key) => {
    const localRows = Array.isArray(localHistory?.[key]) ? localHistory[key] : [];
    const remoteRows = Array.isArray(remoteHistory?.[key]) ? remoteHistory[key] : [];
    const rows = mergeArrayHistory(localRows, remoteRows, limit, (row) => `${row?.bucketTs || row?.ts || ""}|${row?.strike || ""}|${row?.side || ""}`);
    if (rows.length) next[key] = rows;
  });
  return next;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatReportTime(value) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReportDate(value) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatShortTime(value) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatSignalAge(ts) {
  const start = Number(ts || 0);
  if (!start) return "-";
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function getSessionStartTs(now = Date.now()) {
  const date = new Date(now);
  date.setHours(9, 15, 0, 0);
  return date.getTime();
}

function getCurrentSignalMeta(signalJournal = [], setup = {}) {
  const option = setup?.option || setup?.displayOption || {};
  if (!setup?.symbol || !option?.side || !isNum(option?.strike)) return null;
  const sessionStart = getSessionStartTs();
  const rows = (Array.isArray(signalJournal) ? signalJournal : [])
    .filter((row) =>
      row?.symbol === setup.symbol &&
      row?.side === option.side &&
      Number(row?.strike) === Number(option.strike) &&
      Number(row?.ts || 0) >= sessionStart
    )
    .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
  if (!rows.length) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstTs = Number(first.firstTs || first.ts || 0);
  const lastTs = Number(last.lastTs || last.ts || 0);
  return {
    count: rows.length,
    firstTs,
    lastTs,
    firstTime: formatShortTime(firstTs || first.firstTime || first.time),
    lastTime: formatShortTime(lastTs || last.lastTime || last.time),
    age: formatSignalAge(firstTs || first.firstTime || first.time),
    latest: last,
  };
}

function getSignalRuntimeMeta(signalJournal = [], setup = {}) {
  const active = getCurrentSignalMeta(signalJournal, setup);
  if (active) return active;
  return {
    count: 0,
    firstTime: "-",
    lastTime: "-",
    age: "-",
  };
}

function isActionableSignal(row = {}) {
  return Boolean(row.side && row.strike);
}

function getSignalOutcome(row = {}, allRows = []) {
  const side = String(row.side || "").toUpperCase();
  const future = allRows
    .filter((item) => item?.symbol === row.symbol && Number(item?.ts || 0) > Number(row?.ts || 0))
    .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));

  if (row.targetCrossed || row.continuation) {
    return {
      status: row.continuation ? "Trail After Target" : "Target Hit",
      targetHit: true,
      stoplossHit: false,
      falseSignal: false,
      at: row.time,
      price: row.spot,
      note: row.reason || "Target crossed",
    };
  }

  const hasIndexLevels = isNum(row.indexTarget) && isNum(row.indexStop);
  const hasPremiumLevels = isNum(row.target) && isNum(row.stoploss);
  if (!hasIndexLevels && !hasPremiumLevels) {
    return {
      status: "Not Testable",
      targetHit: false,
      stoplossHit: false,
      falseSignal: false,
      at: "",
      price: "",
      note: "Missing target/SL levels",
    };
  }

  for (const item of future) {
    const spot = asNum(item.spot, null);
    const premium = item.side === row.side && Number(item.strike) === Number(row.strike) ? asNum(item.premium, null) : null;
    const indexTargetHit = hasIndexLevels && isNum(spot) && (
      side === "CE" ? spot >= Number(row.indexTarget) : spot <= Number(row.indexTarget)
    );
    const indexStopHit = hasIndexLevels && isNum(spot) && (
      side === "CE" ? spot <= Number(row.indexStop) : spot >= Number(row.indexStop)
    );
    const premiumTargetHit = !hasIndexLevels && hasPremiumLevels && isNum(premium) && premium >= Number(row.target);
    const premiumStopHit = !hasIndexLevels && hasPremiumLevels && isNum(premium) && premium <= Number(row.stoploss);

    if (indexTargetHit || premiumTargetHit) {
      return {
        status: "Target Hit",
        targetHit: true,
        stoplossHit: false,
        falseSignal: false,
        at: item.time,
        price: isNum(spot) ? spot : premium,
        note: hasIndexLevels ? `Index target ${formatPrice(row.indexTarget)}` : `Premium target ${formatPremium(row.target)}`,
      };
    }
    if (indexStopHit || premiumStopHit) {
      return {
        status: "Stoploss Hit",
        targetHit: false,
        stoplossHit: true,
        falseSignal: true,
        at: item.time,
        price: isNum(spot) ? spot : premium,
        note: hasIndexLevels ? `Index SL ${formatPrice(row.indexStop)}` : `Premium SL ${formatPremium(row.stoploss)}`,
      };
    }
  }

  return {
    status: "Open",
    targetHit: false,
    stoplossHit: false,
    falseSignal: false,
    at: "",
    price: "",
    note: "No target/SL hit recorded yet",
  };
}

function findNearestGateRow(row = {}, gateRows = []) {
  const rowTs = Number(row?.ts || 0);
  if (!rowTs || !Array.isArray(gateRows)) return null;
  return gateRows
    .filter((gate) =>
      gate?.symbol === row.symbol &&
      (!gate?.side || !row?.side || gate.side === row.side) &&
      (!isNum(gate?.strike) || !isNum(row?.strike) || Number(gate.strike) === Number(row.strike)) &&
      Math.abs(Number(gate?.ts || 0) - rowTs) <= 10 * 60 * 1000
    )
    .sort((a, b) => Math.abs(Number(a.ts || 0) - rowTs) - Math.abs(Number(b.ts || 0) - rowTs))[0] || null;
}

function attachGateToSignal(row = {}, gateRows = []) {
  const gate = findNearestGateRow(row, gateRows) || {};
  return {
    ...row,
    professionalDecision: row.professionalDecision || gate.decision || "Unknown",
    professionalScore: isNum(row.professionalScore) ? Number(row.professionalScore) : isNum(gate.score) ? Number(gate.score) : null,
    professionalTotal: isNum(row.professionalTotal) ? Number(row.professionalTotal) : isNum(gate.total) ? Number(gate.total) : null,
    professionalReason: row.professionalReason || gate.reason || "",
    professionalFreshness: row.professionalFreshness || gate.freshness || "",
  };
}

function summarizeOutcomeGroup(label, subset = {}) {
  const rows = Array.isArray(subset) ? subset : [];
  const targetHit = rows.filter((row) => row.outcome?.targetHit).length;
  const stoplossHit = rows.filter((row) => row.outcome?.stoplossHit).length;
  const closedCount = targetHit + stoplossHit;
  return {
    label,
    total: rows.length,
    targetHit,
    stoplossHit,
    falseSignal: stoplossHit,
    open: rows.filter((row) => row.outcome?.status === "Open").length,
    notTestable: rows.filter((row) => row.outcome?.status === "Not Testable").length,
    successRate: closedCount ? (targetHit / closedCount) * 100 : 0,
  };
}

function buildSignalAnalyticsReport(rows = [], gateRows = []) {
  const sorted = [...(rows || [])].filter(Boolean).sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
  const sortedGateRows = [...(gateRows || [])].filter(Boolean).sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
  const deduped = [];
  const seen = new Set();

  sorted.forEach((row) => {
    if (!isActionableSignal(row)) return;
    const key = [
      getSessionStartTs(row.ts || row.time || Date.now()),
      row.symbol,
      row.side,
      row.strike,
      row.entry,
      row.target,
      row.stoploss,
      row.indexTarget,
      row.indexStop,
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(attachGateToSignal(row, gateRows));
  });

  const signals = deduped.map((row) => ({ ...row, outcome: getSignalOutcome(row, sorted) }));
  const summary = signals.reduce((acc, row) => {
    acc.total += 1;
    if (row.outcome.targetHit) acc.targetHit += 1;
    if (row.outcome.stoplossHit) acc.stoplossHit += 1;
    if (row.outcome.falseSignal) acc.falseSignal += 1;
    if (row.outcome.status === "Open") acc.open += 1;
    if (row.outcome.status === "Not Testable") acc.notTestable += 1;
    if (row.continuation) acc.continuation += 1;
    return acc;
  }, { total: 0, targetHit: 0, stoplossHit: 0, falseSignal: 0, open: 0, notTestable: 0, continuation: 0 });
  const closed = summary.targetHit + summary.stoplossHit;
  summary.successRate = closed ? (summary.targetHit / closed) * 100 : 0;

  const bySymbol = INDEXES.map((symbol) => ({
    ...summarizeOutcomeGroup(INDEX_LABELS[symbol] || symbol, signals.filter((row) => row.symbol === symbol)),
    symbol,
  }));

  const bySide = ["CE", "PE"].map((side) => ({
    ...summarizeOutcomeGroup(side, signals.filter((row) => row.side === side)),
    side,
  }));

  const dateMap = new Map();
  signals.forEach((row) => {
    const key = formatReportDate(row.ts || row.time);
    if (!dateMap.has(key)) dateMap.set(key, []);
    dateMap.get(key).push(row);
  });
  const byDate = [...dateMap.entries()]
    .map(([date, dateSignals]) => ({
      date,
      ...summarizeOutcomeGroup(date, dateSignals),
      signals: dateSignals,
    }))
    .sort((a, b) => Number(new Date(b.signals?.[0]?.ts || 0)) - Number(new Date(a.signals?.[0]?.ts || 0)));

  const gateSourceRows = sortedGateRows.length
    ? sortedGateRows.map((row) => ({
      ...row,
      professionalDecision: row.decision || row.professionalDecision || "Unknown",
      outcome: { status: "Gate Record", targetHit: false, stoplossHit: false, falseSignal: false },
    }))
    : signals;
  const byGate = ["READY", "WAIT", "AVOID", "TRAIL", "Unknown"]
    .map((decision) => summarizeOutcomeGroup(decision, gateSourceRows.filter((row) => (row.professionalDecision || "Unknown") === decision)))
    .filter((row) => row.total > 0 || row.label !== "Unknown");

  const blockerMap = new Map();
  signals.forEach((row) => {
    const key = row.blocker || row.professionalReason || row.reason || row.outcome?.status || "Unknown";
    blockerMap.set(key, (blockerMap.get(key) || 0) + 1);
  });
  const byBlocker = [...blockerMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    summary,
    bySymbol,
    bySide,
    byDate,
    byGate,
    byBlocker,
    signals,
  };
}

function getTrailingLossCount(signals = []) {
  let count = 0;
  [...signals].sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).some((row) => {
    if (row.outcome?.stoplossHit) {
      count += 1;
      return false;
    }
    if (row.outcome?.targetHit) return true;
    return false;
  });
  return count;
}

function buildDailyReviewReport(signalRows = [], gateRows = [], pcrHistory = {}, selectedSymbol = "ALL") {
  const sessionStart = getSessionStartTs();
  const symbolFilter = selectedSymbol && INDEXES.includes(selectedSymbol) ? selectedSymbol : "";
  const todaySignals = (signalRows || []).filter((row) =>
    Number(row?.ts || 0) >= sessionStart &&
    (!symbolFilter || row.symbol === symbolFilter)
  );
  const todayGateRows = (gateRows || []).filter((row) =>
    Number(row?.ts || 0) >= sessionStart &&
    (!symbolFilter || row.symbol === symbolFilter)
  );
  const report = buildSignalAnalyticsReport(todaySignals, todayGateRows);
  const signals = report.signals || [];
  const trailingLosses = getTrailingLossCount(signals);
  const riskFlags = [
    report.summary.total >= 8 ? "Max trades reached" : "",
    report.summary.stoplossHit >= 2 ? "Daily SL limit hit" : "",
    trailingLosses >= 2 ? "Consecutive SL limit hit" : "",
  ].filter(Boolean);
  const riskTone = riskFlags.length ? "error" : report.summary.total >= 6 || report.summary.stoplossHit >= 1 ? "warning" : "success";
  const riskLabel = riskTone === "error" ? "Stop Trading" : riskTone === "warning" ? "Selective Only" : "Normal";
  const bestSymbol = [...(report.bySymbol || [])]
    .filter((row) => row.total > 0)
    .sort((a, b) => b.successRate - a.successRate || b.targetHit - a.targetHit)[0] || null;
  const worstSymbol = [...(report.bySymbol || [])]
    .filter((row) => row.total > 0)
    .sort((a, b) => a.successRate - b.successRate || b.stoplossHit - a.stoplossHit)[0] || null;
  const bestGateTrade = [...signals]
    .sort((a, b) =>
      Number(Boolean(b.outcome?.targetHit)) - Number(Boolean(a.outcome?.targetHit)) ||
      asNum(b.professionalScore, 0) - asNum(a.professionalScore, 0) ||
      asNum(b.score, 0) - asNum(a.score, 0)
    )[0] || null;
  const symbols = symbolFilter ? [symbolFilter] : INDEXES;
  const pcrSummary = symbols.map((symbol) => {
    const rows = getHistorySeries(pcrHistory, symbol).filter((row) => Number(row.ts || 0) >= sessionStart);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const delta = isNum(first?.value) && isNum(last?.value) ? Number((Number(last.value) - Number(first.value)).toFixed(2)) : null;
    return {
      symbol,
      label: INDEX_LABELS[symbol] || symbol,
      current: last?.value,
      start: first?.value,
      delta,
      rows: rows.length,
      tone: !isNum(delta) ? "warning" : delta > 0.02 ? "success" : delta < -0.02 ? "error" : "warning",
      direction: !isNum(delta) ? "Collecting" : Math.abs(delta) <= 0.02 ? "Flat" : delta > 0 ? "Rising" : "Falling",
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    sessionStart,
    selectedSymbol: symbolFilter || "ALL",
    report,
    risk: {
      label: riskLabel,
      tone: riskTone,
      flags: riskFlags,
      trailingLosses,
      maxTrades: 8,
      maxStoploss: 2,
    },
    bestSymbol,
    worstSymbol,
    bestGateTrade,
    pcrSummary,
    blockers: report.byBlocker || [],
    gateRows: todayGateRows,
  };
}

function signalReportHtml(report) {
  const metric = (label, value) => `<div class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
  const summary = report.summary || {};
  const symbolRows = (report.bySymbol || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${row.total}</td>
      <td>${row.targetHit}</td>
      <td>${row.stoplossHit}</td>
      <td>${row.falseSignal}</td>
      <td>${row.open}</td>
      <td>${formatNum(row.successRate, 1)}%</td>
    </tr>
  `).join("");
  const sideRows = (report.bySide || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.side)}</td>
      <td>${row.total}</td>
      <td>${row.targetHit}</td>
      <td>${row.stoplossHit}</td>
      <td>${row.falseSignal}</td>
      <td>${row.open}</td>
      <td>${formatNum(row.successRate, 1)}%</td>
    </tr>
  `).join("");
  const dateRows = (report.byDate || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${row.total}</td>
      <td>${row.targetHit}</td>
      <td>${row.stoplossHit}</td>
      <td>${row.falseSignal}</td>
      <td>${row.open}</td>
      <td>${row.notTestable}</td>
      <td>${formatNum(row.successRate, 1)}%</td>
    </tr>
  `).join("");
  const gateRows = (report.byGate || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${row.total}</td>
      <td>${row.targetHit}</td>
      <td>${row.stoplossHit}</td>
      <td>${row.falseSignal}</td>
      <td>${row.open}</td>
      <td>${row.notTestable}</td>
      <td>${formatNum(row.successRate, 1)}%</td>
    </tr>
  `).join("");
  const blockerRows = (report.byBlocker || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.reason)}</td>
      <td>${row.count}</td>
    </tr>
  `).join("");
  const signalRows = (report.signals || []).slice(-250).reverse().map((row) => `
    <tr>
      <td>${escapeHtml(formatReportTime(row.time))}</td>
      <td>${escapeHtml(row.label || row.symbol)}</td>
      <td>${escapeHtml(`${row.strike} ${row.side}`)}</td>
      <td>${escapeHtml(row.action)}</td>
      <td>${escapeHtml(row.readiness)}</td>
      <td>${escapeHtml(formatPrice(row.spot))}</td>
      <td>${escapeHtml(formatPremium(row.entry))}</td>
      <td>${escapeHtml(formatPremium(row.target))}</td>
      <td>${escapeHtml(formatPremium(row.stoploss))}</td>
      <td>${escapeHtml(formatNum(row.score, 0))}</td>
      <td>${escapeHtml(row.professionalDecision || "-")}</td>
      <td>${escapeHtml(isNum(row.professionalScore) && isNum(row.professionalTotal) ? `${row.professionalScore}/${row.professionalTotal}` : "-")}</td>
      <td>${escapeHtml(row.fiveMinute || "-")}</td>
      <td>${escapeHtml(row.greekQuality || "-")}</td>
      <td>${escapeHtml(row.premiumMomentum || "-")}</td>
      <td>${escapeHtml(row.session || "-")}</td>
      <td>${escapeHtml(row.blocker || "-")}</td>
      <td>${escapeHtml(row.outcome.status)}</td>
      <td>${escapeHtml(row.outcome.note)}</td>
    </tr>
  `).join("");
  const dateWiseSignalTables = (report.byDate || []).map((dateGroup) => {
    const rows = (dateGroup.signals || []).slice().reverse().map((row) => `
      <tr>
        <td>${escapeHtml(formatReportTime(row.time))}</td>
        <td>${escapeHtml(row.label || row.symbol)}</td>
        <td>${escapeHtml(`${row.strike} ${row.side}`)}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml(row.readiness)}</td>
        <td>${escapeHtml(formatPrice(row.spot))}</td>
        <td>${escapeHtml(formatPremium(row.entry))}</td>
        <td>${escapeHtml(formatPremium(row.target))}</td>
        <td>${escapeHtml(formatPremium(row.stoploss))}</td>
        <td>${escapeHtml(formatNum(row.score, 0))}</td>
        <td>${escapeHtml(row.professionalDecision || "-")}</td>
        <td>${escapeHtml(row.outcome.status)}</td>
        <td>${escapeHtml(row.outcome.note)}</td>
      </tr>
    `).join("");
    return `
      <h3>${escapeHtml(dateGroup.date)} - ${dateGroup.total} signals, ${formatNum(dateGroup.successRate, 1)}% success</h3>
      <table><thead><tr><th>Time</th><th>Symbol</th><th>Strike</th><th>Action</th><th>Readiness</th><th>Spot</th><th>Entry</th><th>Target</th><th>SL</th><th>Score</th><th>Gate</th><th>Outcome</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>
    `;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Option Signal Analytical Report</title>
  <style>
    body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #172033; margin: 28px; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    h2 { margin: 24px 0 8px; font-size: 16px; }
    h3 { margin: 18px 0 6px; font-size: 13px; color: #0f766e; }
    .sub { color: #526177; font-size: 12px; margin-bottom: 18px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
    .metric { border: 1px solid #cbd5e1; border-left: 4px solid #0f766e; border-radius: 8px; padding: 10px; background: #f8fafc; }
    .metric span { display: block; color: #526177; font-size: 11px; font-weight: 700; }
    .metric b { display: block; margin-top: 4px; font-size: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 11px; }
    th { background: #e2e8f0; color: #172033; text-align: left; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .note { margin-top: 18px; color: #526177; font-size: 11px; }
    @media print { body { margin: 16mm; } .metrics { grid-template-columns: repeat(4, 1fr); } }
  </style>
</head>
<body>
  <h1>Option Signal Analytical Report</h1>
  <div class="sub">Generated ${escapeHtml(formatReportTime(report.generatedAt))}. Outcome uses recorded signal timeline: target/SL is checked against later recorded spot/premium snapshots.</div>
  <div class="metrics">
    ${metric("Signal Count", summary.total)}
    ${metric("Target Hit", summary.targetHit)}
    ${metric("Stoploss / False", summary.falseSignal)}
    ${metric("Success Rate", `${formatNum(summary.successRate, 1)}%`)}
    ${metric("Open Signals", summary.open)}
    ${metric("Not Testable", summary.notTestable)}
    ${metric("Continuation / Trail", summary.continuation)}
    ${metric("Closed Signals", summary.targetHit + summary.stoplossHit)}
  </div>
  <h2>Symbol Performance</h2>
  <table><thead><tr><th>Symbol</th><th>Signals</th><th>Target Hit</th><th>SL Hit</th><th>False</th><th>Open</th><th>Success</th></tr></thead><tbody>${symbolRows}</tbody></table>
  <h2>Side Performance</h2>
  <table><thead><tr><th>Side</th><th>Signals</th><th>Target Hit</th><th>SL Hit</th><th>False</th><th>Open</th><th>Success</th></tr></thead><tbody>${sideRows}</tbody></table>
  <h2>Date Wise Performance</h2>
  <table><thead><tr><th>Date</th><th>Signals</th><th>Target Hit</th><th>SL Hit</th><th>False</th><th>Open</th><th>Not Testable</th><th>Success</th></tr></thead><tbody>${dateRows}</tbody></table>
  <h2>Professional Gate Performance</h2>
  <table><thead><tr><th>Decision</th><th>Signals</th><th>Target Hit</th><th>SL Hit</th><th>False</th><th>Open</th><th>Not Testable</th><th>Success</th></tr></thead><tbody>${gateRows}</tbody></table>
  <h2>Signal / Blocker Reasons</h2>
  <table><thead><tr><th>Reason</th><th>Count</th></tr></thead><tbody>${blockerRows}</tbody></table>
  <h2>Signal Detail</h2>
  <table><thead><tr><th>Time</th><th>Symbol</th><th>Strike</th><th>Action</th><th>Readiness</th><th>Spot</th><th>Entry</th><th>Target</th><th>SL</th><th>Score</th><th>Gate</th><th>Gate Score</th><th>5m</th><th>Greeks</th><th>Premium</th><th>Session</th><th>Blocker</th><th>Outcome</th><th>Note</th></tr></thead><tbody>${signalRows}</tbody></table>
  <h2>Date Wise Signal Detail</h2>
  ${dateWiseSignalTables || "<p>No date-wise signal rows recorded yet.</p>"}
  <div class="note">For robust historical backtesting, keep the dashboard running during market hours so the signal journal captures enough future snapshots after each signal.</div>
</body>
</html>`;
}

function getOptionSignalTracker(history = {}, symbol, option) {
  const rows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  const lastComparable = [...rows].reverse().find((row) =>
    option && row?.strike === option.strike && row?.side === option.side
  );
  const iv = isNum(option?.iv) ? Number(option.iv) : null;
  const volume = isNum(option?.volume) ? Number(option.volume) : null;
  const premium = isNum(option?.premium) ? Number(option.premium) : null;
  const oi = isNum(option?.oi) ? Number(option.oi) : null;
  const oiChange = isNum(option?.oiChange) ? Number(option.oiChange) : null;
  const ivDelta = iv !== null && isNum(lastComparable?.iv) ? Number((iv - Number(lastComparable.iv)).toFixed(2)) : null;
  const volumeDelta = volume !== null && isNum(lastComparable?.volume) ? volume - Number(lastComparable.volume) : null;
  const oiDelta = oi !== null && isNum(lastComparable?.oi) ? oi - Number(lastComparable.oi) : null;
  const oiChangeDelta = oiChange !== null && isNum(lastComparable?.oiChange) ? oiChange - Number(lastComparable.oiChange) : null;
  const premiumDelta = premium !== null && isNum(lastComparable?.premium)
    ? Number((premium - Number(lastComparable.premium)).toFixed(2))
    : null;
  const ivLabel = !isNum(ivDelta) ? "IV collecting" : Math.abs(ivDelta) < 0.15 ? "IV flat" : ivDelta > 0 ? `IV +${formatNum(ivDelta, 2)}` : `IV ${formatNum(ivDelta, 2)}`;
  const volumeLabel = !isNum(volumeDelta) ? "Vol collecting" : volumeDelta > 0 ? "Vol rising" : volumeDelta < 0 ? "Vol cooling" : "Vol flat";
  const oiShiftTone = !isNum(oiChangeDelta)
    ? "warning"
    : Math.abs(oiChangeDelta) >= 50000
      ? "error"
      : Math.abs(oiDelta || 0) >= 50000
        ? "warning"
        : "success";
  const oiShiftLabel = !isNum(oiChangeDelta)
    ? "OI collecting"
    : Math.abs(oiChangeDelta) < 10000
      ? "OI steady"
      : oiChangeDelta > 0
        ? `OI +${formatCompactInt(oiChangeDelta)}`
        : `OI ${formatCompactInt(oiChangeDelta)}`;
  const oiShiftNote = !isNum(oiChangeDelta)
    ? "Need a few live snapshots to compare OI."
    : oiChangeDelta > 0
      ? "Fresh OI is adding fast on this strike. Confirm with price before entry."
      : oiChangeDelta < 0
        ? "OI is reducing on this strike. Writers may be covering or positions may be exiting."
        : "No big OI change on this strike yet.";
  const premiumLabel = !isNum(premiumDelta)
    ? "Premium collecting"
    : Math.abs(premiumDelta) < 0.1
      ? "Premium flat"
      : premiumDelta > 0
        ? `Premium +${formatPremium(premiumDelta)}`
        : `Premium ${formatPremium(premiumDelta)}`;

  return {
    ivDelta,
    volumeDelta,
    premiumDelta,
    oiDelta,
    oiChangeDelta,
    ivLabel,
    volumeLabel,
    premiumLabel,
    oiShiftTone,
    oiShiftLabel,
    oiShiftNote,
  };
}

function upsertSignalJournalRows(existingRows = [], incomingRows = []) {
  const map = new Map();
  (Array.isArray(existingRows) ? existingRows : []).forEach((row) => {
    if (!row || typeof row !== "object") return;
    map.set(signalJournalKey(row), row);
  });

  let changed = false;
  incomingRows.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const key = signalJournalKey(row);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, { ...row, firstTs: row.ts, lastTs: row.ts, updateCount: 1 });
      changed = true;
      return;
    }

    const merged = {
      ...previous,
      ...row,
      firstTs: previous.firstTs || previous.ts || row.ts,
      firstTime: previous.firstTime || previous.time || row.time,
      lastTs: row.ts,
      lastTime: row.time,
      updateCount: asNum(previous.updateCount, 1) + 1,
    };
    if (JSON.stringify(previous) !== JSON.stringify(merged)) {
      map.set(key, merged);
      changed = true;
    }
  });

  return {
    changed,
    rows: [...map.values()]
      .sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0))
      .slice(-1500),
  };
}

function getWriterShiftSignal(setup = {}) {
  const side = String((setup?.option || setup?.displayOption)?.side || "").toUpperCase();
  const callChange = asNum(setup?.oiTotals?.callOiChange, null);
  const putChange = asNum(setup?.oiTotals?.putOiChange, null);
  if (!isNum(callChange) || !isNum(putChange)) {
    return { label: "Collecting", tone: "warning", note: "Waiting for call/put OI change." };
  }
  const net = Number(putChange) - Number(callChange);
  const total = Math.abs(Number(putChange)) + Math.abs(Number(callChange));
  const strong = Math.abs(net) >= Math.max(50000, total * 0.18);
  const supportsSide = side === "CE" ? net > 0 : side === "PE" ? net < 0 : false;
  const label = net > 0 ? "CE Support" : net < 0 ? "PE Support" : "Balanced";
  const tone = !strong ? "warning" : supportsSide ? "success" : "error";
  const note = !strong
    ? `Writers are close. Put change ${formatCompactInt(putChange)}, Call change ${formatCompactInt(callChange)}.`
    : supportsSide
      ? `Fast writer shift supports this ${side || "side"}. Put change ${formatCompactInt(putChange)}, Call change ${formatCompactInt(callChange)}.`
      : `Fast writer shift is against this ${side || "side"}. Put change ${formatCompactInt(putChange)}, Call change ${formatCompactInt(callChange)}.`;
  return { label, tone, note, net, callChange, putChange };
}

function getLevelShiftSignal(history = {}, symbol, levels = {}, analytics = {}) {
  const rows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  const currentSupport = asNum((levels?.supports || [])[0] ?? analytics?.supports?.[0] ?? analytics?.putWall, null);
  const currentResistance = asNum((levels?.resistances || [])[0] ?? analytics?.resistances?.[0] ?? analytics?.callWall, null);
  const previous = [...rows].reverse().find((row) => isNum(row?.support1) || isNum(row?.resistance1));
  if (!previous || (!isNum(currentSupport) && !isNum(currentResistance))) {
    return {
      label: "Levels Collecting",
      tone: "warning",
      note: `S ${formatPrice(currentSupport)} | R ${formatPrice(currentResistance)}`,
      supportDelta: null,
      resistanceDelta: null,
    };
  }
  const supportDelta = isNum(currentSupport) && isNum(previous.support1)
    ? Number((Number(currentSupport) - Number(previous.support1)).toFixed(2))
    : null;
  const resistanceDelta = isNum(currentResistance) && isNum(previous.resistance1)
    ? Number((Number(currentResistance) - Number(previous.resistance1)).toFixed(2))
    : null;
  const movedSupport = isNum(supportDelta) && Math.abs(supportDelta) >= 1;
  const movedResistance = isNum(resistanceDelta) && Math.abs(resistanceDelta) >= 1;
  if (!movedSupport && !movedResistance) {
    return {
      label: "Levels Stable",
      tone: "success",
      note: `S ${formatPrice(currentSupport)} | R ${formatPrice(currentResistance)}`,
      supportDelta,
      resistanceDelta,
    };
  }
  const labelParts = [];
  if (movedSupport) labelParts.push(`S ${supportDelta > 0 ? "Up" : "Down"}`);
  if (movedResistance) labelParts.push(`R ${resistanceDelta > 0 ? "Up" : "Down"}`);
  const bullish = (isNum(supportDelta) && supportDelta > 0) || (isNum(resistanceDelta) && resistanceDelta > 0);
  const bearish = (isNum(supportDelta) && supportDelta < 0) || (isNum(resistanceDelta) && resistanceDelta < 0);
  return {
    label: labelParts.join(" / "),
    tone: bullish && !bearish ? "success" : bearish && !bullish ? "error" : "warning",
    note: `Now S ${formatPrice(currentSupport)} / R ${formatPrice(currentResistance)}. Earlier S ${formatPrice(previous.support1)} / R ${formatPrice(previous.resistance1)}.`,
    supportDelta,
    resistanceDelta,
  };
}

function getPcrTracker(history = {}, symbol, currentPcr) {
  const rows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  const current = isNum(currentPcr) ? Number(currentPcr) : null;
  const previous = rows.length >= 2 ? Number(rows[rows.length - 2]?.value) : null;
  const delta = current !== null && isNum(previous) ? Number((current - previous).toFixed(2)) : null;
  const now = Date.now();
  const findLookback = (minutes) => {
    const target = now - minutes * 60 * 1000;
    return [...rows].reverse().find((row) => Number(row?.ts || 0) <= target) || rows[0] || null;
  };
  const fifteenMin = findLookback(15);
  const oneHour = findLookback(60);
  const twoHour = findLookback(120);
  const deltaFrom = (row) => current !== null && isNum(row?.value) ? Number((current - Number(row.value)).toFixed(2)) : null;
  const fiveMin = findLookback(5);
  const delta5m = deltaFrom(fiveMin);
  const delta15m = deltaFrom(fifteenMin);
  const delta1h = deltaFrom(oneHour);
  const delta2h = deltaFrom(twoHour);
  const trendLabel = !isNum(delta) ? "Collecting" : Math.abs(delta) < 0.03 ? "Flat" : delta > 0 ? "Rising" : "Falling";
  const biasLabel = !isNum(current)
    ? "-"
    : current >= 1.15
      ? "Put support"
      : current <= 0.85
        ? "Call pressure"
        : "Balanced";
  const tone = trendLabel === "Rising" ? "success" : trendLabel === "Falling" ? "error" : "default";

  return {
    current,
    previous,
    delta,
    delta5m,
    delta15m,
    delta1h,
    delta2h,
    trendLabel,
    biasLabel,
    tone,
    label: isNum(current) ? `${formatNum(current, 2)} ${trendLabel}` : "-",
    changeLabel: isNum(delta1h)
      ? `1h ${delta1h >= 0 ? "+" : ""}${formatNum(delta1h, 2)}`
      : isNum(delta15m)
        ? `15m ${delta15m >= 0 ? "+" : ""}${formatNum(delta15m, 2)}`
        : "Collecting",
  };
}

function getPcrCardState(pcrTrack = {}, side = "") {
  const current = asNum(pcrTrack.current, null);
  const delta = isNum(pcrTrack.delta5m) ? Number(pcrTrack.delta5m) : isNum(pcrTrack.delta15m) ? Number(pcrTrack.delta15m) : isNum(pcrTrack.delta) ? Number(pcrTrack.delta) : null;
  const interval = isNum(pcrTrack.delta5m) ? "5m" : isNum(pcrTrack.delta15m) ? "15m" : "now";
  const direction = !isNum(delta) || Math.abs(delta) < 0.03 ? "Flat" : delta > 0 ? "Rising" : "Falling";
  const pcrSide = !isNum(current) ? "Collect" : current >= 1.05 ? "CE Support" : current <= 0.95 ? "PE Support" : "Neutral";
  const selected = String(side || "").toUpperCase();
  const sideAligned = selected === "CE" ? current >= 1.05 || delta > 0.03 : selected === "PE" ? current <= 0.95 || delta < -0.03 : false;
  const tone = !isNum(current) ? "warning" : sideAligned ? "success" : direction === "Flat" ? "warning" : "error";
  const changeText = isNum(delta) ? `${delta >= 0 ? "+" : ""}${formatNum(delta, 2)}` : "-";
  return {
    current,
    direction,
    pcrSide,
    tone,
    label: isNum(current) ? `${formatNum(current, 2)} ${direction}` : "Collecting",
    note: `${interval} ${changeText} | ${pcrSide}`,
  };
}

function getTerminalSignalAge(history = {}, symbol, option = {}) {
  const rows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  const side = String(option?.side || "").toUpperCase();
  const strike = asNum(option?.strike, null);
  const matchingRows = rows.filter((row) => {
    const sideOk = !side || String(row?.side || "").toUpperCase() === side;
    const strikeOk = !isNum(strike) || Number(row?.strike) === Number(strike);
    return sideOk && strikeOk;
  });
  const sourceRows = matchingRows.length ? matchingRows : rows;
  const latest = [...sourceRows]
    .map((row) => ({ ...row, ts: normalizeTimestampMs(row?.lastTs || row?.ts || row?.time) }))
    .filter((row) => row.ts)
    .sort((a, b) => Number(b.ts) - Number(a.ts))[0];

  if (!latest) {
    return { label: "No signal", sub: "Waiting", tone: "warn", minutes: null };
  }

  const ageMs = Math.max(0, Date.now() - Number(latest.ts));
  const minutes = Math.floor(ageMs / 60000);
  const tone = minutes <= 5 ? "up" : minutes <= 15 ? "warn" : "down";
  return {
    label: formatFreshnessAge(ageMs),
    sub: `Last ${formatShortTime(latest.ts)}`,
    tone,
    minutes,
    row: latest,
  };
}

function getTerminalNearestLevel(levels = {}, spot, side = "") {
  const price = asNum(spot, null);
  if (!isNum(price)) {
    return { label: "No spot", sub: "Level distance unavailable", tone: "warn" };
  }

  const candidates = [
    ...(levels?.supports || []).filter(isNum).map((level) => ({ type: "S", level: Number(level), tone: "up" })),
    ...(levels?.resistances || []).filter(isNum).map((level) => ({ type: "R", level: Number(level), tone: "down" })),
  ].filter((item) => item.level > 0);

  if (!candidates.length) {
    return { label: "No level", sub: "Support/resistance collecting", tone: "warn" };
  }

  const nearest = candidates
    .map((item) => ({ ...item, points: Math.abs(Number(item.level) - Number(price)) }))
    .sort((a, b) => a.points - b.points)[0];
  const selectedSide = String(side || "").toUpperCase();
  const trap = (selectedSide === "CE" && nearest.type === "R") || (selectedSide === "PE" && nearest.type === "S");
  return {
    label: `${nearest.type} ${formatPrice(nearest.level)}`,
    sub: `${formatPrice(nearest.points)} pts away${trap ? " | trap side" : ""}`,
    tone: trap ? "down" : nearest.tone,
    level: nearest.level,
    points: nearest.points,
    type: nearest.type,
  };
}

function voteSideFromText(value = "") {
  const text = String(value || "").toUpperCase();
  if (/\bCE\b|BULL|ABOVE VWAP|PUT SUPPORT/.test(text)) return "CE";
  if (/\bPE\b|BEAR|BELOW VWAP|CALL PRESSURE/.test(text)) return "PE";
  return "";
}

function getTerminalConflictMeter({ setup = {}, option = {}, pcrTrack = {}, oiShift = {} }) {
  const selectedSide = String(option?.side || "").toUpperCase();
  const pcrState = getPcrCardState(pcrTrack, selectedSide);
  const trendText = [
    setup?.trendEngine?.label,
    setup?.trendEngine?.compact,
    setup?.dailyTrend?.label,
    setup?.fifteenTrend?.label,
    setup?.hourlyTrend?.label,
  ].filter(Boolean).join(" | ");

  const votes = [
    { name: "PCR", side: voteSideFromText(pcrState.pcrSide), text: pcrState.pcrSide },
    { name: "VWAP", side: voteSideFromText(setup?.vwapState?.label), text: setup?.vwapState?.label || "VWAP -" },
    { name: "OI", side: voteSideFromText(oiShift.label), text: oiShift.label || "OI -" },
    { name: "Trend", side: voteSideFromText(trendText), text: trendText || "Trend -" },
  ];

  const activeVotes = votes.filter((vote) => vote.side);
  const support = selectedSide ? activeVotes.filter((vote) => vote.side === selectedSide).length : 0;
  const against = selectedSide ? activeVotes.filter((vote) => vote.side && vote.side !== selectedSide).length : 0;
  const neutral = votes.length - activeVotes.length;
  const tone = !selectedSide || !activeVotes.length
    ? "warn"
    : against === 0 && support >= 3
      ? "up"
      : against >= support
        ? "down"
        : "warn";

  return {
    label: selectedSide ? `${support} support / ${against} conflict` : "No side",
    sub: `${votes.map((vote) => `${vote.name} ${vote.side || "-"}`).join(" | ")}${neutral ? ` | ${neutral} neutral` : ""}`,
    tone,
    votes,
    support,
    against,
  };
}

function loadFastActionMarks() {
  try {
    return JSON.parse(localStorage.getItem(FAST_ACTION_MARKS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function getFastActionKey(row = {}, option = {}, plan = {}) {
  return [
    row?.symbol || "",
    option?.side || "",
    isNum(option?.strike) ? Number(option.strike) : "",
    stableSignalLevel(plan?.entry),
    stableSignalLevel(plan?.target),
    stableSignalLevel(plan?.stoploss),
  ].join("|");
}

function getHistorySeries(history = {}, symbol, key = "value", matcher) {
  const rows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  return rows
    .filter((row) => (!matcher || matcher(row)) && isNum(row?.[key]))
    .map((row) => ({ ts: row.ts, value: Number(row[key]) }));
}

function getPcrWindowStats(history = {}, symbol, currentPcr, minutes = 5) {
  const rows = getHistorySeries(history, symbol);
  const current = isNum(currentPcr) ? Number(currentPcr) : rows[rows.length - 1]?.value;
  const now = Date.now();
  const windowRows = rows.filter((row) => Number(row.ts || 0) >= now - minutes * 60 * 1000);
  const usableRows = windowRows.length >= 2 ? windowRows : rows.slice(-Math.max(2, Math.min(rows.length, minutes + 1)));
  const first = usableRows[0];
  const lastValue = isNum(current) ? Number(current) : usableRows[usableRows.length - 1]?.value;
  const delta = isNum(lastValue) && isNum(first?.value) ? Number((Number(lastValue) - Number(first.value)).toFixed(2)) : null;
  const values = usableRows.map((row) => row.value).filter(isNum).map(Number);
  const chartValues = [...values];
  if (isNum(lastValue) && chartValues[chartValues.length - 1] !== Number(lastValue)) {
    chartValues.push(Number(lastValue));
  }
  return {
    minutes,
    current: lastValue,
    delta,
    high: chartValues.length ? Math.max(...chartValues) : null,
    low: chartValues.length ? Math.min(...chartValues) : null,
    points: usableRows.length,
    values: chartValues.length ? chartValues : [lastValue].filter(isNum),
    label: !isNum(delta) ? "Collecting" : Math.abs(delta) < 0.02 ? "Flat" : delta > 0 ? "Rising" : "Falling",
  };
}

function formatPcrTableTime(ts) {
  const parsed = new Date(Number(ts || 0));
  if (Number.isNaN(parsed.getTime())) return "-";
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function getPcrHistoryKey(symbol, interval = 5) {
  return interval === 5 ? symbol : `${symbol}:${interval}m`;
}

function getPcrBucketTs(ts = Date.now(), interval = 5) {
  const minutes = Math.max(1, Number(interval) || 5);
  return Math.floor(Number(ts || Date.now()) / (minutes * 60 * 1000)) * minutes * 60 * 1000;
}

function firstPositiveValue(...values) {
  const found = values.find((value) => isNum(value) && Number(value) > 0);
  return isNum(found) ? Number(found) : null;
}

function getPcrRowValue(row = {}) {
  return isNum(row.value) ? Number(row.value) : isNum(row.pcr) ? Number(row.pcr) : null;
}

function getLastValidPcrField(rows = [], field) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index] || {};
    const value = field === "value" ? getPcrRowValue(row) : row[field];
    if (isNum(value) && (field !== "vwap" || Number(value) > 0)) return Number(value);
  }
  return null;
}

function hydratePcrSnapshot(snapshot = {}, rows = []) {
  const value = getPcrRowValue(snapshot) ?? getLastValidPcrField(rows, "value");
  const vwap = firstPositiveValue(snapshot.vwap, getLastValidPcrField(rows, "vwap"));
  const hydrated = {
    ...snapshot,
    value,
    vwap,
  };
  return {
    ...hydrated,
    optionSignal: getPcrOptionSignal(hydrated),
    vwapSignal: getPcrVwapSignal(hydrated),
  };
}

function normalizePcrTradeSignal(signal) {
  const text = String(signal || "").toUpperCase();
  if (text.includes("CE")) return "BUY CE";
  if (text.includes("PE")) return "BUY PE";
  if (text === "BUY") return "BUY CE";
  if (text === "SELL") return "BUY PE";
  return "";
}

function getPcrBiasSide(row = {}) {
  const pcr = getPcrRowValue(row);
  const diff = asNum(row.diff, null);
  if (isNum(pcr)) {
    if (Number(pcr) <= 1) return "PE";
    if (Number(pcr) >= 1) return "CE";
  }
  if (isNum(diff)) return Number(diff) >= 0 ? "CE" : "PE";
  return "";
}

function getPcrVwapSide(row = {}) {
  if (!isNum(row.price) || !isNum(row.vwap) || Number(row.vwap) <= 0) return "";
  return Number(row.price) >= Number(row.vwap) ? "CE" : "PE";
}

function getPcrCombinedSignal(row = {}) {
  const pcrSide = getPcrBiasSide(row);
  const vwapSide = getPcrVwapSide(row);
  if (pcrSide && vwapSide) return pcrSide === vwapSide ? `BUY ${pcrSide}` : "WAIT";
  if (vwapSide) return `WAIT ${vwapSide}`;
  if (pcrSide) return `WAIT ${pcrSide}`;
  return "-";
}

function getPcrOptionSignal(row = {}) {
  return getPcrCombinedSignal(row) || normalizePcrTradeSignal(row.optionSignal) || "-";
}

function getPcrVwapSignal(row = {}) {
  return getPcrCombinedSignal(row) || normalizePcrTradeSignal(row.vwapSignal) || "-";
}

function getPcrBiasLabel(side) {
  if (side === "CE") return "CE Bias";
  if (side === "PE") return "PE Bias";
  return "-";
}

function makePcrLiveSnapshot(symbol, setup = {}, card = {}) {
  const analytics = setup?.analytics || card?.analytics || {};
  const oiTotals = setup?.oiTotals || {};
  const callOi = asNum(oiTotals.callOi, null);
  const putOi = asNum(oiTotals.putOi, null);
  const price = asNum(setup?.spot ?? card?.spot?.ltp ?? card?.future?.ltp, null);
  const vwap = firstPositiveValue(setup?.spotQuote?.vwap, setup?.futureQuote?.vwap, card?.spot?.vwap, card?.future?.vwap);
  const pcr = analytics?.pcr ?? setup?.pcr;
  const diff = isNum(putOi) && isNum(callOi) ? Number(putOi) - Number(callOi) : null;
  const snapshot = {
    symbol,
    value: isNum(pcr) ? Number(Number(pcr).toFixed(2)) : null,
    callOi,
    putOi,
    diff,
    price,
    vwap,
  };
  return {
    ...snapshot,
    optionSignal: getPcrOptionSignal(snapshot),
    vwapSignal: getPcrVwapSignal(snapshot),
  };
}

function bucketPcrRows(rows = [], interval = 5) {
  const bucketMap = new Map();
  rows
    .filter((row) => isNum(getPcrRowValue(row)))
    .forEach((row) => {
      const bucketTs = row.bucketTs || getPcrBucketTs(row.ts, interval);
      const value = getPcrRowValue(row);
      const vwap = firstPositiveValue(row.vwap);
      const price = firstPositiveValue(row.price);
      bucketMap.set(bucketTs, {
        ...row,
        ts: bucketTs,
        bucketTs,
        value,
        pcr: value,
        vwap,
        price,
      });
    });
  const fillFields = ["value", "pcr", "callOi", "putOi", "diff", "price", "vwap"];
  const hasUsableField = (field, value) => isNum(value) && (!["price", "vwap"].includes(field) || Number(value) > 0);
  const sorted = [...bucketMap.values()]
    .sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0))
    .map((row) => {
      const value = getPcrRowValue(row);
      const vwap = firstPositiveValue(row.vwap);
      return {
        ...row,
        value,
        pcr: value,
        vwap,
      };
    });
  const lastValues = {};
  const forwardFilled = sorted.map((row) => {
    const next = { ...row };
    fillFields.forEach((field) => {
      if (hasUsableField(field, next[field])) {
        lastValues[field] = Number(next[field]);
      } else if (hasUsableField(field, lastValues[field])) {
        next[field] = lastValues[field];
      }
    });
    return next;
  });
  const nextValues = {};
  return forwardFilled
    .slice()
    .reverse()
    .map((row) => {
      const filled = { ...row };
      fillFields.forEach((field) => {
        if (hasUsableField(field, filled[field])) {
          nextValues[field] = Number(filled[field]);
        } else if (hasUsableField(field, nextValues[field])) {
          filled[field] = nextValues[field];
        }
      });
      return {
        ...filled,
        optionSignal: getPcrOptionSignal(filled),
        vwapSignal: getPcrVwapSignal(filled),
      };
    })
    .reverse();
}

function getPcrIntradayRows(history = {}, symbol, liveSnapshot = {}, interval = 5) {
  const primaryRows = Array.isArray(history?.[getPcrHistoryKey(symbol, interval)]) ? history[getPcrHistoryKey(symbol, interval)] : [];
  const fallbackRows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  const rows = primaryRows.length ? primaryRows : fallbackRows;
  const merged = [...rows];
  const safeLiveSnapshot = hydratePcrSnapshot(liveSnapshot, rows);
  if (isNum(safeLiveSnapshot?.value)) {
    const bucketTs = getPcrBucketTs(Date.now(), interval);
    const existingIndex = merged.findIndex((row) => Number(row.bucketTs || getPcrBucketTs(row.ts, interval)) === bucketTs);
    const liveRow = { ts: bucketTs, bucketTs, interval, ...safeLiveSnapshot };
    if (existingIndex >= 0) {
      merged[existingIndex] = { ...merged[existingIndex], ...liveRow };
    } else {
      merged.push(liveRow);
    }
  }
  return bucketPcrRows(merged, interval)
    .slice(-26)
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    .map((row) => ({
      ...row,
      timeLabel: formatPcrTableTime(row.ts),
      pcr: row.value,
      optionSignal: getPcrOptionSignal(row),
      vwapSignal: getPcrVwapSignal(row),
    }));
}

function getPcrTableFreshness(rows = [], interval = 5) {
  const latest = (Array.isArray(rows) ? rows : [])
    .filter((row) => isNum(row?.ts))
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))[0];
  if (!latest) {
    return {
      lastLabel: "-",
      ageLabel: "-",
      rows: 0,
      label: `${interval}m Collect`,
      tone: "warning",
      fresh: false,
    };
  }
  const ageMs = Math.max(0, Date.now() - Number(latest.ts || 0));
  const maxAgeMs = Math.max(2, Number(interval) || 5) * 3 * 60 * 1000;
  const fresh = ageMs <= maxAgeMs;
  return {
    lastLabel: formatPcrTableTime(latest.ts),
    ageLabel: formatFreshnessAge(ageMs),
    rows: rows.length,
    label: `${interval}m ${fresh ? "Fresh" : "Stale"}`,
    tone: fresh ? "success" : "error",
    fresh,
  };
}

function getReadyAlertKey(setup = {}) {
  const option = setup?.option || setup?.displayOption || {};
  return [
    setup.symbol,
    option.side,
    isNum(option.strike) ? Number(option.strike) : "",
    setup?.professionalGate?.decision || "",
  ].join("|");
}

function shouldReadyAlert(setup = {}) {
  const option = setup?.option || setup?.displayOption || {};
  return Boolean(
    setup?.symbol &&
    option?.side &&
    isNum(option?.strike) &&
    setup?.professionalGate?.decision === "READY" &&
    setup?.professionalGate?.passed &&
    setup?.vwapState?.aligned &&
    isNum(setup?.plan?.riskReward) &&
    Number(setup.plan.riskReward) >= 2
  );
}

function playReadyBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(1175, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.34);
    window.setTimeout(() => context.close?.(), 600);
  } catch (err) {
    console.warn("ready beep failed", err);
  }
}

function getSeriesDelta(series = []) {
  const clean = series.filter((row) => isNum(row?.value));
  if (clean.length < 2) return null;
  const first = Number(clean[0].value);
  const last = Number(clean[clean.length - 1].value);
  return Number((last - first).toFixed(2));
}

function deriveChangePct(price, change, changePct) {
  if (isNum(changePct)) return Number(changePct);
  if (!isNum(price) || !isNum(change)) return null;
  const previous = Number(price) - Number(change);
  if (!previous) return null;
  return (Number(change) / previous) * 100;
}

function ChangeText({ change, changePct, price }) {
  const value = Number(change || 0);
  const resolvedPct = deriveChangePct(price, change, changePct);
  return (
    <span className={classBySign(change)}>
      <DirectionIcon value={value} />
      {isNum(change) ? `${Number(change) >= 0 ? "+" : ""}${formatNum(change, 2)}` : "-"}
      {isNum(resolvedPct) ? ` (${formatPct(resolvedPct)})` : ""}
    </span>
  );
}

function DirectionValue({ children, value, tone }) {
  const hasDirection = tone || isNum(value);
  return (
    <span className="direction-value">
      {hasDirection ? <DirectionIcon value={value} tone={tone} /> : null}
      {children}
    </span>
  );
}

function HeaderClock() {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="header-clock">
      {clock.toLocaleString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}
    </div>
  );
}

function HeaderVixPill({ vix = {} }) {
  const change = asNum(vix?.change_pct, null);
  const tone = !isNum(change) ? "flat" : change > 2 ? "up" : change < -3 ? "down" : "flat";
  return (
    <div className={`header-vix-pill ${tone}`}>
      <span>VIX</span>
      <b>{formatNum(vix?.ltp, 2)}</b>
      <em><DirectionValue value={vix?.change_pct}>{formatPct(vix?.change_pct)}</DirectionValue></em>
      <small>{getDecayState().label}</small>
    </div>
  );
}

function DashboardLogo() {
  return (
    <div className="dashboard-logo" aria-label="Options Command Dashboard logo">
      <img src={dashboardLogoSrc} alt="" />
    </div>
  );
}

function SectionCard({ title, icon, extra, children, className = "", collapsible = false, collapsed = false, onCollapse }) {
  const extraNode = collapsible ? (
    <Space size={8} wrap>
      {extra}
      <Button size="small" onClick={onCollapse}>{collapsed ? "Show" : "Collapse"}</Button>
    </Space>
  ) : extra;

  return (
    <Card className={`pro-card ${className} ${collapsed ? "section-card-collapsed" : ""}`} title={<h3 className="section-title">{icon}{title}</h3>} extra={extraNode}>
      {collapsed ? null : children}
    </Card>
  );
}

function MetricTile({ label, value, sub, tone, onOpen }) {
  const interactiveProps = onOpen
    ? { role: "button", tabIndex: 0, onClick: onOpen, onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") onOpen(event); } }
    : {};
  return (
    <div className={`metric-tile ${onOpen ? "clickable-card" : ""}`} {...interactiveProps}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone || ""}`}>{value}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </div>
  );
}

function LevelPill({ label, value, tone = "neutral", sub }) {
  return (
    <div className={`level-pill ${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="mt-1 text-base font-extrabold leading-tight">{value}</div>
      {sub ? <div className="metric-sub">{sub}</div> : null}
    </div>
  );
}

function getBreadthSummary(advanceDecline = {}) {
  const rows = INDEXES.map((item) => advanceDecline?.[item] || {});
  const advances = rows.reduce((sum, row) => sum + asNum(row?.advances, 0), 0);
  const declines = rows.reduce((sum, row) => sum + asNum(row?.declines, 0), 0);
  const total = advances + declines;
  const ratio = total ? (advances / total) * 100 : null;
  const delta = advances - declines;
  return {
    advances,
    declines,
    total,
    ratio,
    delta,
    label: total ? `${formatInt(advances)} / ${formatInt(declines)}` : "-",
  };
}

function MarketBreadthGraph({ advanceDecline = {} }) {
  const breadth = getBreadthSummary(advanceDecline);
  const advPct = isNum(breadth.ratio) ? Math.max(0, Math.min(100, Number(breadth.ratio))) : 50;
  const decPct = 100 - advPct;
  const tone = breadth.delta > 0 ? "positive" : breadth.delta < 0 ? "negative" : "neutral";

  return (
    <div className={`market-breadth-graph ${tone}`}>
      <div className="breadth-graph-head">
        <span>Adv/Dec</span>
        <b><DirectionValue value={breadth.delta}>{breadth.label}</DirectionValue></b>
      </div>
      <div className="breadth-bar" aria-label={`Advances ${formatNum(advPct, 0)} percent`}>
        <span className="adv" style={{ width: `${advPct}%` }} />
        <span className="dec" style={{ width: `${decPct}%` }} />
      </div>
    </div>
  );
}

function MarketStrip({ items = [], onOpen }) {
  if (!items.length) return null;
  const isSingle = items.length === 1;
  return (
    <div className={`market-strip-layout ${isSingle ? "single" : "multi"}`}>
      <div className={`market-strip-grid ${isSingle ? "single" : "multi"}`}>
        {items.map((item, index) => (
          <div
            className={`strip-tile ${onOpen ? "clickable-card" : ""}`}
            key={`${item?.label}-${index}`}
            role={onOpen ? "button" : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onClick={() => {
              const symbolKey = stripLabelToIndexSymbol(item?.label);
              if (symbolKey) onOpen(symbolKey, "signal", "Price");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              const symbolKey = stripLabelToIndexSymbol(item?.label);
              if (symbolKey) onOpen(symbolKey, "signal", "Price");
            }}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-300">
              <span>{item?.label}</span>
              {item?.source === "option_chain_implied" ? <span className="strip-source">Implied</span> : null}
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <strong className={`text-lg price-tone ${toneBySign(item?.change_pct ?? item?.change)}`}>{formatPrice(item?.ltp)}</strong>
              <span className="text-xs font-bold"><ChangeText change={item?.change} changePct={item?.change_pct} price={item?.ltp} /></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getExpiryLabel(detail = {}) {
  const analytics = detail?.analytics || {};
  const chain = detail?.optionChain || [];
  const direct =
    detail?.expiry ||
    detail?.expiryDate ||
    detail?.expiry_date ||
    analytics?.expiry ||
    analytics?.expiryDate ||
    analytics?.expiry_date ||
    chain.find((row) => row?.expiry || row?.expiryDate || row?.expiry_date)?.expiry ||
    chain.find((row) => row?.expiry || row?.expiryDate || row?.expiry_date)?.expiryDate ||
    chain.find((row) => row?.expiry || row?.expiryDate || row?.expiry_date)?.expiry_date;
  return direct || "Expiry collecting";
}

function MiniSparkline({ label, value, sub, series = [] }) {
  const clean = series.filter((row) => isNum(row?.value));
  const values = clean.map((row) => Number(row.value));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min || 1;
  const delta = getSeriesDelta(clean);
  const tone = !isNum(delta) ? "flat" : Number(delta) > 0 ? "up" : Number(delta) < 0 ? "down" : "flat";
  const points = values
    .map((point, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 36 - ((point - min) / range) * 30;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = points ? `0,40 ${points} 100,40` : "";

  return (
    <div className="mini-chart">
      <div className="mini-chart-head">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <svg className="mini-chart-svg" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="36" x2="100" y2="36" className="mini-chart-base" />
        {values.length > 1 ? <polygon points={areaPoints} className={`mini-chart-area ${tone}`} /> : null}
        {values.length > 1 ? <polyline points={points} className={`mini-chart-line ${tone}`} /> : null}
      </svg>
      <div className={`mini-chart-sub ${tone}`}>
        {sub || (values.length > 1 && isNum(delta) ? `${delta >= 0 ? "+" : ""}${formatNum(delta, 2)} since open` : "Collecting")}
      </div>
    </div>
  );
}

function CommandSparkline({ values = [], tone = "flat", area = false }) {
  const clean = values.filter(isNum).map(Number);
  const min = clean.length ? Math.min(...clean) : 0;
  const max = clean.length ? Math.max(...clean) : 0;
  const range = max - min || 1;
  const pointPairs = clean
    .map((point, index) => {
      const x = clean.length <= 1 ? 4 : 4 + (index / (clean.length - 1)) * 92;
      const y = 24 - ((point - min) / range) * 18;
      return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
    });
  const points = pointPairs.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = points ? `4,27 ${points} 96,27` : "";
  const active = clean.length > 1 && Math.abs(max - min) > 0.01;

  return (
    <svg className="command-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      {active ? (
        <>
          {area ? <polygon points={areaPoints} className={`command-sparkline-area ${tone}`} /> : null}
          <polyline points={points} className={`command-sparkline-path ${tone}`} />
        </>
      ) : (
        <path d="M4 18 L96 18" className="command-sparkline-path flat ghost" />
      )}
    </svg>
  );
}

function getChartLookback(resolution = "5") {
  const key = String(resolution || "5").toUpperCase();
  if (key === "1") return 15 * 24 * 60;
  if (key === "2") return 15 * 24 * 60;
  if (key === "5") return 15 * 24 * 60;
  if (key === "15") return 15 * 24 * 60;
  if (key === "30") return 15 * 24 * 60;
  if (key === "60") return 15 * 24 * 60;
  if (key === "D" || key === "1D") return 180 * 24 * 60;
  return 15 * 24 * 60;
}

function formatResolutionLabel(resolution = "5") {
  const key = String(resolution || "5").toUpperCase();
  if (key === "60") return "1h";
  if (key === "D" || key === "1D") return "1D";
  return `${key}m`;
}

function mergeLivePriceIntoCandles(candles = [], livePrice, resolution = "5") {
  const base = Array.isArray(candles) ? [...candles] : [];
  if (!isNum(livePrice)) return base;

  const live = Number(livePrice);
  const resolutionKey = String(resolution || "5").toUpperCase();
  const minutes = Number(resolutionKey);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    if (!base.length) return [{ ts: Date.now(), open: live, high: live, low: live, close: live, volume: 0, live: true }];
    const last = base[base.length - 1];
    return [
      ...base.slice(0, -1),
      {
        ...last,
        close: live,
        high: Math.max(Number(last.high), live),
        low: Math.min(Number(last.low), live),
        live: true,
      },
    ];
  }

  const intervalMs = minutes * 60 * 1000;
  const bucketTs = Math.floor(Date.now() / intervalMs) * intervalMs;
  if (!base.length) {
    return [{ ts: bucketTs, open: live, high: live, low: live, close: live, volume: 0, live: true }];
  }

  const last = base[base.length - 1];
  const lastTs = normalizeTimestampMs(last.ts);
  if (!lastTs || bucketTs <= lastTs) {
    return [
      ...base.slice(0, -1),
      {
        ...last,
        close: live,
        high: Math.max(Number(last.high), live),
        low: Math.min(Number(last.low), live),
        live: true,
      },
    ];
  }

  const staleGap = bucketTs - lastTs > intervalMs * 2;
  const open = staleGap ? live : (isNum(last.close) ? Number(last.close) : live);
  return [
    ...base,
    {
      ts: bucketTs,
      open,
      high: Math.max(open, live),
      low: Math.min(open, live),
      close: live,
      volume: 0,
      live: true,
    },
  ];
}

function areSameCandleTrail(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = a[a.length - 1];
  const right = b[b.length - 1];
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    normalizeTimestampMs(left.ts) === normalizeTimestampMs(right.ts) &&
    Number(left.open) === Number(right.open) &&
    Number(left.high) === Number(right.high) &&
    Number(left.low) === Number(right.low) &&
    Number(left.close) === Number(right.close)
  );
}

const LIVE_CANDLE_TRAILS = new Map();

function getLiveCandleTrail(chartKey, baseLastTs, livePrice, resolution = "5") {
  const key = chartKey || "default";
  const previous = LIVE_CANDLE_TRAILS.get(key) || [];
  const current = previous.filter((row) => (normalizeTimestampMs(row?.ts) || 0) > baseLastTs);
  if (!isNum(livePrice)) {
    if (!areSameCandleTrail(previous, current)) LIVE_CANDLE_TRAILS.set(key, current);
    return current;
  }

  const next = mergeLivePriceIntoCandles(current, livePrice, resolution)
    .filter((row) => (normalizeTimestampMs(row?.ts) || 0) > baseLastTs)
    .slice(-200);
  if (!areSameCandleTrail(previous, next)) LIVE_CANDLE_TRAILS.set(key, next);
  return next;
}

function FyersCandleChart({ candles = [], updatedAt = "", resolution = "5", livePrice, themeMode = "light", height = 540, title = "Fyers Full Chart", compact = false, sourceLabel = "", levels = [], showSignals = true, showLongSignals = true, showShortSignals = true, showVWAP = true, showZones = true }) {
  const chartEl = useRef(null);
  const [timeLeft, setTimeLeft] = useState("");
  const hasCountdown = !isNaN(parseInt(resolution, 10));

  useEffect(() => {
    const res = parseInt(resolution, 10);
    if (isNaN(res)) return undefined;
    const timer = setInterval(() => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const currentTotalSeconds = minutes * 60 + seconds;
      const resSeconds = res * 60;
      const nextCandleSeconds = Math.ceil((currentTotalSeconds + 1) / resSeconds) * resSeconds;
      let diff = nextCandleSeconds - currentTotalSeconds;
      if (diff === 0) diff = resSeconds;
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [resolution]);
  const chartApi = useRef(null);
  const candleSeries = useRef(null);
  const priceLines = useRef([]);
  const fittedWindowRef = useRef("");
  const lastDataWindowRef = useRef("");
  const lastShowVWAPRef = useRef(true);
  const lastShowZonesRef = useRef(true);
  const vwapSeries = useRef(null);
  const emaSeries = useRef(null);
  const markersRef = useRef(null);
  const chartIdentity = `${title}|${sourceLabel}|${resolution}`;
  const normalizedCandles = normalizeHistoryCandles(candles);
  const baseCandles = normalizedCandles.slice(compact ? -260 : -5000);
  const baseLastTs = normalizeTimestampMs(baseCandles[baseCandles.length - 1]?.ts) || 0;
  const visibleLiveTrail = getLiveCandleTrail(chartIdentity, baseLastTs, livePrice, resolution);
  const clean = mergeLivePriceIntoCandles([...baseCandles, ...visibleLiveTrail], livePrice, resolution).slice(compact ? -260 : -5000);

  const first = clean.length > 0 ? clean[0] : {};
  const last = clean.length > 0 ? clean[clean.length - 1] : {};
  const move = isNum(last.close) && isNum(first.open) ? Number(last.close) - Number(first.open) : null;

  const chartDataMap = new Map();
  let lastTime = 0;
  clean.forEach((row, i) => {
    let time = Math.floor(Number(row.ts) / 1000) + 19800; // Lightweight charts strictly requires Unix time in SECONDS + 5:30 IST offset
    if (!time || isNaN(time)) time = 1781495100 + (i * 300); // Failsafe
    if (time <= lastTime) time = lastTime + 300; // Failsafe for duplicates or out of order
    lastTime = time;

    chartDataMap.set(time, {
      time,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    });
  });

  const chartData = Array.from(chartDataMap.values()).sort((a, b) => a.time - b.time);
  const dataWindowKey = chartData.length > 0 ? `${chartData[0].time}-${chartData[chartData.length - 1].time}` : "";
  const hasCandles = chartData.length > 0;

  useEffect(() => {
    if (!chartEl.current || !hasCandles) return undefined;
    const isDark = themeMode !== "light";
    const chart = createChart(chartEl.current, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#111827" : "#ffffff" },
        textColor: isDark ? "#c7d2e4" : "#526177",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(199, 210, 228, 0.08)" : "rgba(100, 116, 139, 0.12)" },
        horzLines: { color: isDark ? "rgba(199, 210, 228, 0.1)" : "rgba(100, 116, 139, 0.14)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: isDark ? "rgba(199, 210, 228, 0.18)" : "rgba(100, 116, 139, 0.18)",
        entireTextOnly: true,
        minimumWidth: 86,
        scaleMargins: { top: 0.1, bottom: 0.35 }, // Increased bottom margin to prevent overlapping volume
      },
      timeScale: {
        borderColor: isDark ? "rgba(199, 210, 228, 0.18)" : "rgba(100, 116, 139, 0.18)",
        timeVisible: true,
        secondsVisible: false,
        rightOffsetPixels: 18,
      },
      localization: {
        locale: "en-IN",
      },
    });

    const candlesApi = chart.addSeries(CandlestickSeries, {
      upColor: "#059669",
      downColor: "#dc2626",
      borderUpColor: "#059669",
      borderDownColor: "#dc2626",
      wickUpColor: "#059669",
      wickDownColor: "#dc2626",
      priceLineColor: "#0f766e",
      priceLineWidth: 2,
    });

    const vwapApi = chart.addSeries(LineSeries, {
      color: "#eab308", // Yellow for VWAP
      lineWidth: 2,
      crosshairMarkerVisible: true,
      priceLineVisible: false,
    });

    const emaApi = chart.addSeries(LineSeries, {
      color: "#3b82f6", // Blue for EMA 20
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
    });

    const markersApi = createSeriesMarkers(candlesApi, []);

    chartApi.current = chart;
    candleSeries.current = candlesApi;
    vwapSeries.current = vwapApi;
    emaSeries.current = emaApi;
    markersRef.current = markersApi;

    fittedWindowRef.current = "";
    return () => {
      priceLines.current.forEach((line) => {
        try {
          candlesApi.removePriceLine(line);
        } catch {
          // Ignore chart cleanup races.
        }
      });
      priceLines.current = [];
      chart.remove();
      chartApi.current = null;
      candleSeries.current = null;
      vwapSeries.current = null;
      emaSeries.current = null;
      markersRef.current = null;
      lastDataWindowRef.current = ""; // Force a full setData() when the chart instance is recreated
    };
  }, [hasCandles, height, themeMode]);

  useEffect(() => {
    if (!candleSeries.current) return;
    
    // Calculate indicators dynamically
    const vwapData = calculateVWAP(chartData);
    const emaData = calculateEMA(chartData, 20); // 20 EMA
    const hasSideFilter = Boolean(showLongSignals || showShortSignals);
    const signals = showSignals
      ? calculateSignals(chartData, emaData, vwapData).filter((marker) => {
        const label = String(marker?.text || "").toUpperCase();
        if (label === "LONG") return !hasSideFilter || showLongSignals;
        if (label === "SHORT") return !hasSideFilter || showShortSignals;
        return true;
      })
      : [];

    if (lastDataWindowRef.current !== dataWindowKey || lastShowVWAPRef.current !== showVWAP) {
      candleSeries.current.setData(chartData);
      markersRef.current?.setMarkers(signals);
      vwapSeries.current?.setData(showVWAP ? vwapData : []);
      emaSeries.current?.setData(emaData.filter(d => d.value !== null));
      lastDataWindowRef.current = dataWindowKey;
      lastShowVWAPRef.current = showVWAP;
    } else if (chartData.length > 0) {
      candleSeries.current.update(chartData[chartData.length - 1]);
      markersRef.current?.setMarkers(signals); // Update markers on tick
      if (vwapData.length > 0 && showVWAP) vwapSeries.current?.update(vwapData[vwapData.length - 1]);
      if (emaData.length > 0 && emaData[emaData.length - 1].value !== null) {
        emaSeries.current?.update(emaData[emaData.length - 1]);
      }
    }

    if (fittedWindowRef.current !== dataWindowKey || lastShowZonesRef.current !== showZones) {
      chartApi.current?.timeScale().fitContent();
      fittedWindowRef.current = dataWindowKey;
      lastShowZonesRef.current = showZones;

      // Calculate dynamic Support/Resistance Zones (only recompute on new window bounds)
      const dynamicZones = calculateSupportResistance(chartData);
      
      const combinedLevels = showZones
        ? [
          ...(levels || []),
          ...dynamicZones.map(z => ({
            price: z.price,
            tone: z.type.toLowerCase(),
            label: `${z.type} (x${z.strength})`,
          })),
        ]
        : [];

      // Draw horizontal lines for the zones
      priceLines.current.forEach((line) => {
        try {
          candleSeries.current.removePriceLine(line);
        } catch {
          // Ignore stale line handles.
        }
      });
      priceLines.current = combinedLevels
        .filter((level) => isNum(level?.price))
        .slice(0, 15)
        .map((level) => candleSeries.current.createPriceLine({
          price: Number(level.price),
          color: level.tone === "support" ? "#059669" : level.tone === "resistance" ? "#dc2626" : "#d97706",
          lineWidth: level.strength > 2 ? 3 : 2, // Thicker line for high confluence
          lineStyle: level.strength > 2 ? 0 : 2, // Solid if strong, dashed if weak
          axisLabelVisible: true,
          title: level.label || "",
        }));
    }
  }, [chartData, dataWindowKey, levels, showSignals, showLongSignals, showShortSignals, showVWAP, showZones]);

  const timerLineRef = useRef(null);

  useEffect(() => {
    const displayTimeLeft = hasCountdown ? timeLeft : "";
    if (!candleSeries.current || !displayTimeLeft || !hasCandles) return;
    try {
      if (timerLineRef.current) {
        candleSeries.current.removePriceLine(timerLineRef.current);
      }
      const lastPrice = clean[clean.length - 1]?.close || 0;
      timerLineRef.current = candleSeries.current.createPriceLine({
        price: lastPrice,
        color: "transparent",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: displayTimeLeft,
      });
    } catch {
      // Ignore timer line cleanup races.
    }
    return () => {
      try {
        if (timerLineRef.current && candleSeries.current) {
          candleSeries.current.removePriceLine(timerLineRef.current);
        }
      } catch {
        // Ignore timer line cleanup races.
      }
      timerLineRef.current = null;
    };
  }, [hasCountdown, timeLeft, clean, hasCandles]);

  if (!hasCandles) {
    return (
      <div className="real-chart-empty">
        <b>Real Fyers chart unavailable</b>
        <span>Open Token and refresh Fyers login if this stays blank.</span>
      </div>
    );
  }

  return (
    <div className={`real-chart-wrap ${compact ? "compact" : ""}`}>
      <div className="real-chart-toolbar">
        <div>
          <span>{title}</span>
          <b><DirectionValue value={move}>{formatPrice(last.close)}</DirectionValue></b>
        </div>
        <div className="real-chart-meta">
          <span>{formatResolutionLabel(resolution)}</span>
          {sourceLabel ? <span>{sourceLabel}</span> : null}
          <span>{clean.length} candles</span>
          <span>LTP {formatPrice(livePrice)}</span>
          <span>Updated {updatedAt || "-"}</span>
          <span>O {formatPrice(last.open)}</span>
          <span>H {formatPrice(last.high)}</span>
          <span>L {formatPrice(last.low)}</span>
          <span>C {formatPrice(last.close)}</span>
        </div>
      </div>
      <div className="fyers-full-chart" style={{ height }} ref={chartEl} />
    </div>
  );
}

function getTradingViewUrl(symbol) {
  const tvSymbol = TRADINGVIEW_SYMBOLS[symbol] || "NSE:NIFTY";
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
}

function TradingViewLaunchPanel({ symbol }) {
  const tvSymbol = TRADINGVIEW_SYMBOLS[symbol] || "NSE:NIFTY";
  return (
    <div className="tradingview-launch-panel">
      <div>
        <b>Open exact TradingView chart</b>
        <span>TradingView blocks this NSE symbol inside embedded widgets and may fall back to another stock. Open it directly on TradingView for the correct chart.</span>
      </div>
      <Button type="primary" href={getTradingViewUrl(symbol)} target="_blank" rel="noreferrer">
        Open {tvSymbol}
      </Button>
    </div>
  );
}

function MarketNewsPanel({ news = {}, loading = false }) {
  const items = Array.isArray(news?.items) ? news.items : [];
  const error = news?.error || "";
  const formatNewsDate = (value) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <SectionCard
      title="Top News"
      icon={<BarChartOutlined />}
      extra={
        loading
          ? <Spin size="small" />
          : items.length
            ? <a className="news-view-all" href={items[0]?.link} target="_blank" rel="noreferrer">View All</a>
            : <Tag color="warning">No feed</Tag>
      }
      className="news-card"
    >
      {items.length ? (
        <div className="news-panel">
          <div className="news-list">
            {items.slice(0, 8).map((item, index) => {
              const tone = String(item?.tone || "Watch").toLowerCase();
              const impact = String(item?.impact || "Watch").toLowerCase();
              return (
                <a
                  className={`news-row ${tone} ${impact}`}
                  href={item?.link}
                  target="_blank"
                  rel="noreferrer"
                  key={`${item?.title}-${index}`}
                >
                  <span className="news-dot" />
                  <span className="news-copy">
                    <strong>{item?.title}</strong>
                    <small>{formatNewsDate(item?.published) || news?.timestamp || "-"} — {item?.source || "News"}</small>
                  </span>
                </a>
              );
            })}
          </div>
          <div className="news-nav" aria-hidden="true">
            <button type="button">‹</button>
            <button type="button">›</button>
          </div>
        </div>
      ) : (
        <div className="news-empty">
          <b>News feed is not active.</b>
          <span>{error || "Backend did not return headlines yet. Restart the launcher/backend if this stays blank after refresh."}</span>
        </div>
      )}
    </SectionCard>
  );
}

function getMoverSeries(row = {}, changeKey = "change_pct") {
  const change = asNum(row?.[changeKey] ?? row?.change_pct, 0);
  const wobble = Math.max(0.12, Math.abs(change) * 0.18);
  if (change >= 0) return [0, change * 0.16, change * 0.34 - wobble, change * 0.58, change * 0.82 - wobble * 0.35, change];
  return [0, change * 0.14, change * 0.3 + wobble, change * 0.55, change * 0.78 + wobble * 0.35, change];
}

function MoverListCard({ title, items = [], changeKey = "change_pct", positive = true }) {
  const tone = positive ? "up" : "down";
  return (
    <Card className="pro-card mover-list-card" title={<h3 className="section-title"><LineChartOutlined />{title}</h3>} extra={<Tag color={positive ? "success" : "error"}>{items.length}</Tag>}>
      {items.length ? (
        <div className="mover-list">
          {items.slice(0, 6).map((item, index) => {
            const change = asNum(item?.[changeKey] ?? item?.change_pct, 0);
            return (
              <div className="mover-row" key={`${title}-${item?.symbol}-${index}`}>
                <div className="mover-symbol">
                  <span className={`mover-avatar ${tone}`}>{String(item?.symbol || "?").slice(0, 1)}</span>
                  <b>{item?.symbol || "-"}</b>
                </div>
                <CommandSparkline values={getMoverSeries(item, changeKey)} tone={tone} area />
                <div className="mover-price">
                  <b>{formatPrice(item?.ltp)}</b>
                  <span className={positive ? "change-up" : "change-down"}>{formatPct(change)} <DirectionIcon value={change} /></span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No movers available yet" />
      )}
    </Card>
  );
}

function OiActionCard({ title, items = [], positive = true }) {
  return (
    <Card className="pro-card oi-action-card" title={<h3 className="section-title"><BarChartOutlined />{title}</h3>} extra={<Tag color={positive ? "success" : "error"}>{items.length}</Tag>}>
      {items.length ? (
        <div className="oi-action-list">
          {items.slice(0, 6).map((item, index) => {
            const oiChange = asNum(item?.oiChange, 0);
            const pct = asNum(item?.actionChangePct ?? item?.change_pct, 0);
            const width = Math.min(100, Math.max(8, Math.abs(oiChange) / Math.max(1, Math.abs(asNum(items[0]?.oiChange, 1))) * 100));
            return (
              <div className="oi-action-row" key={`${title}-${item?.symbol}-${index}`}>
                <b>{item?.symbol || "-"}</b>
                <div className="oi-action-bar"><span className={positive ? "up" : "down"} style={{ width: `${width}%` }} /></div>
                <span><DirectionValue value={pct}>{formatPct(pct)}</DirectionValue> | OI {formatCompactInt(oiChange)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="oi-action-empty">
          <b>Stock futures OI not received</b>
          <span>Token/feed must return current-month futures OI change for this block.</span>
        </div>
      )}
    </Card>
  );
}

function MarketMoversPreview({ foBreadth = {}, onOpen }) {
  const gainers = Array.isArray(foBreadth?.topAdvancers) ? foBreadth.topAdvancers : [];
  const losers = Array.isArray(foBreadth?.topDecliners) ? foBreadth.topDecliners : [];
  const oi = foBreadth?.oiAction || {};
  const topGain = gainers[0];
  const topLoss = losers[0];
  const longBuild = Array.isArray(oi?.longBuildUp) ? oi.longBuildUp[0] : null;
  const shortBuild = Array.isArray(oi?.shortBuildUp) ? oi.shortBuildUp[0] : null;

  return (
    <Card
      className="pro-card movers-launch-card clickable-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen?.(event); }}
      styles={{ body: { padding: 12 } }}
    >
      <div className="movers-launch-head">
        <div>
          <span className="command-eyebrow">F&O Stock Action</span>
          <h3>Gainers, losers and OI action</h3>
          <p>{foBreadth?.label || "F&O breadth feed"} | {formatInt(foBreadth?.quotedTotal)} quoted</p>
        </div>
        <Button size="small" type="primary">Open Details</Button>
      </div>
      <div className="movers-launch-grid">
        <MetricTile label="Top Gainer" value={topGain?.symbol || "-"} sub={formatPct(topGain?.change_pct)} tone="up" />
        <MetricTile label="Top Loser" value={topLoss?.symbol || "-"} sub={formatPct(topLoss?.change_pct)} tone="down" />
        <MetricTile label="Long Build" value={longBuild?.symbol || "-"} sub={isNum(longBuild?.oiChange) ? `OI ${formatCompactInt(longBuild.oiChange)}` : "OI collecting"} tone="up" />
        <MetricTile label="Short Build" value={shortBuild?.symbol || "-"} sub={isNum(shortBuild?.oiChange) ? `OI ${formatCompactInt(shortBuild.oiChange)}` : "OI collecting"} tone="down" />
      </div>
    </Card>
  );
}

function MarketMoversPage({ foBreadth = {}, onBack }) {
  const gainers = Array.isArray(foBreadth?.topAdvancers) ? foBreadth.topAdvancers : [];
  const losers = Array.isArray(foBreadth?.topDecliners) ? foBreadth.topDecliners : [];
  const intradayGainers = Array.isArray(foBreadth?.topIntradayGainers) ? foBreadth.topIntradayGainers : gainers;
  const intradayLosers = Array.isArray(foBreadth?.topIntradayLosers) ? foBreadth.topIntradayLosers : losers;
  const oi = foBreadth?.oiAction || {};

  return (
    <div className="movers-page">
      <Card className="pro-card movers-page-hero" styles={{ body: { padding: 14 } }}>
        <div>
          <span className="command-eyebrow">F&O and NSE Stock Action</span>
          <h2>Stock Action Board</h2>
          <p>
            {foBreadth?.official ? "NSE F&O universe" : foBreadth?.label || "F&O proxy"} |
            Coverage {formatNum(foBreadth?.coveragePct, 0)}% |
            A/D {formatInt(foBreadth?.advances)} / {formatInt(foBreadth?.declines)} |
            Futures {formatInt(oi?.futureQuoteCount)} / {formatInt(oi?.requestedCount)} |
            OI rows {formatInt(oi?.availableCount)}
          </p>
        </div>
        <Button icon={<HomeOutlined />} onClick={onBack}>Dashboard</Button>
      </Card>

      <div className="movers-board-grid">
        <MoverListCard title="Top Gainers" items={gainers} positive />
        <MoverListCard title="Top Losers" items={losers} positive={false} />
        <MoverListCard title="Top Intraday Gainers" items={intradayGainers} changeKey="intraday_change_pct" positive />
        <MoverListCard title="Top Intraday Losers" items={intradayLosers} changeKey="intraday_change_pct" positive={false} />
      </div>

      <div className="movers-board-grid">
        <OiActionCard title="Long Build Up" items={oi?.longBuildUp || []} positive />
        <OiActionCard title="Short Build Up" items={oi?.shortBuildUp || []} positive={false} />
        <OiActionCard title="Short Covering" items={oi?.shortCovering || []} positive />
        <OiActionCard title="Long Unwinding" items={oi?.longUnwinding || []} positive={false} />
      </div>
    </div>
  );
}

function getLevelStatus({ price, support, resistance, pivot, vwap }) {
  const p = asNum(price, null);
  if (!isNum(p)) return { label: "No live price", tone: "warn", detail: "Waiting for price" };

  const distances = [
    isNum(support) ? { type: "support", level: support, distance: p - Number(support) } : null,
    isNum(resistance) ? { type: "resistance", level: resistance, distance: Number(resistance) - p } : null,
    isNum(pivot) ? { type: "pivot", level: pivot, distance: Math.abs(p - Number(pivot)) } : null,
    isNum(vwap) ? { type: "vwap", level: vwap, distance: Math.abs(p - Number(vwap)) } : null,
  ].filter(Boolean).sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));

  const nearest = distances[0];
  const threshold = p > 50000 ? 80 : 25;
  const tight = nearest && Math.abs(nearest.distance) <= threshold;
  const aboveVwap = isNum(vwap) ? p >= Number(vwap) : null;

  if (isNum(resistance) && p > Number(resistance)) {
    return { label: "Resistance Break", tone: "pass", detail: `${formatPrice(resistance)} crossed` };
  }
  if (isNum(support) && p < Number(support)) {
    return { label: "Support Break", tone: "fail", detail: `${formatPrice(support)} crossed` };
  }
  if (tight && nearest.type === "resistance") {
    return { label: "Near Resistance", tone: "warn", detail: `${formatNum(nearest.distance, 0)} pts away` };
  }
  if (tight && nearest.type === "support") {
    return { label: "Near Support", tone: "warn", detail: `${formatNum(nearest.distance, 0)} pts away` };
  }
  if (tight && nearest.type === "pivot") {
    return { label: "Near Pivot", tone: "warn", detail: `${formatNum(nearest.distance, 0)} pts away` };
  }
  if (aboveVwap === true) return { label: "Above VWAP", tone: "pass", detail: `VWAP ${formatPrice(vwap)}` };
  if (aboveVwap === false) return { label: "Below VWAP", tone: "fail", detail: `VWAP ${formatPrice(vwap)}` };
  return { label: "Between Levels", tone: "neutral", detail: nearest ? `${formatPrice(nearest.level)} nearest` : "No level nearby" };
}

function PcrOiTrackerCard({ setups = [], cards = {}, pcrHistory = {}, selectedSymbol = "", onOpenPcr }) {
  const [localSymbol, setLocalSymbol] = useState("ALL");
  const activeSymbol = selectedSymbol && INDEXES.includes(selectedSymbol)
    ? selectedSymbol
    : localSymbol === "ALL" || INDEXES.includes(localSymbol)
      ? localSymbol
      : "ALL";
  const visibleSymbols = activeSymbol === "ALL" ? INDEXES : [activeSymbol];
  const setupMap = setups.reduce((acc, item) => {
    if (item?.symbol) acc[item.symbol] = item;
    return acc;
  }, {});
  const rows = visibleSymbols.map((item) => {
    const setup = setupMap[item] || {};
    const analytics = setup?.analytics || cards?.[item]?.analytics || {};
    const pcrTrack = getPcrTracker(pcrHistory, item, analytics?.pcr ?? setup?.pcr);
    const option = setup?.option || {};
    const oiFlow = analytics?.smartOIFlow || {};
    const oiTotals = setup?.oiTotals || {};
    const callOi = asNum(oiTotals.callOi, null);
    const putOi = asNum(oiTotals.putOi, null);
    const oiChange = asNum(oiTotals.putOiChange, 0) - asNum(oiTotals.callOiChange, 0);
    const pcrDirection = pcrTrack.delta1h ?? pcrTrack.delta15m ?? pcrTrack.delta;
    return {
      symbol: item,
      label: INDEX_LABELS[item] || item,
      setup,
      analytics,
      pcrTrack,
      option,
      oiFlow,
      oiTotals,
      callOi,
      putOi,
      oiChange,
      pcrDirection,
      tone: pcrTrack.trendLabel === "Rising" ? "green" : pcrTrack.trendLabel === "Falling" ? "red" : "amber",
    };
  });
  const primary = rows[0] || {};
  const isAll = activeSymbol === "ALL";
  const pcrNumbers = rows.map((row) => row?.pcrTrack?.current).filter(isNum).map(Number);
  const pcrDirectionNumbers = rows.map((row) => row?.pcrDirection).filter(isNum).map(Number);
  const titlePcr = pcrNumbers.length ? formatNum(pcrNumbers.reduce((sum, value) => sum + value, 0) / pcrNumbers.length, 2) : "-";
  const pcrDirection = pcrDirectionNumbers.length ? pcrDirectionNumbers.reduce((sum, value) => sum + value, 0) / pcrDirectionNumbers.length : null;
  const callOi = rows.reduce((sum, row) => sum + asNum(row?.callOi, 0), 0);
  const putOi = rows.reduce((sum, row) => sum + asNum(row?.putOi, 0), 0);
  const oiChange = rows.reduce((sum, row) => sum + asNum(row?.oiChange, 0), 0);
  const pcrValues = isAll
    ? rows.map((row) => row?.pcrTrack?.current).filter(isNum)
    : getHistorySeries(pcrHistory, activeSymbol).map((row) => row.value);
  const tone = isAll
    ? pcrDirection > 0.02
      ? "green"
      : pcrDirection < -0.02
        ? "red"
        : "amber"
    : primary?.tone || "amber";
  const option = primary?.option || {};

  return (
    <div className={`command-tile pcr-oi-card ${tone}`}>
      <div className="command-tile-top">
        <div>
          <span className="command-eyebrow">PCR & OI Tracker</span>
          <h3>{isAll ? "ALL INDEX PCR" : `${INDEX_LABELS[activeSymbol] || activeSymbol} PCR`} <DirectionValue value={pcrDirection}>{titlePcr}</DirectionValue></h3>
          <p>{isAll ? "NIFTY | BANKNIFTY | SENSEX OI Flow" : `${primary?.pcrTrack?.biasLabel || "Balanced"} | ${primary?.oiFlow?.label || "OI flow collecting"}`}</p>
        </div>
        <Space size={6}>
          <Select
            size="small"
            value={activeSymbol}
            className="pcr-oi-select"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(value) => setLocalSymbol(value)}
            options={INDEX_SELECT_OPTIONS}
          />
          <Button size="small" onClick={(event) => {
            event.stopPropagation();
            onOpenPcr?.(activeSymbol);
          }}>Detail</Button>
        </Space>
      </div>

      <CommandSparkline
        values={pcrValues.length > 1 ? pcrValues : [0.78, 0.84, 0.91, titlePcr, primary?.pcrTrack?.current].filter(isNum)}
        tone={tone === "green" ? "up" : tone === "red" ? "down" : "flat"}
      />

      {isAll ? (
        <div className="pcr-all-grid">
          {rows.map((row) => (
            <div
              className={`pcr-all-row ${row.tone} ${onOpenPcr ? "clickable-card" : ""}`}
              key={row.symbol}
              role={onOpenPcr ? "button" : undefined}
              tabIndex={onOpenPcr ? 0 : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onOpenPcr?.(row.symbol);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.stopPropagation();
                onOpenPcr?.(row.symbol);
              }}
            >
              <strong>{row.label}</strong>
              <span><DirectionValue value={row.pcrDirection}>{formatNum(row?.pcrTrack?.current, 2)}</DirectionValue></span>
              <span><DirectionValue value={row?.oiTotals?.putOiChange}>{formatCompactInt(row.putOi)}</DirectionValue> Put OI</span>
              <span><DirectionIcon value={row.oiChange} />{formatCompactInt(row.oiChange)} Net OI</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="command-stat-grid">
          <div className="command-stat red">
            <strong><DirectionValue value={pcrDirection}>{titlePcr}</DirectionValue></strong>
            <span>PCR</span>
          </div>
          <div className="command-stat blue">
            <strong><DirectionIcon value={primary?.pcrTrack?.delta1h ?? primary?.pcrTrack?.delta15m} />{primary?.pcrTrack?.changeLabel || "-"}</strong>
            <span>PCR Chg</span>
          </div>
          <div className="command-stat green">
            <strong><DirectionValue value={primary?.oiTotals?.putOiChange}>{formatCompactInt(putOi)}</DirectionValue></strong>
            <span>Put OI</span>
          </div>
          <div className="command-stat red">
            <strong><DirectionValue value={primary?.oiTotals?.callOiChange}>{formatCompactInt(callOi)}</DirectionValue></strong>
            <span>Call OI</span>
          </div>
          <div className={oiChange >= 0 ? "command-stat green" : "command-stat red"}>
            <strong><DirectionIcon value={oiChange} />{formatCompactInt(oiChange)}</strong>
            <span>Net OI Chg</span>
          </div>
          <div className="command-stat amber">
            <strong><DirectionValue value={option?.oiChange}>{formatCompactInt(option?.oi)}</DirectionValue></strong>
            <span>Strike OI</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PcrDetailPage({ setups = [], cards = {}, pcrHistory = {}, selectedSymbol = "", onSymbolChange, onBack }) {
  const activeSymbol = selectedSymbol && INDEXES.includes(selectedSymbol) ? selectedSymbol : "ALL";
  const [pcrInterval, setPcrInterval] = useState(5);

  const setupMap = setups.reduce((acc, item) => {
    if (item?.symbol) acc[item.symbol] = item;
    return acc;
  }, {});
  const rows = INDEXES.map((item) => {
    const setup = setupMap[item] || {};
    const analytics = setup?.analytics || cards?.[item]?.analytics || {};
    const currentPcr = analytics?.pcr ?? setup?.pcr;
    const tracker = getPcrTracker(pcrHistory, item, currentPcr);
    const five = getPcrWindowStats(pcrHistory, item, tracker.current, 5);
    const fifteen = getPcrWindowStats(pcrHistory, item, tracker.current, 15);
    const oiTotals = setup?.oiTotals || {};
    const liveSnapshot = makePcrLiveSnapshot(item, setup, cards?.[item] || {});
    const netOi = asNum(oiTotals.putOiChange, 0) - asNum(oiTotals.callOiChange, 0);
    const tone = tracker.current >= 1.15 ? "support" : tracker.current <= 0.85 ? "pressure" : "balanced";
    const fiveRows = getPcrIntradayRows(pcrHistory, item, liveSnapshot, 5);
    const fifteenRows = getPcrIntradayRows(pcrHistory, item, liveSnapshot, 15);
    const intradayRows = pcrInterval === 15 ? fifteenRows : fiveRows;
    return {
      symbol: item,
      label: INDEX_LABELS[item] || item,
      setup,
      tracker,
      five,
      fifteen,
      netOi,
      putOi: oiTotals.putOi,
      callOi: oiTotals.callOi,
      liveSnapshot,
      intradayRows,
      tableFreshness: getPcrTableFreshness(intradayRows, pcrInterval),
      fiveFreshness: getPcrTableFreshness(fiveRows, 5),
      fifteenFreshness: getPcrTableFreshness(fifteenRows, 15),
      tone,
    };
  });
  const visibleRows = activeSymbol === "ALL" ? rows : rows.filter((row) => row.symbol === activeSymbol);
  const avgPcrValues = visibleRows.map((row) => row.tracker.current).filter(isNum);
  const avgPcr = avgPcrValues.length ? avgPcrValues.reduce((sum, value) => sum + value, 0) / avgPcrValues.length : null;
  const avg5 = visibleRows.map((row) => row.five.delta).filter(isNum);
  const avg15 = visibleRows.map((row) => row.fifteen.delta).filter(isNum);
  const totalNetOi = visibleRows.reduce((sum, row) => sum + asNum(row.netOi, 0), 0);
  const avg5Delta = avg5.length ? avg5.reduce((sum, value) => sum + value, 0) / avg5.length : null;
  const avg15Delta = avg15.length ? avg15.reduce((sum, value) => sum + value, 0) / avg15.length : null;

  return (
    <div className="pcr-detail-page">
      <Card className="pro-card pcr-detail-hero" styles={{ body: { padding: 16 } }}>
        <div className="pcr-detail-head">
          <div>
            <span className="command-eyebrow">Intraday PCR Data</span>
            <h2>{activeSymbol === "ALL" ? "All Index PCR Table" : `${INDEX_LABELS[activeSymbol] || activeSymbol} PCR Table`}</h2>
            <p>Records one clean PCR row per {pcrInterval}-minute bucket to avoid noisy one-minute false signals.</p>
          </div>
          <Space wrap>
            <Segmented
              size="small"
              value={pcrInterval}
              onChange={setPcrInterval}
              options={PCR_TABLE_INTERVALS.map((item) => ({ label: `${item}m`, value: item }))}
            />
            <Select
              value={activeSymbol}
              style={{ width: 150 }}
              onChange={(value) => {
                onSymbolChange?.(value);
              }}
              options={INDEX_SELECT_OPTIONS}
            />
            <Button icon={<HomeOutlined />} onClick={onBack}>Dashboard</Button>
          </Space>
        </div>
        <div className="pcr-detail-summary">
          <MetricTile label="Current PCR" value={formatNum(avgPcr, 2)} sub={activeSymbol === "ALL" ? "Average of selected indices" : "Selected index"} />
          <MetricTile label="5m Change" value={<DirectionValue value={avg5Delta}>{isNum(avg5Delta) ? `${avg5Delta >= 0 ? "+" : ""}${formatNum(avg5Delta, 2)}` : "-"}</DirectionValue>} sub="Fast pressure" />
          <MetricTile label="15m Change" value={<DirectionValue value={avg15Delta}>{isNum(avg15Delta) ? `${avg15Delta >= 0 ? "+" : ""}${formatNum(avg15Delta, 2)}` : "-"}</DirectionValue>} sub="Confirmation" />
          <MetricTile label="Net OI Change" value={<DirectionValue value={totalNetOi}>{formatCompactInt(totalNetOi)}</DirectionValue>} sub="Put minus call change" />
        </div>
      </Card>

      <div className="pcr-table-stack">
        {visibleRows.map((row) => (
          <Card className={`pro-card pcr-table-card ${row.tone}`} key={row.symbol} styles={{ body: { padding: 0 } }}>
            <div className="pcr-table-title">
              <div>
                <span>INTRADAY DATA</span>
                <b>{row.label} {pcrInterval}m PCR {formatNum(row.tracker.current, 2)}</b>
              </div>
              <Space size={6} wrap>
                <Tag color={row.tableFreshness?.tone || "default"}>Last {row.tableFreshness?.lastLabel || "-"}</Tag>
                <Tag color={row.tableFreshness?.tone || "default"}>Age {row.tableFreshness?.ageLabel || "-"}</Tag>
                <Tag color="default">Rows {row.tableFreshness?.rows || 0}</Tag>
                <Tag color={row.fiveFreshness?.tone || "default"}>{row.fiveFreshness?.label || "5m Collect"}</Tag>
                <Tag color={row.fifteenFreshness?.tone || "default"}>{row.fifteenFreshness?.label || "15m Collect"}</Tag>
                <Tag color={row.five.delta > 0 ? "success" : row.five.delta < 0 ? "error" : "default"}>5m {row.five.label}</Tag>
                <Tag color={row.fifteen.delta > 0 ? "success" : row.fifteen.delta < 0 ? "error" : "default"}>15m {row.fifteen.label}</Tag>
              </Space>
            </div>
            <div className="pcr-intraday-table-wrap">
              <table className="pcr-intraday-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Call</th>
                    <th>Put</th>
                    <th>Diff</th>
                    <th>PCR</th>
                    <th>PCR Bias</th>
                    <th>VWAP</th>
                    <th>Price</th>
                    <th>VWAP Bias</th>
                    <th>Final Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {row.intradayRows.length ? row.intradayRows.map((item) => {
                    const pcrBias = getPcrBiasSide(item);
                    const vwapBias = getPcrVwapSide(item);
                    const finalSignal = getPcrCombinedSignal(item);
                    const hasValidVwap = isNum(item.price) && isNum(item.vwap) && Number(item.vwap) > 0;
                    const priceVsVwap = hasValidVwap ? Number(item.price) - Number(item.vwap) : null;
                    const signalClass = (signal) => signal === "WAIT" || signal.startsWith("WAIT")
                      ? "pcr-wait-cell"
                      : signal.includes("CE")
                        ? "pcr-buy-cell"
                        : signal.includes("PE")
                          ? "pcr-sell-cell"
                          : "";
                    const pcrBiasClass = pcrBias === "CE" ? "pcr-buy-cell" : pcrBias === "PE" ? "pcr-sell-cell" : "";
                    const vwapBiasClass = vwapBias === "CE" ? "pcr-buy-cell" : vwapBias === "PE" ? "pcr-sell-cell" : "";
                    const finalSignalClass = signalClass(finalSignal);
                    return (
                      <tr key={`${row.symbol}-${item.ts}`}>
                        <td>{item.timeLabel}</td>
                        <td>{formatInt(item.callOi)}</td>
                        <td>{formatInt(item.putOi)}</td>
                        <td className={Number(item.diff || 0) >= 0 ? "pcr-buy-cell" : "pcr-sell-cell"}>{formatInt(item.diff)}</td>
                        <td className="pcr-focus-cell">{formatNum(item.pcr, 2)}</td>
                        <td className={pcrBiasClass}>{getPcrBiasLabel(pcrBias)}</td>
                        <td>{formatPrice(item.vwap)}</td>
                        <td className={hasValidVwap ? Number(priceVsVwap) >= 0 ? "pcr-buy-cell" : "pcr-sell-cell" : ""}>{formatPrice(item.price)}</td>
                        <td className={vwapBiasClass}>{getPcrBiasLabel(vwapBias)}</td>
                        <td className={finalSignalClass}>{finalSignal}</td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={10}>Waiting for intraday PCR ticks</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GateHistoryPage({ gateHistory = [], selectedSymbol = "ALL", onSymbolChange, onBack }) {
  const activeSymbol = selectedSymbol && INDEXES.includes(selectedSymbol) ? selectedSymbol : "ALL";
  const [filterMode, setFilterMode] = useState("ALL");
  const sortedRows = useMemo(() => [...(gateHistory || [])].filter(Boolean).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)), [gateHistory]);
  const filteredRows = useMemo(() => sortedRows.filter((row) => {
    if (activeSymbol !== "ALL" && row.symbol !== activeSymbol) return false;
    if (filterMode === "READY") return row.decision === "READY";
    if (filterMode === "HIDE_AVOID") return row.decision !== "AVOID";
    if (filterMode === "SCORE70") return asNum(row.score, 0) >= 70;
    return true;
  }), [activeSymbol, filterMode, sortedRows]);
  const readyCount = filteredRows.filter((row) => row.decision === "READY").length;
  const avoidCount = filteredRows.filter((row) => row.decision === "AVOID").length;
  const waitCount = filteredRows.filter((row) => row.decision === "WAIT").length;
  const avgScore = filteredRows.length
    ? filteredRows.reduce((sum, row) => sum + asNum(row.score, 0), 0) / filteredRows.length
    : 0;
  const exportGateHistory = () => {
    const headers = [
      "time", "symbol", "label", "spot", "side", "strike", "decision", "score", "total",
      "setupScore", "setupTotal", "entryScore", "entryTotal", "tone", "reason", "freshness",
      "pcr", "vwap", "timeframe", "fifteenTrend", "dailyTrend", "volume",
    ];
    const escapeCsv = (value) => {
      if (Array.isArray(value)) return escapeCsv(value.join(" | "));
      if (value === null || value === undefined) return "";
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [
      headers.join(","),
      ...filteredRows.map((row) => headers.map((header) => escapeCsv(row?.[header])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `professional-gate-history-${filterMode.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const columns = [
    {
      title: "Time",
      dataIndex: "time",
      width: 132,
      render: (_, row) => formatReportTime(row.time || row.ts),
    },
    {
      title: "Symbol",
      dataIndex: "symbol",
      width: 110,
      render: (_, row) => row.label || INDEX_LABELS[row.symbol] || row.symbol || "-",
    },
    {
      title: "Strike",
      key: "strike",
      width: 112,
      render: (_, row) => row.side ? `${formatPrice(row.strike)} ${row.side}` : "-",
    },
    {
      title: "Decision",
      dataIndex: "decision",
      width: 104,
      render: (value) => <Tag color={value === "READY" || value === "TRAIL" ? "success" : value === "AVOID" ? "error" : "warning"}>{value || "-"}</Tag>,
    },
    {
      title: "Score",
      key: "score",
      width: 84,
      render: (_, row) => `${formatNum(row.score, 0)}/${formatNum(row.total, 0)}`,
    },
    {
      title: "Setup",
      key: "setup",
      width: 84,
      render: (_, row) => `${formatNum(row.setupScore, 0)}/${formatNum(row.setupTotal, 0)}`,
    },
    {
      title: "Entry",
      key: "entry",
      width: 84,
      render: (_, row) => `${formatNum(row.entryScore, 0)}/${formatNum(row.entryTotal, 0)}`,
    },
    {
      title: "Freshness",
      dataIndex: "freshness",
      width: 190,
      render: (value) => value || "-",
    },
    {
      title: "Reason",
      dataIndex: "reason",
      render: (value, row) => value || row.actionReason || "-",
    },
  ];

  return (
    <div className="gate-history-page">
      <Card className="pro-card gate-history-hero" styles={{ body: { padding: 16 } }}>
        <div className="gate-history-head">
          <div>
            <span className="command-eyebrow">Professional Trade Gate</span>
            <h2>{activeSymbol === "ALL" ? "Signal History" : `${INDEX_LABELS[activeSymbol] || activeSymbol} Gate History`}</h2>
            <p>Review every saved gate decision with score, reason, data freshness, and export-ready rows.</p>
          </div>
          <Space wrap>
            <Segmented
              size="small"
              value={filterMode}
              onChange={setFilterMode}
              options={[
                { label: "Show All", value: "ALL" },
                { label: "Only READY", value: "READY" },
                { label: "Hide AVOID", value: "HIDE_AVOID" },
                { label: "Min 70", value: "SCORE70" },
              ]}
            />
            <Select
              value={activeSymbol}
              style={{ width: 150 }}
              onChange={(value) => onSymbolChange?.(value)}
              options={[
                { label: "All", value: "ALL" },
                ...INDEXES.map((item) => ({ label: INDEX_LABELS[item] || item, value: item })),
              ]}
            />
            <Button onClick={exportGateHistory}>Export CSV</Button>
            <Button icon={<HomeOutlined />} onClick={onBack}>Dashboard</Button>
          </Space>
        </div>
        <div className="gate-history-summary">
          <MetricTile label="Visible Rows" value={formatNum(filteredRows.length, 0)} sub={`${formatNum(gateHistory?.length || 0, 0)} saved total`} />
          <MetricTile label="READY" value={formatNum(readyCount, 0)} sub="Fresh trade candidates" />
          <MetricTile label="WAIT / AVOID" value={`${formatNum(waitCount, 0)} / ${formatNum(avoidCount, 0)}`} sub="Blocked or pending" />
          <MetricTile label="Avg Score" value={formatNum(avgScore, 0)} sub={filterMode === "ALL" ? "All visible rows" : filterMode} />
        </div>
      </Card>
      <Card className="pro-card gate-history-table-card" styles={{ body: { padding: 10 } }}>
        <Table
          size="small"
          rowKey={(row) => `${row.symbol}-${row.ts}-${row.decision}-${row.strike || ""}`}
          columns={columns}
          dataSource={filteredRows}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1180 }}
        />
      </Card>
    </div>
  );
}

function DailyReviewPage({ signalJournal = [], gateHistory = [], pcrHistory = {}, selectedSymbol = "ALL", onSymbolChange, onBack }) {
  const activeSymbol = selectedSymbol && INDEXES.includes(selectedSymbol) ? selectedSymbol : "ALL";
  const review = useMemo(
    () => buildDailyReviewReport(signalJournal, gateHistory, pcrHistory, activeSymbol),
    [activeSymbol, gateHistory, pcrHistory, signalJournal]
  );
  const summary = review.report.summary || {};
  const closedSignals = asNum(summary.targetHit, 0) + asNum(summary.stoplossHit, 0);
  const gateSummary = ["READY", "WAIT", "AVOID", "TRAIL"].map((decision) => ({
    decision,
    count: review.gateRows.filter((row) => row.decision === decision).length,
  }));
  const blockerColumns = [
    { title: "Reason", dataIndex: "reason", render: (value) => value || "-" },
    { title: "Count", dataIndex: "count", width: 90 },
  ];
  const signalColumns = [
    { title: "Time", dataIndex: "time", width: 126, render: (_, row) => formatShortTime(row.ts || row.time) },
    { title: "Symbol", dataIndex: "symbol", width: 110, render: (_, row) => row.label || INDEX_LABELS[row.symbol] || row.symbol || "-" },
    { title: "Strike", key: "strike", width: 110, render: (_, row) => `${formatPrice(row.strike)} ${row.side || ""}` },
    { title: "Gate", dataIndex: "professionalDecision", width: 92, render: (value) => <Tag color={value === "READY" || value === "TRAIL" ? "success" : value === "AVOID" ? "error" : "warning"}>{value || "-"}</Tag> },
    { title: "Score", key: "score", width: 84, render: (_, row) => formatNum(row.professionalScore ?? row.score, 0) },
    { title: "Outcome", key: "outcome", width: 128, render: (_, row) => row.outcome?.status || "-" },
    { title: "Note", key: "note", render: (_, row) => row.outcome?.note || row.professionalReason || row.reason || "-" },
  ];

  return (
    <div className="daily-review-page">
      <Card className={`pro-card daily-review-hero ${review.risk.tone}`} styles={{ body: { padding: 16 } }}>
        <div className="daily-review-head">
          <div>
            <span className="command-eyebrow">End-of-Day Review</span>
            <h2>{activeSymbol === "ALL" ? "Today Session Summary" : `${INDEX_LABELS[activeSymbol] || activeSymbol} Session Summary`}</h2>
            <p>Signals, gate decisions, target/SL outcome, PCR direction, and daily risk status for the current session.</p>
          </div>
          <Space wrap>
            <Select
              value={activeSymbol}
              style={{ width: 150 }}
              onChange={(value) => onSymbolChange?.(value)}
              options={[
                { label: "All", value: "ALL" },
                ...INDEXES.map((item) => ({ label: INDEX_LABELS[item] || item, value: item })),
              ]}
            />
            <Button icon={<HomeOutlined />} onClick={onBack}>Dashboard</Button>
          </Space>
        </div>
        <div className="risk-dashboard-strip">
          <div className={review.risk.tone}>
            <span>Risk Status</span>
            <b>{review.risk.label}</b>
            <small>{review.risk.flags.join(", ") || "Risk controls are within limits"}</small>
          </div>
          <div>
            <span>Trades</span>
            <b>{formatNum(summary.total, 0)} / {review.risk.maxTrades}</b>
            <small>Daily max trade guard</small>
          </div>
          <div>
            <span>SL Count</span>
            <b>{formatNum(summary.stoplossHit, 0)} / {review.risk.maxStoploss}</b>
            <small>Trailing losses {formatNum(review.risk.trailingLosses, 0)}</small>
          </div>
          <div>
            <span>Success</span>
            <b>{formatNum(summary.successRate, 1)}%</b>
            <small>{formatNum(closedSignals, 0)} closed signals</small>
          </div>
        </div>
        <div className="daily-review-summary">
          <MetricTile label="Target / SL" value={`${formatNum(summary.targetHit, 0)} / ${formatNum(summary.stoplossHit, 0)}`} sub={`Open ${formatNum(summary.open, 0)}, not testable ${formatNum(summary.notTestable, 0)}`} />
          <MetricTile label="Best Symbol" value={review.bestSymbol?.label || "-"} sub={review.bestSymbol ? `${formatNum(review.bestSymbol.successRate, 1)}% success` : "No closed signal"} />
          <MetricTile label="Worst Symbol" value={review.worstSymbol?.label || "-"} sub={review.worstSymbol ? `${formatNum(review.worstSymbol.stoplossHit, 0)} SL hit` : "No closed signal"} />
          <MetricTile label="Best Gate Trade" value={review.bestGateTrade ? `${formatPrice(review.bestGateTrade.strike)} ${review.bestGateTrade.side}` : "-"} sub={review.bestGateTrade?.outcome?.status || "No signal yet"} />
        </div>
      </Card>

      {(review.report?.signals?.length || 0) === 0 && (review.gateRows?.length || 0) === 0 ? (
        <Card className="pro-card" style={{ marginTop: 24 }}>
          <Empty description="No signals or gate history recorded yet. Keep the dashboard open during market hours to populate this report." />
        </Card>
      ) : (
        <>
          <div className="daily-review-grid">
            <Card className="pro-card" title="Professional Gate Counts" styles={{ body: { padding: 10 } }}>
              <div className="review-chip-grid">
                {gateSummary.map((row) => (
                  <span className={`review-chip ${row.decision.toLowerCase()}`} key={row.decision}>
                    {row.decision}<b>{formatNum(row.count, 0)}</b>
                  </span>
                ))}
              </div>
            </Card>
            <Card className="pro-card" title="PCR Direction" styles={{ body: { padding: 10 } }}>
              <div className="review-pcr-grid">
                {review.pcrSummary.map((row) => (
                  <span className={`review-pcr ${row.tone}`} key={row.symbol}>
                    <b>{row.label}</b>
                    <em>{formatNum(row.current, 2)} {isNum(row.delta) ? `(${row.delta >= 0 ? "+" : ""}${formatNum(row.delta, 2)})` : ""}</em>
                    <small>{row.direction} | Rows {formatNum(row.rows, 0)}</small>
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <div className="daily-review-tables">
            <Card className="pro-card" title="Common Blockers" styles={{ body: { padding: 10 } }}>
              <Table
                size="small"
                rowKey={(row) => row.reason}
                columns={blockerColumns}
                dataSource={review.blockers.slice(0, 10)}
                pagination={false}
              />
            </Card>
            <Card className="pro-card" title="Today Signals" styles={{ body: { padding: 10 } }}>
              <Table
                size="small"
                rowKey={(row) => `${row.symbol}-${row.ts}-${row.strike}-${row.side}`}
                columns={signalColumns}
                dataSource={(review.report.signals || []).slice().reverse()}
                pagination={{ pageSize: 8, showSizeChanger: false }}
                scroll={{ x: 980 }}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function CommandTile({ priority = "", tone = "blue", eyebrow, title, subtitle, badge, stats = [], progress, trendValues = [], actionLabel, onAction, onOpen, children }) {
  const progressValue = isNum(progress) ? Math.max(0, Math.min(100, Number(progress))) : null;
  const chartTone = tone === "green" || tone === "cyan" ? "up" : tone === "red" ? "down" : "flat";

  return (
    <div
      className={`command-tile ${tone} ${priority} ${onOpen ? "clickable-card" : ""}`}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen?.(event); }}
    >
      <div className="command-tile-top">
        <div>
          <span className="command-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {badge ? <span className="command-badge">{badge}</span> : null}
      </div>

      {priority !== "market" ? (
        <CommandSparkline values={trendValues.length ? trendValues : [35, 48, 44, 58, 54, progressValue].filter(isNum)} tone={chartTone} />
      ) : null}

      {priority === "market" && children ? <div className="command-inline-detail">{children}</div> : null}

      {stats.length ? (
        <div className="command-stat-grid">
          {stats.slice(0, 4).map((item) => (
            <div
              className={`command-stat ${item.tone || ""} ${onOpen ? "clickable-card" : ""}`}
              key={`${item.label}-${item.value}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpen?.(event);
              }}
            >
              <strong>
                <DirectionValue value={item.directionValue} tone={item.directionTone}>
                  {item.value}
                </DirectionValue>
              </strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {priority !== "market" ? children : null}

      {actionLabel ? (
        <Button type="primary" block onClick={(event) => {
          event.stopPropagation();
          onAction?.(event);
        }}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function FoBreadthDetail({ foBreadth = {}, visible = false, hasIndexBreadth = false, indexLabel = "-", indexDelta = 0 }) {
  if (!visible && !hasIndexBreadth) return null;
  const sourceLabel = foBreadth?.official ? "NSE F&O" : "F&O proxy";
  const sourceDetail = visible
    ? `${sourceLabel} data ${formatNum(foBreadth?.coveragePct, 0)}% ready`
    : "F&O breadth loading";
  const foLabel = `${formatInt(foBreadth?.advances)} up / ${formatInt(foBreadth?.declines)} down`;
  const indexText = String(indexLabel || "-").replace(" / ", " up / ");
  return (
    <div className="fo-breadth-wrap">
      <div className="fo-breadth-note">
        {visible ? `${sourceDetail}. NSE index basket is used only as confirmation.` : "Using NSE index basket A/D until F&O breadth loads."}
      </div>
      <div className="fo-breadth-strip">
        {visible ? (
          <>
            <span className="medium">
              <em>Data</em>
              <b>{formatNum(foBreadth?.coveragePct, 0)}%</b>
            </span>
            <span className="wide">
              <em>F&O Breadth</em>
              <b><DirectionValue value={foBreadth?.net}>{foLabel}</DirectionValue></b>
            </span>
          </>
        ) : null}
        {hasIndexBreadth ? (
          <span className="wide">
            <em>NSE Basket</em>
            <b><DirectionValue value={indexDelta}>{indexText.includes(" up / ") ? `${indexText} down` : indexText}</DirectionValue></b>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MarketGateSummary({ setups = [], marketScore = 50, breadthAdv = null, breadthDec = null, children }) {
  const decisions = setups.map((setup) => String(setup?.professionalGate?.decision || setup?.decision || "").toUpperCase());
  const readyCount = decisions.filter((item) => item.includes("READY")).length;
  const avoidCount = decisions.filter((item) => item.includes("AVOID")).length;
  const waitCount = Math.max(0, setups.length - readyCount - avoidCount);
  const ceCount = setups.filter((setup) => String(setup?.option?.side || setup?.displayOption?.side || "").toUpperCase() === "CE").length;
  const peCount = setups.filter((setup) => String(setup?.option?.side || setup?.displayOption?.side || "").toUpperCase() === "PE").length;
  const scores = setups.map((setup) => setup?.professionalGate?.score ?? setup?.score).filter(isNum).map(Number);
  const avgScore = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : marketScore;
  const sideBias = ceCount > peCount ? "CE Bias" : peCount > ceCount ? "PE Bias" : "Mixed";
  const breadthNet = isNum(breadthAdv) && isNum(breadthDec) ? Number(breadthAdv) - Number(breadthDec) : null;
  const action = readyCount
    ? `${readyCount} ready`
    : avoidCount >= Math.max(1, setups.length - 1)
      ? "Avoid fresh"
      : waitCount
        ? "Wait confirm"
        : "Collecting";

  return (
    <div className="market-gate-summary">
      <div className="market-gate-grid">
        <div>
          <span>Action</span>
          <b>{action}</b>
        </div>
        <div>
          <span>Setup</span>
          <b>{readyCount}R / {waitCount}W / {avoidCount}A</b>
        </div>
        <div>
          <span>Side</span>
          <b>{sideBias}</b>
        </div>
        <div>
          <span>Score</span>
          <b><DirectionValue value={avgScore - 50}>{formatNum(avgScore, 0)}</DirectionValue></b>
        </div>
        <div>
          <span>Breadth</span>
          <b><DirectionValue value={breadthNet}>{isNum(breadthNet) ? formatInt(breadthNet) : "-"}</DirectionValue></b>
        </div>
        <div>
          <span>Risk</span>
          <b>{marketScore <= 42 ? "High" : marketScore >= 60 ? "Low" : "Mixed"}</b>
        </div>
      </div>
      {children}
    </div>
  );
}

function CommandOverviewPanel({
  setups = [],
  mood = {},
  cards = {},
  pcrHistory = {},
  advanceDecline = {},
  foBreadth = {},
  selectedSymbol = "",
  collapsed = false,
  onCollapse,
  onOpenMarket,
  onOpenPcr,
}) {
  const marketScore = asNum(mood?.score, 50);
  const indexBreadthRows = INDEXES.map((item) => advanceDecline?.[item] || {});
  const indexBreadthAdv = indexBreadthRows.reduce((sum, row) => sum + asNum(row?.advances, 0), 0);
  const indexBreadthDec = indexBreadthRows.reduce((sum, row) => sum + asNum(row?.declines, 0), 0);
  const foAdv = asNum(foBreadth?.advances, null);
  const foDec = asNum(foBreadth?.declines, null);
  const foTotal = asNum(foBreadth?.total, 0);
  const hasFoBreadth = isNum(foAdv) && isNum(foDec) && foTotal > 0;
  const hasIndexBreadth = indexBreadthAdv > 0 || indexBreadthDec > 0;
  const indexBreadthDelta = indexBreadthAdv - indexBreadthDec;
  const indexBreadthLabel = hasIndexBreadth ? `${formatInt(indexBreadthAdv)} / ${formatInt(indexBreadthDec)}` : "-";
  const breadthAdv = hasFoBreadth ? foAdv : indexBreadthAdv;
  const breadthDec = hasFoBreadth ? foDec : indexBreadthDec;
  const hasBreadth = hasFoBreadth || hasIndexBreadth;
  const breadthLabel = hasBreadth ? `${formatInt(breadthAdv)} / ${formatInt(breadthDec)}` : "-";
  const breadthSourceLabel = hasFoBreadth ? "F&O" : "Tracked";
  const directionNote = hasFoBreadth
    ? `${breadthSourceLabel} breadth is ${Number(breadthAdv) >= Number(breadthDec) ? "supportive" : "weak"} today.`
    : hasBreadth
      ? `${breadthSourceLabel} breadth ${breadthLabel}.`
      : "Market breadth is collecting.";
  const setupScoreTrend = setups.map((setup) => setup?.score).filter(isNum);

  return (
    <SectionCard title="Market Direction" icon={<LineChartOutlined />} collapsible collapsed={collapsed} onCollapse={onCollapse}>
      <div className="command-grid">
        <CommandTile
          onOpen={onOpenMarket}
          priority="market"
          tone={marketScore >= 60 ? "green" : marketScore <= 42 ? "red" : "amber"}
          eyebrow="Market Direction"
          title={mood?.bias || "Neutral"}
          subtitle={directionNote}
          progress={marketScore}
          trendValues={setupScoreTrend.length > 1 ? setupScoreTrend : [45, 54, 62, marketScore - 8, marketScore]}
        >
          <MarketGateSummary setups={setups} marketScore={marketScore} breadthAdv={breadthAdv} breadthDec={breadthDec}>
            <FoBreadthDetail
              foBreadth={foBreadth}
              visible={hasFoBreadth}
              hasIndexBreadth={hasIndexBreadth}
              indexLabel={indexBreadthLabel}
              indexDelta={indexBreadthDelta}
            />
          </MarketGateSummary>
        </CommandTile>

        <PcrOiTrackerCard key={selectedSymbol || "ALL"} setups={setups} cards={cards} pcrHistory={pcrHistory} selectedSymbol={selectedSymbol} onOpenPcr={onOpenPcr} />
      </div>
    </SectionCard>
  );
}

function OptionBuyerPulse({ sectors = [], vix = {}, cards = {}, mood = {} }) {
  const topSector = sectors.find((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) > 0);
  const weakSector = [...sectors].reverse().find((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) < 0);
  const activeCards = INDEXES.map((item) => cards?.[item]).filter(Boolean);
  const bestStraddle = activeCards
    .map((card) => ({
      label: card?.label,
      value: asNum(card?.analytics?.straddle?.straddle, null),
      atm: card?.analytics?.straddle?.atm_strike,
    }))
    .filter((item) => isNum(item.value))
    .sort((a, b) => Number(a.value) - Number(b.value))[0];
  const moodScore = asNum(mood?.score, 50);

  return (
    <SectionCard title="Option Buyer Pulse" icon={<ThunderboltOutlined />}>
      <div className="buyer-pulse-grid">
        <MetricTile label="Market Mood" value={mood?.bias || "Neutral"} sub={`${formatNum(moodScore, 0)} / 100`} />
        <MetricTile label="India VIX" value={formatNum(vix?.ltp, 2)} sub={<ChangeText change={vix?.change} changePct={vix?.change_pct} />} />
        <MetricTile label="Leading Sector" value={topSector?.name || "-"} sub={formatPct(topSector?.change_pct)} />
        <MetricTile label="Weak Sector" value={weakSector?.name || "-"} sub={formatPct(weakSector?.change_pct)} />
        <MetricTile
          label="Cheapest Straddle"
          value={bestStraddle?.label || "-"}
          sub={bestStraddle ? `${formatPrice(bestStraddle.atm)} ATM | ${formatPrice(bestStraddle.value)}` : ""}
        />
        <MetricTile
          label="Live Sectors"
          value={`${formatInt(sectors.filter((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) > 0).length)} / ${formatInt(sectors.filter((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) < 0).length)}`}
          sub="Advancing / Declining"
        />
      </div>
    </SectionCard>
  );
}

function SectorBlock({ sectors = [], collapsed = false, onCollapse }) {
  const topSector = sectors.find((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) > 0);
  const weakSector = [...sectors].reverse().find((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) < 0);

  return (
    <SectionCard
      title="Sector Rotation"
      icon={<LineChartOutlined />}
      extra={<Button size="small" onClick={onCollapse}>{collapsed ? "Show" : "Collapse"}</Button>}
    >
      {collapsed ? (
        <div className="sector-collapse-summary">
          <span><b>Lead</b>{topSector?.name || "-"}</span>
          <span><b>Weak</b>{weakSector?.name || "-"}</span>
          <span><b>Rows</b>{formatInt(sectors.length)}</span>
        </div>
      ) : sectors.length ? (
        <div className="sector-list">
          {sectors.map((sector, index) => {
            const change = asNum(sector?.change_pct, 0);
            const width = Math.min(100, Math.abs(change) * 34);
            return (
              <div className="sector-row" key={`${sector?.name}-${index}`}>
                <strong className="truncate text-sm">{index + 1}. {sector?.name}</strong>
                <div className="sector-track">
                  <div className={`sector-fill ${change >= 0 ? "pos" : "neg"}`} style={{ width: `${width}%` }} />
                </div>
                <div className={`text-right text-xs font-extrabold ${classBySign(change)}`}>
                  <DirectionIcon value={change} />{formatPct(change)} | {sector?.status || "-"}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sector data" />
      )}
    </SectionCard>
  );
}

function SectorStocksPage({ sectors = [], onBack }) {
  const fallbackSectors = [
    { name: "Banking" },
    { name: "IT" },
    { name: "Auto" },
    { name: "FMCG" },
    { name: "Pharma" },
    { name: "Metal" },
  ];
  const sectorOptions = (Array.isArray(sectors) && sectors.length ? sectors : fallbackSectors).filter((sector) => sector?.name);
  const [selectedSector, setSelectedSector] = useState(sectorOptions[0]?.name || "Banking");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);

  useEffect(() => {
    if (!selectedSector) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const json = await fetchJson(`/api/sector-stocks?sector=${encodeURIComponent(selectedSector)}`, 20000);
        if (!cancelled) {
          setPayload(json || {});
          setSelectedStock(null);
        }
      } catch (err) {
        if (!cancelled) setPayload({ error: String(err?.message || err), rows: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedSector]);

  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const columns = [
    { title: "Stock", dataIndex: "symbol", fixed: "left", render: (value, row) => <Button type="link" onClick={() => setSelectedStock(row)}>{value}</Button> },
    { title: "Status", dataIndex: "status", render: (value) => <Tag color={value === "Live" ? "success" : "warning"}>{value || "-"}</Tag> },
    { title: "LTP", dataIndex: "ltp", align: "right", render: formatPrice },
    { title: "Open", dataIndex: "open", align: "right", render: formatPrice },
    { title: "High", dataIndex: "high", align: "right", render: formatPrice },
    { title: "Low", dataIndex: "low", align: "right", render: formatPrice },
    { title: "Close", dataIndex: "close", align: "right", render: formatPrice },
    { title: "Change", dataIndex: "change", align: "right", render: (value, row) => <DirectionValue value={value}>{formatPrice(value)} / {formatPct(row?.change_pct)}</DirectionValue> },
    { title: "Volume", dataIndex: "volume", align: "right", render: formatInt },
  ];

  return (
    <div className="sector-stocks-page">
      <Card className="pro-card sector-stocks-hero" styles={{ body: { padding: 14 } }}>
        <div>
          <span className="command-eyebrow">Sector Stock Live Board</span>
          <h2>{payload?.sector || selectedSector}</h2>
          <p>{formatInt(payload?.quoted)} / {formatInt(payload?.total)} quoted | Updated {payload?.timestamp || "-"}</p>
        </div>
        <Button icon={<HomeOutlined />} onClick={onBack}>Dashboard</Button>
      </Card>

      <Card className="pro-card" styles={{ body: { padding: 10 } }}>
        <Space size={8} wrap>
          {sectorOptions.map((sector) => {
            const active = String(sector.name) === String(selectedSector);
            return (
              <Button key={sector.name} type={active ? "primary" : "default"} onClick={() => setSelectedSector(sector.name)}>
                {sector.name} {isNum(sector.change_pct) ? formatPct(sector.change_pct) : ""}
              </Button>
            );
          })}
        </Space>
      </Card>

      {selectedStock ? (
        <Card className="pro-card sector-stock-detail" styles={{ body: { padding: 14 } }}>
          <div className="sector-stock-detail-head">
            <div>
              <span className="command-eyebrow">Full Page Stock Snapshot</span>
              <h2>{selectedStock.symbol}</h2>
              <p>{selectedStock.fyersSymbol} | {selectedStock.status}</p>
            </div>
            <Button onClick={() => setSelectedStock(null)}>Back to Sector</Button>
          </div>
          <div className="metric-grid">
            <MetricTile label="LTP" value={<DirectionValue value={selectedStock.change}>{formatPrice(selectedStock.ltp)}</DirectionValue>} sub={formatPct(selectedStock.change_pct)} />
            <MetricTile label="Open" value={formatPrice(selectedStock.open)} />
            <MetricTile label="High" value={formatPrice(selectedStock.high)} />
            <MetricTile label="Low" value={formatPrice(selectedStock.low)} />
            <MetricTile label="Close" value={formatPrice(selectedStock.close)} />
            <MetricTile label="Volume" value={formatInt(selectedStock.volume)} />
          </div>
        </Card>
      ) : null}

      <Card className="pro-card" styles={{ body: { padding: 10 } }}>
        {payload?.error ? <Alert className="mb-3" type="warning" showIcon message={payload.error} /> : null}
        <Table
          size="small"
          loading={loading}
          rowKey={(row) => row.fyersSymbol || row.symbol}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 18, showSizeChanger: true }}
          scroll={{ x: 980 }}
        />
      </Card>
    </div>
  );
}

function BuyerSetupBoard({ setups = [], loading = false, onOpen }) {
  const best = pickBestBuyerSetup(setups);
  const decay = getDecayState();
  const focusWarnings = best?.warnings?.length
    ? best.warnings
    : best
      ? ["Momentum, liquidity, and risk are acceptable."]
      : ["No clean directional option setup yet", "Wait for trigger", "Avoid forced premium buying"];

  return (
    <SectionCard
      title="Option Buyer Action Board"
      icon={<ThunderboltOutlined />}
      extra={loading ? <Spin size="small" /> : best ? <Tag color={toneFromBias(best?.signal?.bias)}>{best.label}</Tag> : <Tag>Scanning</Tag>}
    >
      <div className="buyer-setup-layout">
        <div className="setup-focus">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="metric-label">Top Candidate</div>
              <div className="mt-1 text-2xl font-black">
                {best?.option ? `${best.label} ${formatPrice(best.option.strike)} ${best.option.side}` : "Wait for clean setup"}
              </div>
              <div className="metric-sub">
                {best?.option
                  ? `${best.action} | Spot ${formatPrice(best.spot)} | Score ${formatNum(best.score, 0)}`
                  : "No high-quality option buy candidate yet"}
              </div>
            </div>
            <Tag color={best?.tone || "default"}>{best?.quality?.label || "No Trade"}</Tag>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MetricTile label="Entry" value={formatPremium(best?.plan?.entry)} />
            <MetricTile label="Target" value={formatPremium(best?.plan?.target)} />
            <MetricTile label="SL" value={formatPremium(best?.plan?.stoploss)} sub={isNum(best?.plan?.riskReward) ? `R:R ${formatNum(best.plan.riskReward, 2)}` : ""} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {focusWarnings.slice(0, 3).map((item) => (
              <Tag key={item} color={best ? (best?.warnings?.length ? "warning" : "success") : "default"}>{item}</Tag>
            ))}
          </div>
        </div>

        <div className="setup-card-grid">
          {setups.length ? setups.map((setup) => (
            <div className="setup-mini-card" key={setup.symbol}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="metric-label">{setup.label}</div>
                  <div className="mt-1 text-lg font-black">
                    {setup.option ? `${formatPrice(setup.option.strike)} ${setup.option.side}` : "No clean setup"}
                  </div>
                  <div className="metric-sub">
                    {setup.option ? `Premium ${formatPremium(setup.plan?.entry)} | Spot ${formatPrice(setup.spot)}` : setup.warnings?.[0] || "Option chain not ready"}
                  </div>
                </div>
                <Tag color={setup.tone}>{formatNum(setup.score, 0)}</Tag>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricTile label="Entry" value={formatPremium(setup.plan?.entry)} />
                <MetricTile label="Target" value={formatPremium(setup.plan?.target)} />
                <MetricTile label="SL" value={formatPremium(setup.plan?.stoploss)} sub={isNum(setup.plan?.riskReward) ? `R:R ${formatNum(setup.plan.riskReward, 2)}` : ""} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Tag color={setup.decay?.tone || decay.tone}>{setup.decay?.label || decay.label}</Tag>
                {(setup.warnings?.length ? setup.warnings : ["Setup acceptable"]).slice(0, 2).map((item) => (
                  <Tag key={item} color={setup.warnings?.length ? "warning" : "success"}>{item}</Tag>
                ))}
              </div>
              <Button className="mt-3" icon={<DashboardOutlined />} onClick={() => onOpen(setup.symbol)}>
                Open Terminal
              </Button>
            </div>
          )) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "Scanning option chain" : "No setup data"} />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function getTradeReadiness({ setup, displayOption, pcrTrack = {}, optionTrack = {} }) {
  if (!displayOption) {
    return { label: "No Strike", tone: "error", reason: "No option data" };
  }
  if (setup?.trigger?.invalidated) {
    return { label: "Avoid", tone: "error", reason: setup.trigger.reason || "Setup invalidated" };
  }
  if (setup?.trigger?.continuation) {
    return { label: "Trail", tone: "success", reason: setup.trigger.reason || "Target crossed; trail continuation only" };
  }
  if (setup?.trigger?.targetCrossed) {
    return { label: "Book", tone: "warning", reason: setup.trigger.reason || "Target crossed; wait for fresh setup" };
  }
  if (!setup?.option) {
    return { label: "Watch Only", tone: "warning", reason: "Nearest strike only; no clean setup" };
  }
  if (!setup?.trigger?.ready) {
    return { label: "Wait Trigger", tone: "warning", reason: setup?.trigger?.reason || "Entry trigger not active" };
  }
  if (setup?.noTradeGate?.blocked) {
    return { label: setup.noTradeGate.label || "No Trade", tone: setup.noTradeGate.tone || "warning", reason: setup.noTradeGate.reason || "One or more filters are not aligned" };
  }
  if (setup?.professionalGate?.passed === false) {
    return { label: setup.professionalGate.label || "Pro Gate", tone: setup.professionalGate.tone || "warning", reason: setup.professionalGate.reason || "Professional checklist is not aligned" };
  }
  if (setup?.timeframe?.passed === false) {
    return { label: setup.timeframe.label || "5m Wait", tone: setup.timeframe.tone || "warning", reason: setup.timeframe.reason || "5m confirmation pending" };
  }
  if (setup?.greekQuality?.passed === false) {
    return { label: "Greeks Fail", tone: "error", reason: setup.greekQuality.reason || "Greeks are not supportive" };
  }
  if (setup?.premiumMomentum?.passed === false) {
    return { label: setup.premiumMomentum.label || "Premium Wait", tone: setup.premiumMomentum.tone || "warning", reason: setup.premiumMomentum.reason || "Premium has not confirmed" };
  }
  if (setup?.sessionQuality?.passed === false) {
    return { label: setup.sessionQuality.label || "Session Block", tone: setup.sessionQuality.tone || "warning", reason: setup.sessionQuality.reason || "Session filter is blocking new trades" };
  }
  if (isNum(optionTrack?.premiumDelta) && Number(optionTrack.premiumDelta) < -0.1) {
    return { label: "Premium Weak", tone: "warning", reason: "Premium is cooling" };
  }
  if (setup?.volumeQuality?.label === "Low Vol") {
    return { label: "Thin Liquidity", tone: "warning", reason: setup.volumeQuality.reason };
  }

  const side = displayOption?.side;
  const pcrOk = side === "PE"
    ? asNum(pcrTrack.current, 1) <= 1.05 || pcrTrack.trendLabel === "Falling"
    : side === "CE"
      ? asNum(pcrTrack.current, 1) >= 0.85 || pcrTrack.trendLabel === "Rising"
      : true;
  if (!pcrOk) {
    return { label: "PCR Caution", tone: "warning", reason: "PCR is not supportive" };
  }
  if (asNum(setup?.score, 0) >= 70) {
    return { label: "Ready", tone: "success", reason: "Trigger, premium, liquidity aligned" };
  }
  return { label: "Confirm", tone: "warning", reason: "Setup needs confirmation" };
}

function OptionBuyerDesk({
  setups = [],
  cards = {},
  stripByLabel = {},
  advanceDecline = {},
  vix = {},
  mood = {},
  pcrHistory = {},
  optionSignalHistory = {},
  buyerMode = "INTRADAY",
  onModeChange,
  signalJournalCount = 0,
  signalJournal = [],
  gateHistory = [],
  readyAlertsEnabled = true,
  readyAlertBeepMuted = false,
  onReadyAlertsChange,
  onReadyBeepMutedChange,
  onTestReadyAlert,
  onExportSignals,
  onExcelReport,
  onPdfReport,
  loading = false,
  onOpen,
  onChart,
  onOptionChain,
  onQuick,
  selectedSymbol = "",
  collapsed = false,
  onCollapse,
}) {
  const [whySymbol, setWhySymbolState] = useState(() => sessionStorage.getItem("dashboardWhySymbol") || "");
  const [whyFullPage, setWhyFullPage] = useState(false);
  const setWhySymbol = (val) => {
    setWhySymbolState(val);
    if (val) sessionStorage.setItem("dashboardWhySymbol", val);
    else sessionStorage.removeItem("dashboardWhySymbol");
  };
  const [deskDensity, setDeskDensity] = useState("FAST");
  const [sparklineRes, setSparklineRes] = useState("5");
  const [fastActionMarks, setFastActionMarks] = useState(loadFastActionMarks);
  const markFastAction = useCallback((key, status, row = {}, option = {}) => {
    if (!key) return;
    setFastActionMarks((prev) => {
      const next = {
        ...(prev || {}),
        [key]: {
          status,
          ts: Date.now(),
          symbol: row?.symbol || "",
          side: option?.side || "",
          strike: isNum(option?.strike) ? Number(option.strike) : null,
        },
      };
      localStorage.setItem(FAST_ACTION_MARKS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const setupMap = setups.reduce((acc, setup) => {
    if (setup?.symbol) acc[setup.symbol] = setup;
    return acc;
  }, {});
  const readyCount = setups.filter((setup) =>
    setup?.option && setup?.trigger?.ready && setup?.score >= 65 && setup?.warnings?.length <= 1
  ).length;
  const rankedSymbols = [...setups]
    .sort((a, b) => b.score - a.score)
    .reduce((acc, setup, index) => {
      if (setup?.symbol) acc[setup.symbol] = index + 1;
      return acc;
    }, {});

  const visibleSymbols = selectedSymbol && INDEXES.includes(selectedSymbol) ? [selectedSymbol] : INDEXES;
  const rows = visibleSymbols.map((item, fixedIndex) => {
    const card = cards?.[item] || {};
    const strip = getStripForSymbol(stripByLabel, item);
    const analytics = card?.analytics || {};
    const priceRef = {
      ...(card?.spot || {}),
      ltp: strip?.ltp ?? card?.spot?.ltp ?? card?.future?.ltp,
      change: strip?.change ?? card?.spot?.change ?? card?.future?.change,
      change_pct: strip?.change_pct ?? card?.spot?.change_pct ?? card?.future?.change_pct,
    };
    const fallbackBias = biasFromChange(priceRef?.change_pct, card?.quickBias || analytics?.sentiment?.bias || "Neutral");
    const setup = setupMap[item];
    if (!isNum(priceRef.ltp) && isNum(setup?.spot)) {
      priceRef.ltp = setup.spot;
    }
    const levels = getCardLevels(card, strip);
    const previous = analytics?.previousDayLevels || {};
    const support = levels.supports[0];
    const resistance = levels.resistances[0];
    const pivot = previous?.pivot;
    const vwap = analytics?.vwap ?? card?.spot?.vwap ?? card?.future?.vwap;
    return {
      symbol: item,
      label: INDEX_LABELS[item] || item,
      card,
      setup,
      analytics,
      price: priceRef?.ltp,
      change: priceRef?.change,
      changePct: priceRef?.change_pct,
      bias: setup?.signal?.bias || fallbackBias,
      command: getSetupCommand(setup, fallbackBias),
      levels,
      pivot,
      vwap,
      levelStatus: getLevelStatus({ price: priceRef?.ltp, support, resistance, pivot, vwap }),
      ad: advanceDecline?.[item] || {},
      rank: rankedSymbols[item],
      fixedIndex,
    };
  }).sort((a, b) => asNum(a.rank, 99) - asNum(b.rank, 99) || a.fixedIndex - b.fixedIndex);
  const cleanSetupCount = rows.filter((row) => (
    row.setup?.option &&
    row.setup?.trigger?.ready &&
    asNum(row.setup?.score, 0) >= asNum(BUYER_MODES[buyerMode]?.minConfidence, 60) &&
    (row.setup?.warnings || []).length <= 1
  )).length;
  const watchCount = rows.filter((row) => row.setup?.displayOption || row.setup?.option).length - cleanSetupCount;
  const avgScore = rows.length
    ? rows.reduce((sum, row) => sum + asNum(row.setup?.score, 0), 0) / rows.length
    : 0;
  const outcomeReport = useMemo(() => buildSignalAnalyticsReport(signalJournal, gateHistory), [gateHistory, signalJournal]);
  const outcomeSummary = outcomeReport.summary || {};
  const closedSignals = asNum(outcomeSummary.targetHit, 0) + asNum(outcomeSummary.stoplossHit, 0);
  const breadthNet = rows.reduce((sum, row) => sum + (asNum(row.ad?.advances, 0) - asNum(row.ad?.declines, 0)), 0);
  const vixLevel = asNum(vix?.ltp, null);
  const vixChange = asNum(vix?.change_pct, 0);
  const riskTone = (vixLevel >= 17 || vixChange >= 4 || avgScore < 35) ? "error" : (vixLevel >= 15 || cleanSetupCount === 0) ? "warning" : "success";
  const riskLabel = riskTone === "error" ? "High Risk" : riskTone === "warning" ? "Selective" : "Normal";
  const whyRow = rows.find((row) => row.symbol === whySymbol);
  const whySetup = whyRow?.setup;
  const whyOption = whySetup?.option || whySetup?.displayOption;
  const whyFreshness = whySetup ? getCombinedFreshness(whySetup.timeframeFreshness) : null;
  const whyOptionTrack = whySetup ? getOptionSignalTracker(optionSignalHistory, whySetup.symbol, whyOption) : {};
  const whyWriterShift = whySetup ? getWriterShiftSignal(whySetup) : {};
  const whyLevelShift = whySetup ? getLevelShiftSignal(optionSignalHistory, whySetup.symbol, whyRow?.levels, whySetup.analytics || whyRow?.analytics || {}) : {};
  const whyFastItems = whySetup ? [
    {
      label: "Final",
      status: whySetup.noTradeGate?.blocked ? "AVOID" : whySetup.professionalGate?.decision || "WAIT",
      tone: whySetup.noTradeGate?.blocked ? "error" : whySetup.professionalGate?.tone || "warning",
      note: whySetup.noTradeGate?.blocked ? "Do not take fresh trade." : "Main gate is open.",
    },
    {
      label: "Writers",
      status: whyWriterShift.label || "Collecting",
      tone: whyWriterShift.tone || "warning",
      note: whyWriterShift.tone === "success" ? "OI flow supports this side." : whyWriterShift.tone === "error" ? "OI flow is against this side." : "OI flow is not clear yet.",
    },
    {
      label: "VWAP",
      status: whySetup.vwapState?.label || "Collecting",
      tone: whySetup.vwapState?.tone || "warning",
      note: whySetup.vwapState?.aligned ? "Price is on the right side of VWAP." : "VWAP is not supporting.",
    },
    {
      label: "Trend",
      status: whySetup.trendEngine?.label || whySetup.fifteenTrend?.label || "Collecting",
      tone: whySetup.trendEngine?.tone || whySetup.fifteenTrend?.tone || "warning",
      note: whySetup.trendEngine?.compact || whySetup.trendEngine?.reason || "ST, DI, OBV and Pivot check.",
    },
    {
      label: "Levels",
      status: whyLevelShift.label || "Collecting",
      tone: whyLevelShift.tone || "warning",
      note: whyLevelShift.note || "Support/resistance tracking.",
    },
    {
      label: "Data Age",
      status: whyFreshness?.label || "Collecting",
      tone: whyFreshness?.tone || "warning",
      note: whyFreshness?.passed ? "Data is fresh enough." : "Data may be old.",
    },
  ] : [];
  const whyGroups = whySetup ? [
    {
      title: "Main Risk Checks",
      items: [
        { label: "News/Event", status: whySetup.eventBlocker?.label || "Collect", tone: whySetup.eventBlocker?.tone || "success", note: whySetup.eventBlocker?.tone === "error" ? "Important event risk. Avoid fresh entry." : "No major event block seen." },
        { label: "Market Time", status: whySetup.sessionQuality?.label || "Collect", tone: whySetup.sessionQuality?.tone || "warning", note: whySetup.sessionQuality?.tone === "error" ? "This time zone is not good for fresh entry." : "Trading time is acceptable." },
        { label: "Market Breadth", status: whySetup.foActivity?.label || "Collect", tone: whySetup.foActivity?.tone || "warning", note: whySetup.foActivity?.passed === false ? "Many stocks are not supporting this side." : "Stock participation supports the move." },
        { label: "Big Stocks", status: whySetup.heavyweightCheck?.label || "Collect", tone: whySetup.heavyweightCheck?.tone || "warning", note: whySetup.heavyweightCheck?.passed === false ? "Index heavyweights are not helping." : "Heavyweights are helping the move." },
        { label: "Setup Score", status: `${whySetup.professionalGate?.setupScore ?? 0}/${whySetup.professionalGate?.setupTotal ?? 11}`, tone: (whySetup.professionalGate?.setupScore ?? 0) >= Math.ceil((whySetup.professionalGate?.setupTotal ?? 11) * 0.66) ? "success" : "error", note: "Main conditions like trend, VWAP, OI, VIX and R:R." },
        { label: "Entry Score", status: `${whySetup.professionalGate?.entryScore ?? 0}/${whySetup.professionalGate?.entryTotal ?? 8}`, tone: (whySetup.professionalGate?.entryScore ?? 0) >= Math.ceil((whySetup.professionalGate?.entryTotal ?? 8) * 0.8) ? "success" : "warning", note: "Entry timing conditions like 5m, volume, spread and trigger." }
      ]
    },
    {
      title: "Trend Checks",
      items: [
        { label: "Daily", status: whySetup.dailyTrend?.label || "Collect", tone: whySetup.dailyTrend?.tone || "warning", note: "Big trend direction." },
        { label: "60 Min", status: whySetup.hourlyTrend?.label || "Collect", tone: whySetup.hourlyTrend?.tone || "warning", note: "Medium trend direction." },
        { label: "15 Min", status: whySetup.fifteenTrend?.label || "Collect", tone: whySetup.fifteenTrend?.tone || "warning", note: "Intraday trend direction." },
        { label: "ST / DI / OBV / Pivot", status: whySetup.trendEngine?.compact || whySetup.trendEngine?.label || "Collect", tone: whySetup.trendEngine?.tone || "warning", note: whySetup.trendEngine?.reason || "SuperTrend, DI, OBV and Pivot confirmation." },
        { label: "5 Min Entry", status: whySetup.timeframe?.label || "Collect", tone: whySetup.timeframe?.tone || "warning", note: "Entry candle should support the same side." },
        { label: "Opening Range", status: whySetup.gapCheck?.label || "Collect", tone: whySetup.gapCheck?.tone || "warning", note: "Checks gap and first 15 minute high/low." },
        { label: "Momentum", status: whySetup.momentum?.label || "-", tone: whySetup.momentum?.tone || "warning", note: "Checks if price has speed." },
        { label: "VWAP", status: whySetup.vwapState?.label || "-", tone: whySetup.vwapState?.tone || "warning", note: "CE prefers above VWAP. PE prefers below VWAP." },
        { label: "Override", status: whySetup.priceOverride?.label || "No Override", tone: whySetup.priceOverride?.active ? "success" : "warning", note: "Only for scalp when price breaks a key level." }
      ]
    },
    {
      title: "Option Chain Checks",
      items: [
        { label: "FII Trend", status: whySetup.fiiFlow?.label || "Collect", tone: whySetup.fiiFlow?.tone || "warning", note: whySetup.fiiFlow?.detail || "Checks if FIIs are trading against you." },
        { label: "OI / PCR", status: whySetup.oiPcr?.label || "Collect", tone: whySetup.oiPcr?.tone || "warning", note: "Checks whether option-chain pressure supports this side." },
        { label: "Writers Shift", status: whyWriterShift.label || "Collecting", tone: whyWriterShift.tone || "warning", note: whyWriterShift.note || "Waiting for OI change." },
        { label: "Strike OI Shift", status: whyOptionTrack.oiShiftLabel || "Collecting", tone: whyOptionTrack.oiShiftTone || "warning", note: whyOptionTrack.oiShiftNote || "Waiting for strike OI." },
        { label: "Level Shift", status: whyLevelShift.label || "Collecting", tone: whyLevelShift.tone || "warning", note: whyLevelShift.note || "Waiting for S/R history." },
        { label: "Key OI Level", status: whySetup.smartMoney?.label || "Collect", tone: whySetup.smartMoney?.tone || "warning", note: whySetup.smartMoney?.tone === "error" ? "Important OI level is blocking the trade." : "Important OI level is not blocking badly." },
        { label: "Max Pain", status: whySetup.maxPainShift?.label || "Collect", tone: whySetup.maxPainShift?.tone || "warning", note: whySetup.maxPainShift?.direction !== 0 ? "Max pain moved today." : "Max pain is stable." },
        { label: "Premium Move", status: whySetup.premiumMomentum?.label || "Collect", tone: whySetup.premiumMomentum?.tone || "warning", note: "Option premium should move with spot." },
        { label: "IV Rank", status: whySetup.ivRankQuality?.label || "Collect", tone: whySetup.ivRankQuality?.tone || "warning", note: "Checks if volatility is good for option buying." }
      ]
    },
    {
      title: "Entry Safety",
      items: [
        { label: "Smart Vol", status: whySetup.volumeAbsorption?.label || "Collect", tone: whySetup.volumeAbsorption?.tone || "warning", note: whySetup.volumeAbsorption?.detail || "Checks if Smart Money is absorbing volume." },
        { label: "Volume", status: whySetup.volumeBreakout?.label || "Collect", tone: whySetup.volumeBreakout?.tone || "warning", note: "Move is better when volume is strong." },
        { label: "Liquidity", status: whySetup.volumeQuality?.label || "-", tone: whySetup.volumeQuality?.tone || "warning", note: "Option should have enough buyers/sellers." },
        { label: "Spread", status: whySetup.spreadCheck?.label || "Collect", tone: whySetup.spreadCheck?.tone || "warning", note: "Small bid-ask spread is safer." },
        { label: "Hunt Trap", status: whySetup.trapDetector?.label || "Collect", tone: whySetup.trapDetector?.tone || "warning", note: whySetup.trapDetector?.detail || "Checks if big players are hunting stop losses." },
        { label: "S/R Trap", status: whySetup.trap?.label || "-", tone: whySetup.trap?.tone || "warning", note: "Avoid buying into nearby reversal level." },
        { label: "Expiry", status: whySetup.expiryCheck?.label || "Collect", tone: whySetup.expiryCheck?.tone || "warning", note: "Near expiry has faster theta decay." },
        { label: "VIX", status: whySetup.vixCheck?.label || "Collect", tone: whySetup.vixCheck?.tone || "warning", note: "Option buying needs helpful volatility." },
        { label: "Data Age", status: whyFreshness?.label || "Collect", tone: whyFreshness?.tone || "warning", note: `${whyFreshness?.compact || "Collecting"} means how fresh the signal data is.` }
      ]
    }
  ] : [];

  const verdictItems = whySetup ? [
    { label: "Final Gate", status: whySetup.noTradeGate?.blocked ? whySetup.noTradeGate.label : "Tradable", tone: whySetup.noTradeGate?.tone || "success", note: whySetup.noTradeGate?.blocked ? "Main rule says do not take fresh trade." : "Main rule allows trade." },
    { label: "Checklist", status: whySetup.professionalGate?.label || "Collect", tone: whySetup.professionalGate?.tone || "warning", note: "Overall professional checklist result." },
    { label: "Decision", status: whySetup.professionalGate?.decision || "Collect", tone: whySetup.professionalGate?.tone || "warning", note: whySetup.professionalGate?.actionReason || "Waiting for clear reason." },
    { label: "Override", status: whySetup.priceOverride?.label || "No Override", tone: whySetup.priceOverride?.active ? "success" : "warning", note: whySetup.priceOverride?.active ? "Scalp exception is active." : "No scalp exception." }
  ] : [];

  return (
    <SectionCard
      title="Option Buyer Desk"
      icon={<ThunderboltOutlined />}
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      extra={
        <Space size={8} wrap>
          <Button size="small" onClick={onExportSignals}>
            Export Signals{signalJournalCount ? ` ${signalJournalCount}` : ""}
          </Button>
          <Button size="small" onClick={onExcelReport}>
            Excel Report
          </Button>
          <Button size="small" onClick={onPdfReport}>
            PDF Report
          </Button>
          <Segmented
            size="small"
            value={buyerMode}
            onChange={onModeChange}
            options={Object.entries(BUYER_MODES).map(([value, item]) => ({ label: item.label, value }))}
          />
          <Segmented
            size="small"
            value={deskDensity}
            onChange={setDeskDensity}
            options={[
              { label: "Fast", value: "FAST" },
              { label: "Simple", value: "SIMPLE" },
              { label: "Pro", value: "PRO" },
              { label: "Compact", value: "COMPACT" },
              { label: "Full", value: "FULL" },
            ]}
          />
          <Segmented
            size="small"
            value={sparklineRes}
            onChange={setSparklineRes}
            options={[
              { label: "5m", value: "5" },
              { label: "15m", value: "15" },
            ]}
          />
          {loading ? <Spin size="small" /> : <Tag color={readyCount ? "success" : "warning"}>{readyCount ? `${readyCount} Ready` : "Wait"}</Tag>}
          <Tooltip title="Show toast when a setup becomes READY">
            <Switch size="small" checked={readyAlertsEnabled} onChange={onReadyAlertsChange} checkedChildren="Alert" unCheckedChildren="Off" />
          </Tooltip>
          <Tooltip title="Mute or enable READY alert sound">
            <Switch size="small" checked={!readyAlertBeepMuted} onChange={(checked) => onReadyBeepMutedChange?.(!checked)} checkedChildren="Beep" unCheckedChildren="Mute" />
          </Tooltip>
          {deskDensity !== "FAST" ? <Button size="small" onClick={onTestReadyAlert}>Test Alert</Button> : null}
        </Space>
      }
      className={`desk-card ${deskDensity === "FAST" ? "desk-fast" : ""} ${deskDensity === "SIMPLE" ? "desk-simple" : ""} ${deskDensity === "PRO" ? "desk-pro" : ""} ${deskDensity === "COMPACT" ? "desk-compact" : ""}`}
    >
      <div className="decision-cockpit">
        <div className={`desk-summary-strip ${riskTone}`}>
          <div>
            <span>Market</span>
            <b>{mood?.bias || mood?.label || "Collecting"}</b>
            <small>{selectedSymbol ? INDEX_LABELS[selectedSymbol] || selectedSymbol : "All major indices"}</small>
          </div>
          <div className="top-card-col">
            <span className="mode-title">{BUYER_MODES[buyerMode]?.label || buyerMode}</span>
            <small>Req Score: {formatNum(BUYER_MODES[buyerMode]?.minConfidence, 0)}</small>
          </div>
          <div>
            <span>Setups</span>
            <b>{cleanSetupCount} Clean / {Math.max(watchCount, 0)} Watch</b>
            <small>{rows.length} index view</small>
          </div>
          <div>
            <span>Breadth</span>
            <b><DirectionValue value={breadthNet}>{formatNum(breadthNet, 0)}</DirectionValue></b>
            <small>Net adv/dec on visible cards</small>
          </div>
          <div>
            <span>Risk</span>
            <b>{riskLabel}</b>
            <small>VIX {formatNum(vix?.ltp, 2)} {formatPct(vix?.change_pct)}</small>
          </div>
        </div>
        <div className="outcome-accuracy-strip">
          <span>Outcome <b>{formatNum(outcomeSummary.successRate, 1)}%</b></span>
          <span>Target <b>{formatNum(outcomeSummary.targetHit, 0)}</b></span>
          <span>SL <b>{formatNum(outcomeSummary.stoplossHit, 0)}</b></span>
          <span>Closed <b>{formatNum(closedSignals, 0)}</b></span>
          <span>Open <b>{formatNum(outcomeSummary.open, 0)}</b></span>
          <span>Not Testable <b>{formatNum(outcomeSummary.notTestable, 0)}</b></span>
        </div>
        {deskDensity === "FAST" ? (
          <div className="fast-action-grid">
            {rows.map((row) => {
              const setup = row.setup || {};
              const plan = setup?.plan || {};
              const displayOption = setup?.option || setup?.displayOption || {};
              const tone = setup?.trigger?.tone || setup?.tone || toneFromBias(row.bias);
              const pcrTrack = getPcrTracker(pcrHistory, row.symbol, row.analytics?.pcr ?? setup?.pcr);
              const optionTrack = getOptionSignalTracker(optionSignalHistory, row.symbol, displayOption);
              const signalMeta = getSignalRuntimeMeta(signalJournal, setup);
              const writerShift = getWriterShiftSignal(setup);
              const levelShift = getLevelShiftSignal(optionSignalHistory, row.symbol, row.levels, setup.analytics || row.analytics || {});
              const readiness = getTradeReadiness({ setup, displayOption, pcrTrack, optionTrack });
              const signalStep = Math.min(3, Math.max(1, asNum(signalMeta?.count, 0) || 1));
              const actionKey = getFastActionKey(row, displayOption, plan);
              const actionMark = fastActionMarks?.[actionKey];
              const actionLabel = actionMark?.status === "TAKEN" ? "Taken" : actionMark?.status === "SKIPPED" ? "Skipped" : "Pending";
              const decisionText = setup?.noTradeGate?.blocked ? "AVOID" : readiness?.tone === "success" ? "READY" : setup?.priceOverride?.active ? "SCALP" : "WAIT";
              const displayDecisionText = decisionText === "READY" || decisionText === "SCALP" ? "TAKE ENTRY" : decisionText;
              const tagStyles = {
                AVOID: { background: "#ff4d4f", color: "#fff", fontWeight: "bold", border: "none" },
                WAIT: { background: "#faad14", color: "#000", fontWeight: "bold", border: "none" },
                READY: { background: "#52c41a", color: "#fff", fontWeight: "bold", border: "none" },
                SCALP: { background: "#52c41a", color: "#fff", fontWeight: "bold", border: "none" }
              };
              const decisionStyle = tagStyles[decisionText] || {};
              const copySignal = (event) => {
                event?.stopPropagation?.();
                const text = `BUY ${row.symbol} ${formatPrice(displayOption?.strike)} ${displayOption?.side || ""} @ ${formatPremium(plan.entry)} | SL ${formatPremium(plan.stoploss)} | TGT ${formatPremium(plan.target)}`;
                navigator.clipboard?.writeText(text);
                notification.success({ message: "Signal copied", duration: 2 });
              };

              return (
                <div className={`fast-action-card ${tone}`} key={`fast-${row.symbol}`}>
                  <div className="fast-action-head">
                    <div className="fast-price-block">
                      <span>{row.rank ? `#${row.rank} ` : ""}{row.label}</span>
                      <b className={`price-tone ${toneBySign(row.changePct ?? row.change)}`}>{formatPrice(row.price)}</b>
                      <small><ChangeText change={row.change} changePct={row.changePct} price={row.price} /></small>
                    </div>
                    <div className="fast-head-plan">
                      <div><span>Entry</span><b>{formatPremium(plan.entry ?? displayOption?.premium)}</b></div>
                      <div><span>Tgt</span><b>{formatPremium(plan.target)}</b></div>
                      <div><span>SL</span><b>{formatPremium(plan.stoploss)}</b></div>
                      <div><span>R:R</span><b>{formatNum(plan.riskReward, 2)}</b></div>
                    </div>
                    <Tag style={decisionStyle}>{displayDecisionText}</Tag>
                  </div>

                  <div className={`fast-signal-line ${actionMark?.status === "TAKEN" ? "taken" : actionMark?.status === "SKIPPED" ? "skipped" : ""}`}>
                    <b>{displayOption?.strike ? `${formatPrice(displayOption.strike)} ${displayOption.side}` : "No Strike"}</b>
                    <span>Signal {signalStep}/3</span>
                    <span>{signalMeta?.count ? `${signalMeta.count} hits` : "First watch"}</span>
                    <em>{actionLabel}</em>
                  </div>

                  <div className="fast-check-row">
                    <div className={writerShift.tone}><span>Writers</span><b>{writerShift.label}</b></div>
                    <div className={setup?.vwapState?.tone || "warning"}><span>VWAP</span><b>{setup?.vwapState?.aligned ? "Above" : setup?.vwapState?.label || "Wait"}</b></div>
                    <div className={levelShift.tone}><span>Levels</span><b>{levelShift.label}</b></div>
                    <div className="success"><span>IV</span><b>{isNum(displayOption?.iv) ? formatNum(displayOption.iv, 2) : "-"}</b></div>
                    <div className={`fast-trend-cell ${setup?.trendEngine?.tone || "warning"}`}><span>ST / DI / OBV / Pivot</span><b>{setup?.trendEngine?.compact || setup?.trendEngine?.label || "Collect"}</b></div>
                  </div>

                  <div className="fast-action-buttons">
                    <Button size="small" type="primary" onClick={() => markFastAction(actionKey, "TAKEN", row, displayOption)}>
                      Taken
                    </Button>
                    <Button size="small" onClick={() => markFastAction(actionKey, "SKIPPED", row, displayOption)}>
                      Skip
                    </Button>
                    <Button size="small" icon={<CopyOutlined />} onClick={copySignal}>
                      Copy
                    </Button>
                    <Button size="small" onClick={(event) => {
                      event.stopPropagation();
                      setWhySymbol(row.symbol);
                    }}>
                      Why
                    </Button>
                    <Button size="small" icon={<LineChartOutlined />} onClick={(event) => {
                      event.stopPropagation();
                      onChart?.(row.symbol);
                    }}>
                      Chart
                    </Button>
                    <Button size="small" onClick={(event) => {
                      event.stopPropagation();
                      onOptionChain?.(row.symbol);
                    }}>
                      Chain
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="index-decision-grid">
          {rows.map((row) => {
            const setup = row.setup;
            const plan = setup?.plan || {};
            const displayOption = setup?.option || setup?.displayOption;
            const openDetail = (event, focus = "Signal") => {
              event?.stopPropagation?.();
              onOpen?.(row.symbol, "signal", focus);
            };
            const tone = setup?.trigger?.tone || setup?.tone || toneFromBias(row.bias);
            const pcrTrack = getPcrTracker(pcrHistory, row.symbol, row.analytics?.pcr ?? setup?.pcr);
            const optionTrack = getOptionSignalTracker(optionSignalHistory, row.symbol, displayOption);
            const signalMeta = getSignalRuntimeMeta(signalJournal, setup);
            const pcrCard = getPcrCardState(pcrTrack, displayOption?.side);
            const signalStep = Math.min(3, Math.max(1, asNum(signalMeta?.count, 0) || 1));
            const readiness = getTradeReadiness({ setup, displayOption, pcrTrack, optionTrack });
            const expiryLabel = getExpiryLabel({
              ...(row.card || {}),
              ...(setup || {}),
              analytics: setup?.analytics || row.analytics || {},
              optionChain: setup?.optionChain || row.card?.optionChain || [],
            });

            return (
              <div
                className={`index-decision-card ${tone} clickable-card`}
                key={row.symbol}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  if (event.target?.closest?.("button,a,.ant-btn,.ant-tag,.ant-segmented,.ant-select,.ant-modal")) return;
                  openDetail(event, "Signal");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") openDetail(event, "Signal");
                }}
              >
                <div className="index-card-head">
                  <div>
                    <div className="metric-label" style={{ display: 'flex', alignItems: 'center' }}>
                      {row.rank ? `#${row.rank} ` : ""}{row.label}
                      <Sparkline tone={tone} data={row.sparklineData} symbol={row.symbol} resolution={sparklineRes} />
                    </div>
                    <div className={`index-price price-tone ${toneBySign(row.changePct ?? row.change)}`}>{formatPrice(row.price)}</div>
                    <div className="index-change"><ChangeText change={row.change} changePct={row.changePct} price={row.price} /></div>
                    <div className="index-sr-levels" style={{ marginTop: '8px', fontSize: '11px', color: '#526177' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <span>S:</span>
                        <b style={{ color: '#52c41a' }}>{formatLevelList(row.levels?.supports)}</b>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <span>R:</span>
                        <b style={{ color: '#ff4d4f' }}>{formatLevelList(row.levels?.resistances)}</b>
                      </div>
                    </div>
                  </div>

                  <div className="head-center-content" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="mini-plan-grid" style={{ marginTop: 0 }}>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Signal")}>
                        <span>Contract</span>
                        <b className="actionable-number" style={{ color: '#fff' }}>
                          {displayOption ? `${formatPrice(displayOption.strike)} ${displayOption.side}` : "No Strike"}
                          {displayOption && <span style={{ color: '#faad14', marginLeft: '6px', fontSize: '12px' }}>{expiryLabel}</span>}
                        </b>
                      </div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Signal")}>
                        <span>Status</span>
                        <b className="actionable-number" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <em style={{ fontStyle: 'normal', display: 'flex', alignItems: 'center', gap: '5px', color: readiness.tone === 'success' ? '#52c41a' : readiness.tone === 'error' ? '#ff4d4f' : '#faad14' }}>
                            {readiness.tone === 'success' ? <CheckCircleFilled /> : readiness.tone === 'error' ? <CloseCircleFilled /> : <ExclamationCircleFilled />}
                            {readiness.label}
                          </em>
                          <em style={{ fontStyle: 'normal', opacity: 0.3, fontSize: '0.8em', color: '#fff' }}>|</em>
                          <em style={{ fontStyle: 'normal', color: tone === 'success' ? '#52c41a' : tone === 'error' ? '#ff4d4f' : tone === 'warning' ? '#faad14' : 'inherit' }}>
                            {setup?.trigger?.invalidated ? "Invalid" : row.command}
                          </em>
                        </b>
                      </div>
                      <div className={`clickable-card pcr-signal-card ${pcrCard.tone}`} onClick={(event) => openDetail(event, "PCR")}>
                        <span>PCR Change</span>
                        <b className="actionable-number">{pcrCard.label}</b>
                        <small>{pcrCard.note}</small>
                      </div>
                      <div className="clickable-card signal-sequence-card" onClick={(event) => openDetail(event, "Signal Count")}>
                        <span>Signal</span>
                        <b className="actionable-number">{signalStep}/3</b>
                        <small>{signalMeta?.count ? `${signalMeta.count} active hits` : "First watch"}</small>
                      </div>
                      {setup?.priceOverride?.active ? (
                        <div className="clickable-card" onClick={(event) => openDetail(event, "Price Override")}>
                          <span>Override</span>
                          <b className="actionable-number" style={{ color: '#faad14' }}>{setup.priceOverride.label}</b>
                        </div>
                      ) : null}
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Greeks")}><span>Delta</span><b className="actionable-number" style={{ color: '#1890ff' }}>{displayOption?.delta ?? '-'}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Greeks")}><span>Theta</span><b className="actionable-number" style={{ color: '#ff4d4f' }}>{displayOption?.theta ?? '-'}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Greeks")}><span>Gamma</span><b className="actionable-number" style={{ color: '#eb2f96' }}>{displayOption?.gamma ?? '-'}</b></div>
                      
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Data")}><span>PCR Now</span><b className="actionable-number" style={{ color: '#13c2c2' }}>{formatNum(row.analytics?.pcr, 2)}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Levels")}><span>VWAP</span><b className="actionable-number">{formatPrice(row.analytics?.vwap ?? row.card?.spot?.vwap)}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Levels")}><span>Pivot</span><b className="actionable-number">{formatPrice(row.analytics?.previousDayLevels?.pivot)}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Levels")}><span>Max Pain</span><b className="actionable-number">{formatPrice(row.analytics?.maxPain)}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Greeks")}><span>IV Rank</span><b className="actionable-number" style={{ color: '#faad14' }}>{displayOption?.ivRank ?? '-'}</b></div>
                      
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Entry")}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Entry <em style={{ opacity: 0.7, fontStyle: 'normal' }}>({formatNum(plan?.qty, 0)} lots)</em></span>
                          <CopyOutlined 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              navigator.clipboard.writeText(`BUY ${row.symbol} ${displayOption?.strike} ${displayOption?.side} @ ${plan.entry} | SL: ${plan.stoploss} | Tgt: ${plan.target}`); 
                              notification.success({message: 'Signal Copied!', duration: 2});
                            }} 
                            style={{ color: '#1890ff', cursor: 'pointer' }}
                            title="Copy Signal"
                          />
                        </span>
                        <b className="actionable-number">{formatPremium(plan.entry ?? displayOption?.premium)}</b>
                      </div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Target")}><span>Target</span><b className="actionable-number">{formatPremium(plan.target)}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Stop Loss")}><span>SL</span><b className="actionable-number">{formatPremium(plan.stoploss)}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Trailing")}><span>Trailing</span><b className="actionable-number">{formatPremium(plan.trailing)}</b></div>
                      <div className="clickable-card" onClick={(event) => openDetail(event, "Risk Reward")}><span>R:R</span><b className="actionable-number">{formatNum(plan.riskReward, 2)}</b></div>
                    </div>
                  </div>
                </div>

                <div className="index-actions">
                  <Button size="small" onClick={(event) => {
                    event.stopPropagation();
                    setWhySymbol(row.symbol);
                  }}>Why?</Button>
                  <Button size="small" icon={<EyeOutlined />} onClick={(event) => {
                    event.stopPropagation();
                    onQuick(row.symbol);
                  }}>Snapshot</Button>
                  <Button size="small" type="primary" icon={<DashboardOutlined />} onClick={(event) => openDetail(event, "Signal")}>Terminal</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Modal
        title={`${whyRow?.label || "Signal"} setup check`}
        open={Boolean(whySymbol)}
        onCancel={() => {
          setWhySymbol("");
          setWhyFullPage(false);
        }}
        maskClosable={false}
        footer={(
          <Space>
            <Button
              icon={whyFullPage ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setWhyFullPage((prev) => !prev)}
            >
              {whyFullPage ? "Compact" : "Full Page"}
            </Button>
            <Button onClick={() => {
              setWhySymbol("");
              setWhyFullPage(false);
            }}>Close</Button>
          </Space>
        )}
        width={whyFullPage ? "calc(100vw - 24px)" : 1180}
        className={`setup-check-modal ${whyFullPage ? "full-page-modal" : ""}`}
      >
        {whySetup ? (
          <div className="why-popup">
            <div className={`why-action-strip ${whyFastItems[0]?.tone || "warning"}`}>
              <div>
                <span>Decision</span>
                <b>{whyFastItems[0]?.status || "WAIT"}</b>
                <small>{whyFastItems[0]?.note || "Waiting for final gate."}</small>
              </div>
              <div>
                <span>Signal</span>
                <b>{whyOption ? `${formatPrice(whyOption.strike)} ${whyOption.side}` : "No Strike"}</b>
                <small>{whySetup.action || "-"}</small>
              </div>
              <div>
                <span>Plan</span>
                <b>{formatPremium(whySetup.plan?.entry)} / {formatPremium(whySetup.plan?.target)} / {formatPremium(whySetup.plan?.stoploss)}</b>
                <small>Entry / Target / SL</small>
              </div>
              <div>
                <span>Score</span>
                <b>{formatNum(whySetup.score, 0)}</b>
                <small>{whySetup.professionalGate?.label || "Checklist"}</small>
              </div>
            </div>
            <div className="why-fast-grid">
              {whyFastItems.slice(1).map((item) => (
                <div className={`why-fast-card ${item.tone}`} key={item.label}>
                  <span>{item.label}</span>
                  <b>{item.status}</b>
                  <small>{item.note}</small>
                </div>
              ))}
            </div>
            <div className="why-summary-container">
              <div className={`why-summary ${whySetup.tone || "warning"}`}>
                <div>
                  <span className="metric-label">Signal</span>
                  <b>{whyOption ? `${formatPrice(whyOption.strike)} ${whyOption.side}` : "No Strike"}</b>
                  <small>{whySetup.noTradeReason || whySetup.action}</small>
                </div>
                <div>
                  <span className="metric-label">Score</span>
                  <b>{formatNum(whySetup.score, 0)}</b>
                  <small>{whySetup.action}</small>
                </div>
                <div>
                  <span className="metric-label">Plan</span>
                  <b>{formatPremium(whySetup.plan?.entry)} / {formatPremium(whySetup.plan?.target)} / {formatPremium(whySetup.plan?.stoploss)}</b>
                  <small>Entry / Target / SL</small>
                </div>
              </div>
              <div className="why-verdict-grid">
                {verdictItems.map((item) => (
                  <div className={`why-verdict-card ${item.tone}`} key={item.label}>
                    <div className="verdict-header">
                      <span>{item.label}</span>
                      <Tag 
                        color={item.tone} 
                        icon={item.tone === 'success' ? <CheckCircleFilled /> : item.tone === 'error' ? <CloseCircleFilled /> : <ExclamationCircleFilled />}
                        style={{ fontWeight: 'bold' }}
                      >
                        {item.status}
                      </Tag>
                    </div>
                    <p>{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="why-grouped-sections">
              {whyGroups.map(group => {
                // Move warning/errors to the top inside each group so they stand out
                const sortedItems = [...group.items].sort((a, b) => {
                  const val = (t) => t === 'error' ? 3 : t === 'warning' ? 2 : 1;
                  return val(b.tone) - val(a.tone);
                });

                return (
                  <div key={group.title} className="why-group-section">
                    <h4 className="why-group-title">{group.title}</h4>
                    <div className="why-grid">
                      {sortedItems.map((item) => (
                        <div className={`why-check ${item.tone}`} key={item.label}>
                          <div>
                            <span>{item.label}</span>
                            <Tag color={item.tone}>{item.status}</Tag>
                          </div>
                          <p>{item.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="why-details-grid">
              <div><span>PCR</span><b>{formatNum(whySetup.pcr, 2)}</b></div>
              <div><span>OI</span><b>{formatInt(whyOption?.oi)}</b></div>
              <div><span>OI Chg</span><b>{formatInt(whyOption?.oiChange)}</b></div>
              <div><span>IV</span><b>{formatNum(whyOption?.iv, 2)}</b></div>
              <div><span>Delta</span><b>{formatNum(whyOption?.delta, 2)}</b></div>
              <div><span>Theta</span><b>{formatNum(whyOption?.theta, 2)}</b></div>
            </div>
            {whySetup.warnings?.length ? (
              <div className="why-warning-list">
                {whySetup.warnings.slice(0, 6).map((item) => <Tag color="warning" key={item}>{item}</Tag>)}
              </div>
            ) : null}
          </div>
        ) : (
          <Empty description="No setup details yet" />
        )}
      </Modal>
    </SectionCard>
  );
}


function IndexSummaryCard({ symbol, card, strip, advanceDecline, onOpen, onQuick }) {
  const spot = card?.spot || {};
  const priceRef = {
    ...spot,
    ltp: strip?.ltp ?? spot?.ltp,
    change: strip?.change ?? spot?.change,
    change_pct: strip?.change_pct ?? spot?.change_pct,
  };
  const future = normalizeFutureForDisplay(priceRef, card?.future || {});
  const analytics = card?.analytics || {};
  const price = priceRef?.ltp ?? future?.ltp;
  const change = priceRef?.change ?? future?.change;
  const changePct = priceRef?.change_pct ?? future?.change_pct;
  const bias = biasFromChange(changePct, card?.quickBias || analytics?.sentiment?.bias || "Neutral");
  const adAdv = advanceDecline?.advances;
  const adDec = advanceDecline?.declines;
  const adTotal = advanceDecline?.total;

  return (
    <Card className="pro-card index-card" styles={{ body: { padding: 0 } }}>
      <div className="index-card-band" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase text-slate-500">{INDEX_LABELS[symbol] || symbol}</div>
            <div className="mt-1 text-3xl font-black leading-none">{formatPrice(price)}</div>
            <div className="mt-2 text-sm font-bold"><ChangeText change={change} changePct={changePct} /></div>
          </div>
          <Tag color={toneFromBias(bias)}>{bias}</Tag>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MetricTile label="PCR" value={formatNum(analytics?.pcr, 2)} />
          <MetricTile label="Max Pain" value={formatPrice(analytics?.maxPain)} />
          <MetricTile
            label="Adv / Dec"
            value={isNum(adAdv) || isNum(adDec) ? `${formatInt(adAdv)} / ${formatInt(adDec)}` : "-"}
            sub={isNum(adTotal) ? `Tracked ${formatInt(adTotal)}` : ""}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-8 text-xs">
          <span><b>Support</b> {formatPrice(analytics?.supports?.[0] ?? analytics?.putWall)}</span>
          <span><b>Resistance</b> {formatPrice(analytics?.resistances?.[0] ?? analytics?.callWall)}</span>
          <span><b>Straddle</b> {formatPrice(analytics?.straddle?.straddle)}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <Button icon={<EyeOutlined />} onClick={() => onQuick(symbol)}>Quick View</Button>
          <Button type="primary" icon={<DashboardOutlined />} onClick={() => onOpen(symbol)}>Open Terminal</Button>
        </div>
      </div>
    </Card>
  );
}

function TradeBanner({ signal = {}, option, quality, underlyingPrice }) {
  const optionPlan = buildOptionBuyerPlan(signal, option, underlyingPrice);
  const rr = optionPlan?.riskReward ?? signal?.riskReward;
  const command = option ? `${option.side === "PE" ? "Buy PE" : "Buy CE"} ${formatPrice(option.strike)}` : signal?.action || "Wait";
  const status = quality?.label || "Wait";

  return (
    <div className={`trade-banner ${quality?.tone || "warning"}`}>
      <div className="trade-banner-main">
        <div>
          <div className="metric-label">Execution Decision</div>
          <div className="trade-banner-title">{command}</div>
          <div className="trade-banner-sub">
            {option ? `${getOptionMoneyness(option, underlyingPrice,  getStrikeStep([option]))} Premium` : "No directional strike selected."}
            {isNum(signal?.confidence) ? ` | Confidence ${formatNum(signal.confidence, 0)}%` : ""}
          </div>
          <div className="trade-banner-reason">{quality?.reason || "Wait for price, option-chain, and risk confirmation."}</div>
        </div>
        <div className="trade-status-stack">
          <Tag color={toneFromBias(signal?.bias)}>{signal?.bias || "Neutral"}</Tag>
          <Tag color={quality?.tone || "default"}>{status}</Tag>
          {isNum(rr) ? <strong>R:R {formatNum(rr, 2)}</strong> : null}
        </div>
      </div>

      <div className="execution-grid">
        <div><span>Entry</span><b>{formatPremium(optionPlan?.entry)}</b><small>{isNum(optionPlan?.indexTrigger) ? `Index ${formatPrice(optionPlan.indexTrigger)}` : "-"}</small></div>
        <div><span>Target</span><b>{formatPremium(optionPlan?.target)}</b><small>{isNum(optionPlan?.indexTarget) ? `Index ${formatPrice(optionPlan.indexTarget)}` : "-"}</small></div>
        <div><span>SL</span><b>{formatPremium(optionPlan?.stoploss)}</b><small>{isNum(optionPlan?.indexStop) ? `Invalid ${formatPrice(optionPlan.indexStop)}` : "-"}</small></div>
        <div><span>Selected</span><b>{option ? `${formatPrice(option.strike)} ${option.side}` : "-"}</b><small>{option ? `Score ${formatNum(option.score, 0)}` : "Wait"}</small></div>
      </div>
    </div>
  );
}

function OpenInterestChart({ detail }) {
  const [chartMode, setChartMode] = useState("oi");
  const analytics = detail?.analytics || {};
  const spot = detail?.spot || {};
  const chain = detail?.optionChain || [];
  const atm = getAtmStrike(chain, analytics, spot);
  const displayRows = filterNearAtm(chain, atm, 9);
  const modeIsChange = chartMode === "change";
  const maxOi = Math.max(
    1,
    ...displayRows.flatMap((row) => modeIsChange
      ? [Math.abs(asNum(row?.ce_oich, 0)), Math.abs(asNum(row?.pe_oich, 0))]
      : [asNum(row?.ce_oi, 0), asNum(row?.pe_oi, 0)]
    )
  );
  const totalCallOi = displayRows.reduce((sum, row) => sum + asNum(row?.ce_oi, 0), 0);
  const totalPutOi = displayRows.reduce((sum, row) => sum + asNum(row?.pe_oi, 0), 0);
  const totalCallOiChange = displayRows.reduce((sum, row) => sum + asNum(row?.ce_oich, 0), 0);
  const totalPutOiChange = displayRows.reduce((sum, row) => sum + asNum(row?.pe_oich, 0), 0);
  const pcr = totalCallOi > 0 ? totalPutOi / totalCallOi : null;
  const insight = getOiChartInsight({
    modeIsChange,
    totalCallOi,
    totalPutOi,
    totalCallOiChange,
    totalPutOiChange,
    pcr,
    analytics,
    atm,
  });

  if (!displayRows.length) {
    return (
      <div className="oi-chart-empty">
        <b>Open Interest chart unavailable</b>
        <span>Option-chain strikes are still loading.</span>
      </div>
    );
  }

  return (
    <div className="oi-chart-wrap">
      <div className="oi-chart-head">
        <div>
          <b>{modeIsChange ? "Open Interest Change" : "Open Interest"}</b>
          <span>{atm ? `${formatPrice(atm)} ATM` : "Near ATM strikes"}</span>
        </div>
        <Segmented
          size="small"
          value={chartMode}
          onChange={setChartMode}
          options={[
            { label: "OI", value: "oi" },
            { label: "OI Chg", value: "change" },
          ]}
        />
        <div className="oi-legend">
          <span><i className="put" /> Put OI</span>
          <span><i className="call" /> Call OI</span>
        </div>
      </div>
      <div className="oi-chart">
        {displayRows.map((row) => {
          const isAtm = Number(row?.strike) === Number(atm);
          const putValue = modeIsChange ? Math.abs(asNum(row?.pe_oich, 0)) : asNum(row?.pe_oi, 0);
          const callValue = modeIsChange ? Math.abs(asNum(row?.ce_oich, 0)) : asNum(row?.ce_oi, 0);
          const putHeight = Math.max(3, (putValue / maxOi) * 100);
          const callHeight = Math.max(3, (callValue / maxOi) * 100);
          return (
            <div className={`oi-strike ${isAtm ? "atm" : ""}`} key={`oi-${row?.strike}`}>
              <div className="oi-bars">
                <Tooltip title={modeIsChange ? `Put OI Change ${formatInt(row?.pe_oich)}` : `Put OI ${formatInt(row?.pe_oi)} | Change ${formatInt(row?.pe_oich)}`}>
                  <span className="oi-bar put" style={{ height: `${putHeight}%` }} />
                </Tooltip>
                <Tooltip title={modeIsChange ? `Call OI Change ${formatInt(row?.ce_oich)}` : `Call OI ${formatInt(row?.ce_oi)} | Change ${formatInt(row?.ce_oich)}`}>
                  <span className="oi-bar call" style={{ height: `${callHeight}%` }} />
                </Tooltip>
              </div>
              <small>{formatPrice(row?.strike)}</small>
            </div>
          );
        })}
      </div>
      <div className={`oi-insight ${insight.tone}`}>
        <div className="oi-insight-main">
          <span>OI Read</span>
          <b>{insight.label}</b>
          <small>{insight.detail}</small>
        </div>
        <div className="oi-insight-chips">
          {insight.chips.map((chip) => (
            <span className={chip.tone || ""} key={`${chip.label}-${chip.value}`}>
              {chip.label}
              <b>
                {isNum(chip.directionValue)
                  ? <DirectionValue value={chip.directionValue}>{chip.value}</DirectionValue>
                  : chip.value}
              </b>
            </span>
          ))}
        </div>
      </div>
      <div className="oi-summary">
        <div><span>{modeIsChange ? "Put OI Chg" : "Total Put OI"}</span><b>{formatCompactInt(modeIsChange ? totalPutOiChange : totalPutOi)}</b></div>
        <div><span>{modeIsChange ? "Call OI Chg" : "Total Call OI"}</span><b>{formatCompactInt(modeIsChange ? totalCallOiChange : totalCallOi)}</b></div>
        <div><span>PCR</span><b>{formatNum(pcr, 2)}</b></div>
      </div>
    </div>
  );
}

function OptionChainTable({ detail }) {
  const analytics = detail?.analytics || {};
  const spot = detail?.spot || {};
  const chain = detail?.optionChain || [];
  const atm = getAtmStrike(chain, analytics, spot);
  const displayRows = filterNearAtm(chain, atm, 9);

  const columns = [
    { title: "CE LTP", dataIndex: "ce_ltp", render: formatPrice, align: "right" },
    { title: "CE Open Interest", dataIndex: "ce_oi", render: formatInt, align: "right" },
    { title: "CE OI Change", dataIndex: "ce_oich", render: (v) => <span className={classBySign(v)}><DirectionIcon value={v} />{formatInt(v)}</span>, align: "right" },
    { title: "CE Vol", dataIndex: "ce_volume", render: formatInt, align: "right" },
    { title: "Strike", dataIndex: "strike", render: (v) => <strong>{formatPrice(v)}</strong>, align: "center" },
    { title: "PE Vol", dataIndex: "pe_volume", render: formatInt, align: "right" },
    { title: "PE OI Change", dataIndex: "pe_oich", render: (v) => <span className={classBySign(v)}><DirectionIcon value={v} />{formatInt(v)}</span>, align: "right" },
    { title: "PE Open Interest", dataIndex: "pe_oi", render: formatInt, align: "right" },
    { title: "PE LTP", dataIndex: "pe_ltp", render: formatPrice, align: "right" },
    {
      title: "Tags",
      render: (_, row) => (
        <Space size={4} wrap>
          {Number(row?.strike) === Number(atm) ? <Tag color="blue">ATM</Tag> : null}
          {(analytics?.supports || []).includes(row?.strike) ? <Tag color="green">Support</Tag> : null}
          {(analytics?.resistances || []).includes(row?.strike) ? <Tag color="red">Resistance</Tag> : null}
          {Number(analytics?.putWall) === Number(row?.strike) ? <Tag color="green">Put Wall</Tag> : null}
          {Number(analytics?.callWall) === Number(row?.strike) ? <Tag color="red">Call Wall</Tag> : null}
        </Space>
      ),
    },
  ];

  return (
    <Table
      className="option-table"
      rowKey={(row) => row?.strike}
      columns={columns}
      dataSource={displayRows}
      size="small"
      pagination={false}
      scroll={{ x: 1080 }}
      rowClassName={(row) => {
        const names = [];
        if (Number(row?.strike) === Number(atm)) names.push("atm-row");
        if ((analytics?.supports || []).includes(row?.strike)) names.push("support-row");
        if ((analytics?.resistances || []).includes(row?.strike)) names.push("resistance-row");
        return names.join(" ");
      }}
    />
  );
}

function OptionChainContent({ detail, framed = true }) {
  const analytics = detail?.analytics || {};
  const spot = detail?.spot || {};
  const chain = detail?.optionChain || [];
  const atm = getAtmStrike(chain, analytics, spot);

  const body = (
    <div className="grid gap-4">
      <OpenInterestChart detail={detail} />
      <OptionChainTable detail={detail} />
    </div>
  );

  if (!framed) return body;

  return (
    <SectionCard title={`Live Option Chain${atm ? ` Near ATM ${formatPrice(atm)}` : ""}`} icon={<BarChartOutlined />}>
      {body}
    </SectionCard>
  );
}

function ChartPopupContent({ detail = {}, symbol, pcrHistory = {}, optionSignalHistory = {}, stripByLabel = {}, themeMode = "light", autoRefresh = true, fullPage = false }) {
  const item = symbol || detail?.symbol;
  const [resolution, setResolution] = useState("5");
  const [chartView, setChartView] = useState("fyers");
  const [instrumentView, setInstrumentView] = useState("index");
  const [fyersChart, setFyersChart] = useState(() => loadCachedFyersChart(item, "5", "index"));
  const [chartLoading, setChartLoading] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const [showLongSignals, setShowLongSignals] = useState(false);
  const [showShortSignals, setShowShortSignals] = useState(false);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const [chartError, setChartError] = useState("");
  const [popupDetail, setPopupDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [liveQuote, setLiveQuote] = useState(null);
  const [liveFeed, setLiveFeed] = useState("REST");
  const handleResolutionChange = useCallback((val) => {
    setResolution(val);
    setFyersChart({ candles: [], ok: false });
    setChartError("");
  }, []);
  const effectiveDetail = useMemo(() => {
    if (!popupDetail?.symbol) return detail || {};
    return {
      ...(detail || {}),
      ...popupDetail,
      spot: cleanMerge(detail?.spot, popupDetail?.spot),
      future: cleanMerge(detail?.future, popupDetail?.future),
      analytics: cleanMerge(detail?.analytics, popupDetail?.analytics),
      optionChain: popupDetail?.optionChain?.length ? popupDetail.optionChain : detail?.optionChain || [],
    };
  }, [detail, popupDetail]);
  const analytics = effectiveDetail?.analytics || {};
  const strip = getStripForSymbol(stripByLabel, item);
  const priceRef = {
    ...(effectiveDetail?.spot || {}),
    ltp: liveQuote?.ltp ?? strip?.ltp ?? effectiveDetail?.spot?.ltp ?? effectiveDetail?.future?.ltp,
    change: liveQuote?.change ?? strip?.change ?? effectiveDetail?.spot?.change ?? effectiveDetail?.future?.change,
    change_pct: liveQuote?.change_pct ?? strip?.change_pct ?? effectiveDetail?.spot?.change_pct ?? effectiveDetail?.future?.change_pct,
  };
  const underlyingPrice = asNum(priceRef?.ltp ?? effectiveDetail?.spot?.ltp ?? effectiveDetail?.future?.ltp);
  const signal = analytics?.tradeSignalPanel || deriveBuyerSignal(effectiveDetail);
  const option = selectTradableOption(effectiveDetail?.optionChain || [], underlyingPrice, signal?.bias) ||
    selectDisplayOption(effectiveDetail?.optionChain || [], underlyingPrice, signal?.bias);
  const strikeChartReady = option && isNum(option.strike) && ["CE", "PE"].includes(String(option.side || "").toUpperCase());
  const activeChartScope = instrumentView === "strike" && strikeChartReady ? "strike" : "index";
  const activeChartKey = activeChartScope === "strike" ? (option?.historySymbol || `${item}-${option.strike}-${option.side}`) : item;
  const activeChartTitle = activeChartScope === "strike"
    ? `${formatPrice(option.strike)} ${option.side} Premium Chart`
    : `${INDEX_LABELS[item] || item} Index Chart`;
  const activeLivePrice = activeChartScope === "strike" ? option?.premium : priceRef.ltp;
  const pcrTrack = getPcrTracker(pcrHistory, item, analytics?.pcr);
  const optionTrack = getOptionSignalTracker(optionSignalHistory, item, option);
  const levelSnapshot = getCardLevels(effectiveDetail, strip);
  const chartLevelLines = [
    ...(levelSnapshot.supports || []).map((price, index) => ({ price, label: `S${index + 1}`, tone: "support" })),
    ...(levelSnapshot.resistances || []).map((price, index) => ({ price, label: `R${index + 1}`, tone: "resistance" })),
  ];

  useEffect(() => {
    setPopupDetail(null);
    setDetailLoading(false);
    setInstrumentView("index");
  }, [item]);

  useEffect(() => {
    if (!strikeChartReady && instrumentView === "strike") setInstrumentView("index");
  }, [instrumentView, strikeChartReady]);

  useEffect(() => {
    if (!item) return undefined;
    let cancelled = false;
    const loadPopupDetail = async () => {
      try {
        setDetailLoading(true);
        const json = await fetchJson(`/api/dashboard?symbol=${item}`, 60000);
        if (!cancelled && json?.symbol) {
          setPopupDetail(json);
        }
      } catch (err) {
        console.warn(`chart popup detail failed for ${item}`, err);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    loadPopupDetail();
    return () => {
      cancelled = true;
    };
  }, [item]);

  useEffect(() => {
    let cancelled = false;
    const loadRealChart = async (silent = false) => {
      if (!item) return;
      if (!silent) {
        setChartLoading(true);
        setChartError("");
        setFyersChart({ candles: [], ok: false });
      }
      try {
        const lookback = getChartLookback(resolution);
        const optionPart = activeChartScope === "strike"
          ? `&optionStrike=${encodeURIComponent(option.strike)}&optionSide=${encodeURIComponent(option.side)}${option?.historySymbol ? `&rawSymbol=${encodeURIComponent(option.historySymbol)}` : ""}`
          : "";
        const json = await fetchJson(`/api/fyers/history?symbol=${item}&resolution=${resolution}&lookback=${lookback}${optionPart}`, 30000);
        if (cancelled) return;
        if (!json?.ok || !isFreshChartPayload(json, resolution)) {
          const cached = loadCachedFyersChart(activeChartKey, resolution, activeChartScope);
          if (cached?.candles?.length) {
            setFyersChart(cached);
            setChartError("");
          } else {
            setFyersChart({ candles: [], ok: false });
            setChartError(json?.error || "Fresh Fyers chart data unavailable");
          }
        } else {
          setFyersChart(json);
          storeCachedFyersChart(activeChartKey, resolution, json, activeChartScope);
          setChartError("");
        }
      } catch (err) {
        if (!cancelled) {
          const cached = loadCachedFyersChart(activeChartKey, resolution, activeChartScope);
          if (cached?.candles?.length) {
            setFyersChart(cached);
            setChartError("");
          } else {
            setFyersChart({ candles: [], ok: false });
            setChartError(String(err?.message || err));
          }
        }
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    loadRealChart();
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      if (isAfterMarketClose()) return;
      loadRealChart(true);
    }, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeChartKey, activeChartScope, item, option?.historySymbol, option?.side, option?.strike, resolution, autoRefresh]);

  useEffect(() => {
    setLiveQuote(null);
    setLiveFeed("REST");
  }, [item]);

  useEffect(() => {
    if (!autoRefresh || !item || typeof EventSource === "undefined" || isAfterMarketClose()) return undefined;
    const stream = new EventSource(`/api/fyers/stream?symbol=${item}`);
    stream.onopen = () => setLiveFeed("WS");
    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        const tick = payload?.tick || {};
        if (isNum(tick?.ltp)) {
          setLiveFeed("WS");
          setLiveQuote((prev) => ({
            ...(prev || {}),
            ltp: tick.ltp,
            change: tick.change ?? prev?.change,
            change_pct: tick.change_pct ?? prev?.change_pct,
            updated_at: tick.timestamp || payload?.status?.updated_at,
          }));
        }
      } catch (err) {
        console.warn("fyers stream parse error", err);
      }
    };
    stream.onerror = () => {
      setLiveFeed("REST");
    };
    return () => {
      stream.close();
    };
  }, [item, autoRefresh]);

  useEffect(() => {
    let cancelled = false;
    const loadLiveQuote = async () => {
      if (!item) return;
      try {
        const json = await fetchJson("/api/home-ticker", 12000);
        if (cancelled) return;
        const map = {};
        (json?.marketStrip || []).forEach((row) => {
          map[String(row?.label || "").toUpperCase()] = row;
        });
        const latest = getStripForSymbol(map, item);
        if (latest && hasQuoteValue(latest)) {
          setLiveQuote(latest);
        }
      } catch (err) {
        console.warn("chart live quote error", err);
      }
    };

    loadLiveQuote();
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      if (isAfterMarketClose()) return;
      loadLiveQuote();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [item, autoRefresh]);

  return (
    <div className={`chart-popup ${fullPage ? "full-page-content" : ""}`}>
      <div className="chart-popup-head">
        <div>
          <span>{INDEX_LABELS[item] || item}</span>
          <b>{formatPrice(priceRef.ltp)}</b>
        </div>
        <strong><ChangeText change={priceRef.change} changePct={priceRef.change_pct} /></strong>
      </div>
      <div className="real-chart-panel">
        <div className="real-chart-controls">
          <Space size={8} wrap>
            <Segmented
              size="small"
              value={resolution}
              onChange={handleResolutionChange}
              options={[
                { label: "1m", value: "1" },
                { label: "2m", value: "2" },
                { label: "5m", value: "5" },
                { label: "15m", value: "15" },
                { label: "30m", value: "30" },
                { label: "1h", value: "60" },
                { label: "1D", value: "D" },
              ]}
            />
            <Segmented
              size="small"
              value={chartView}
              onChange={setChartView}
              options={[
                { label: "Fyers Data", value: "fyers" },
                { label: "TradingView", value: "tradingview" },
              ]}
            />
            <Segmented
              size="small"
              value={activeChartScope}
              onChange={(value) => setInstrumentView(value)}
              options={[
                { label: "Index", value: "index" },
                { label: strikeChartReady ? "Strike" : "Strike N/A", value: "strike", disabled: !strikeChartReady },
              ]}
            />
          </Space>
          <Space size={6}>
            {chartLoading || detailLoading ? <Spin size="small" /> : null}
            <Tag color={chartView === "tradingview" ? "processing" : fyersChart?.ok ? "success" : "warning"}>
              {chartView === "tradingview" ? TRADINGVIEW_SYMBOLS[item] || "TradingView" : fyersChart?.sourceSymbol || "Fyers"}
            </Tag>
            <Tag color={liveFeed === "WS" ? "success" : "processing"}>{liveFeed === "WS" ? "WS" : "Quote 2s"}</Tag>
            {chartView === "fyers" ? <Tag color="processing">Candles 45s</Tag> : null}
            {chartView === "fyers" ? <Checkbox className="signal-checkbox" checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)}>Signals</Checkbox> : null}
            {chartView === "fyers" ? <Checkbox checked={showLongSignals} onChange={(e) => setShowLongSignals(e.target.checked)}>Long</Checkbox> : null}
            {chartView === "fyers" ? <Checkbox checked={showShortSignals} onChange={(e) => setShowShortSignals(e.target.checked)}>Short</Checkbox> : null}
            {chartView === "fyers" ? <Checkbox className="vwap-checkbox" checked={showVWAP} onChange={(e) => setShowVWAP(e.target.checked)}>VWAP</Checkbox> : null}
            {chartView === "fyers" ? <Checkbox className="zones-checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)}>S/R Levels</Checkbox> : null}
          </Space>
        </div>
        {chartView === "tradingview" ? (
          <Alert
            type="warning"
            showIcon
            message="TradingView blocks this NSE index inside the embedded widget."
            description="That is why the widget showed a notification and then loaded another stock. Use the button below to open the exact TradingView chart in a new tab; use Fyers Data here for the correct live dashboard chart."
          />
        ) : null}
        {chartView === "fyers" && chartError && !fyersChart?.candles?.length ? <Alert type="warning" showIcon title={chartError} /> : null}
        {chartView === "tradingview" ? (
          <TradingViewLaunchPanel symbol={item} />
        ) : chartLoading && !fyersChart?.candles?.length ? (
          <div className="real-chart-empty">
            <Spin />
            <b>Loading Fyers candles</b>
            <span>Fetching live candle history from Fyers.</span>
          </div>
        ) : (
          <FyersCandleChart
            candles={fyersChart?.candles || []}
            updatedAt={liveQuote?.updated_at || fyersChart?.timestamp}
            resolution={fyersChart?.resolution || resolution}
            livePrice={activeLivePrice}
            themeMode={themeMode}
            height={fullPage ? 660 : 540}
            levels={activeChartScope === "index" ? chartLevelLines : []}
            title={activeChartTitle}
            sourceLabel={fyersChart?.window ? `Session ${fyersChart.window}` : fyersChart?.source === "quote_fallback" ? "Quote fallback" : "Fyers history"}
            showSignals={showSignals || showLongSignals || showShortSignals}
            showLongSignals={showLongSignals}
            showShortSignals={showShortSignals}
            showVWAP={showVWAP}
            showZones={showZones}
          />
        )}
      </div>
      <div className="metric-grid">
        <MetricTile label="Support 1 / 2 / 3" value={formatLevelList(levelSnapshot.supports)} sub="Major put wall + previous levels" tone="up" />
        <MetricTile label="Resistance 1 / 2 / 3" value={formatLevelList(levelSnapshot.resistances)} sub="Major call wall + previous levels" tone="down" />
        <MetricTile label="PCR" value={<DirectionValue value={pcrTrack.delta1h ?? pcrTrack.delta15m ?? pcrTrack.delta}>{formatNum(pcrTrack.current, 2)}</DirectionValue>} sub={pcrTrack.changeLabel} />
        <MetricTile label="Strike" value={option ? `${formatPrice(option.strike)} ${option.side}` : "-"} sub={option?.moneyness || "Option chain watch"} />
        <MetricTile label="Premium Momentum" value={<DirectionValue value={optionTrack.premiumDelta}>{formatPremium(option?.premium)}</DirectionValue>} sub={optionTrack.premiumLabel || ""} />
        <MetricTile label="Open Interest" value={<DirectionValue value={option?.oiChange}>{formatInt(option?.oi)}</DirectionValue>} sub={isNum(option?.oiChange) ? `OI chg ${formatInt(option.oiChange)}` : ""} />
        <MetricTile label="IV / Volume" value={formatNum(option?.iv, 2)} sub={optionTrack.volumeLabel || ""} />
      </div>
    </div>
  );
}

function ThreeIndexChartsContent({ stripByLabel = {}, themeMode = "light", autoRefresh = true, fullPage = false }) {
  const [resolution, setResolution] = useState("5");
  const [chartMap, setChartMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSignals, setShowSignals] = useState(false);
  const [showLongSignals, setShowLongSignals] = useState(false);
  const [showShortSignals, setShowShortSignals] = useState(false);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showZones, setShowZones] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadCharts = async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError("");
        setChartMap({});
      }
      try {
        const lookback = getChartLookback(resolution);
        const results = await Promise.allSettled(
          INDEXES.map(async (item) => {
            const json = await fetchJson(`/api/fyers/history?symbol=${item}&resolution=${resolution}&lookback=${lookback}`, 30000);
            return [item, json];
          })
        );
        if (cancelled) return;
        const next = {};
        const errors = [];
        results.forEach((result) => {
          if (result.status !== "fulfilled") {
            errors.push(String(result.reason?.message || result.reason || "Chart fetch failed"));
            return;
          }
          const [item, json] = result.value || [];
          if (!item) return;
          if (!json?.ok) {
            errors.push(`${INDEX_LABELS[item] || item}: ${json?.error || "Fyers chart unavailable"}`);
            return;
          }
          next[item] = json;
        });
        setChartMap((prev) => ({ ...(prev || {}), ...next }));
        setError(errors[0] || "");
      } catch (err) {
        if (!cancelled) setError(String(err?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCharts();
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      if (isAfterMarketClose()) return;
      loadCharts(true);
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [resolution, autoRefresh]);

  return (
    <div className={`three-chart-popup ${fullPage ? "full-page-content" : ""}`}>
      <div className="three-chart-toolbar">
        <Space size={8} wrap>
          <Segmented
            size="small"
            value={resolution}
            onChange={setResolution}
            options={[
              { label: "1m", value: "1" },
              { label: "2m", value: "2" },
              { label: "5m", value: "5" },
              { label: "15m", value: "15" },
              { label: "30m", value: "30" },
              { label: "1h", value: "60" },
              { label: "1D", value: "D" },
            ]}
          />
          <Checkbox checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)}>Signals</Checkbox>
          <Checkbox checked={showLongSignals} onChange={(e) => setShowLongSignals(e.target.checked)}>Long</Checkbox>
          <Checkbox checked={showShortSignals} onChange={(e) => setShowShortSignals(e.target.checked)}>Short</Checkbox>
          <Checkbox checked={showVWAP} onChange={(e) => setShowVWAP(e.target.checked)}>VWAP</Checkbox>
          <Checkbox checked={showZones} onChange={(e) => setShowZones(e.target.checked)}>S/R Levels</Checkbox>
        </Space>
        {loading ? <Spin size="small" /> : <Tag color="processing">Candles 10s</Tag>}
      </div>
      {error ? <Alert type="warning" showIcon title={error} /> : null}
      <div className="three-chart-grid">
        {INDEXES.map((item) => {
          const strip = getStripForSymbol(stripByLabel, item);
          const chart = chartMap?.[item] || {};
          const lastCandle = Array.isArray(chart?.candles) ? chart.candles[chart.candles.length - 1] : null;
          const livePrice = strip?.ltp ?? lastCandle?.close;
          return (
            <div className="three-chart-card" key={item}>
              <div className="three-chart-head">
                <div>
                  <span>{INDEX_LABELS[item] || item}</span>
                  <b className={`price-tone ${toneBySign(strip?.change_pct ?? strip?.change)}`}>{formatPrice(livePrice)}</b>
                </div>
                <strong><ChangeText change={strip?.change} changePct={strip?.change_pct} /></strong>
              </div>
              <FyersCandleChart
                candles={chart?.candles || []}
                updatedAt={strip?.updated_at || chart?.timestamp}
                resolution={chart?.resolution || resolution}
                livePrice={livePrice}
                themeMode={themeMode}
                height={fullPage ? 520 : 300}
                compact
                showSignals={showSignals || showLongSignals || showShortSignals}
                showLongSignals={showLongSignals}
                showShortSignals={showShortSignals}
                showVWAP={showVWAP}
                showZones={showZones}
                title={`${INDEX_LABELS[item] || item} ${formatResolutionLabel(resolution)}`}
                sourceLabel={chart?.window ? `Session ${chart.window}` : chart?.source === "quote_fallback" ? "Quote fallback" : "Fyers history"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DualChartPage({ cards = {}, setups = [], stripByLabel = {}, selectedSymbol = "NIFTY", onSymbolChange, themeMode = "light", autoRefresh = true, setView, sidebarVisible, setSidebarVisible }) {
  const safeInitialSymbol = INDEXES.includes(selectedSymbol) ? selectedSymbol : "NIFTY";
  const [chartSymbol, setChartSymbol] = useState(safeInitialSymbol);
  const [resolution, setResolution] = useState("5");
  const [side, setSide] = useState("CE");
  const [strike, setStrike] = useState("");
  const [chartMap, setChartMap] = useState({ index: null, strike: null });
  const [chartDetail, setChartDetail] = useState(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chainRowCount, setChainRowCount] = useState(12);
  const [showOptionChain, setShowOptionChain] = useState(true);
  const [showSignals, setShowSignals] = useState(false);
  const [showLongSignals, setShowLongSignals] = useState(false);
  const [showShortSignals, setShowShortSignals] = useState(false);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showZones, setShowZones] = useState(false);

  const setupMap = useMemo(() => setups.reduce((acc, item) => {
    if (item?.symbol) acc[item.symbol] = item;
    return acc;
  }, {}), [setups]);
  const setup = setupMap[chartSymbol] || {};
  const card = cards?.[chartSymbol] || {};
  const fetchedDetail = chartDetail?.symbol === chartSymbol ? chartDetail : {};
  const optionChain = useMemo(
    () => (
      setup?.optionChain?.length
        ? setup.optionChain
        : card?.optionChain?.length
          ? card.optionChain
          : fetchedDetail?.optionChain || []
    ),
    [card?.optionChain, fetchedDetail?.optionChain, setup?.optionChain]
  );
  const activeOption = setup?.option || setup?.displayOption || fetchedDetail?.option || fetchedDetail?.displayOption || {};
  const strip = getStripForSymbol(stripByLabel, chartSymbol);
  const indexLivePrice = strip?.ltp ?? card?.spot?.ltp ?? setup?.spotQuote?.ltp ?? setup?.spot?.ltp ?? fetchedDetail?.spot?.ltp;

  const allStrikeRows = useMemo(
    () => (Array.isArray(optionChain) ? optionChain : [])
      .filter((row) => isNum(row?.strike))
      .sort((a, b) => Number(a.strike) - Number(b.strike)),
    [optionChain]
  );
  const atmStrike = useMemo(() => {
    if (!allStrikeRows.length) return null;
    const reference = asNum(indexLivePrice, asNum(activeOption?.strike, null));
    if (!isNum(reference)) return Number(allStrikeRows[Math.floor(allStrikeRows.length / 2)]?.strike);
    return allStrikeRows.reduce((best, row) => {
      const current = Number(row?.strike);
      const bestValue = Number(best?.strike);
      return Math.abs(current - reference) < Math.abs(bestValue - reference) ? row : best;
    }, allStrikeRows[0])?.strike;
  }, [activeOption?.strike, allStrikeRows, indexLivePrice]);

  const visibleStrikeRows = useMemo(() => {
    if (!allStrikeRows.length) return [];
    const target = isNum(indexLivePrice)
      ? Number(indexLivePrice)
      : isNum(strike)
        ? Number(strike)
        : isNum(activeOption?.strike)
          ? Number(activeOption.strike)
          : Number(allStrikeRows[Math.floor(allStrikeRows.length / 2)]?.strike);
    const closestIndex = allStrikeRows.reduce((best, row, index) => {
      const bestDiff = Math.abs(Number(allStrikeRows[best]?.strike) - target);
      const diff = Math.abs(Number(row?.strike) - target);
      return diff < bestDiff ? index : best;
    }, 0);
    const count = Math.min(Math.max(Number(chainRowCount) || 12, 10), allStrikeRows.length);
    const half = Math.floor(count / 2);
    const start = Math.max(0, Math.min(allStrikeRows.length - count, closestIndex - half));
    return allStrikeRows.slice(start, start + count);
  }, [activeOption?.strike, allStrikeRows, chainRowCount, indexLivePrice, strike]);

  const selectedOptionRow = useMemo(
    () => optionChain.find((row) => Number(row?.strike) === Number(strike)) || null,
    [optionChain, strike]
  );
  const selectedPremium = side === "CE" ? selectedOptionRow?.ce_ltp : selectedOptionRow?.pe_ltp;
  const selectedIv = side === "CE" ? selectedOptionRow?.ce_iv : selectedOptionRow?.pe_iv;
  const selectedOi = side === "CE" ? selectedOptionRow?.ce_oi : selectedOptionRow?.pe_oi;
  const selectedOiChange = side === "CE" ? selectedOptionRow?.ce_oich : selectedOptionRow?.pe_oich;
  const selectedHistorySymbol = side === "CE" ? selectedOptionRow?.ce_symbol : selectedOptionRow?.pe_symbol;
  const strikeLivePrice = isNum(selectedPremium) ? selectedPremium : Number(activeOption?.strike) === Number(strike) && activeOption?.side === side ? activeOption?.premium : null;
  const getOptionPositionLabel = useCallback((rowStrike, optionSide) => {
    const currentStrike = Number(rowStrike);
    const spotValue = asNum(indexLivePrice, null);
    if (!isNum(currentStrike)) return "-";
    if (isNum(atmStrike) && Number(atmStrike) === currentStrike) return "ATM";
    if (!isNum(spotValue)) return "-";
    if (optionSide === "CE") return currentStrike < spotValue ? "ITM" : "OTM";
    if (optionSide === "PE") return currentStrike > spotValue ? "ITM" : "OTM";
    return "-";
  }, [atmStrike, indexLivePrice]);
  const maxVisibleOi = useMemo(() => {
    const values = visibleStrikeRows.flatMap((row) => [
      asNum(row?.ce_oi ?? row?.callOi, 0),
      asNum(row?.pe_oi ?? row?.putOi, 0),
    ]);
    return Math.max(...values, 1);
  }, [visibleStrikeRows]);

  useEffect(() => {
    if (!INDEXES.includes(selectedSymbol) || selectedSymbol === chartSymbol) return;
    setChartSymbol(selectedSymbol);
  }, [chartSymbol, selectedSymbol]);

  useEffect(() => {
    setChartDetail(null);
    setChartMap((prev) => ({
      index: loadCachedFyersChart(chartSymbol, resolution, "dual-index") || prev?.index || null,
      strike: null,
    }));
    const nextSide = ["CE", "PE"].includes(String(activeOption?.side || "").toUpperCase())
      ? String(activeOption.side).toUpperCase()
      : side;
    const nextStrike = isNum(activeOption?.strike)
      ? String(activeOption.strike)
      : isNum(atmStrike)
        ? String(atmStrike)
        : allStrikeRows[0]?.strike ? String(allStrikeRows[0].strike) : "";
    setSide(nextSide);
    setStrike(nextStrike);
    // Reset when index changes; later live setup refreshes should not steal manual selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartSymbol]);

  useEffect(() => {
    if (strike || !allStrikeRows.length) return;
    const nextStrike = isNum(activeOption?.strike)
      ? activeOption.strike
      : isNum(atmStrike)
        ? atmStrike
        : allStrikeRows[Math.floor(allStrikeRows.length / 2)]?.strike;
    if (isNum(nextStrike)) setStrike(String(nextStrike));
  }, [activeOption?.strike, allStrikeRows, atmStrike, strike]);

  useEffect(() => {
    let cancelled = false;
    const loadOptionChain = async (silent = false) => {
      if (!chartSymbol) return;
      if (!silent) setChainLoading(true);
      try {
        const data = await fetchJson(`/api/dashboard?symbol=${chartSymbol}`, 45000);
        if (!cancelled && data?.symbol) {
          setChartDetail(data);
        }
      } catch (err) {
        if (!cancelled && !optionChain.length) {
          setError(String(err?.message || err));
        }
      } finally {
        if (!cancelled) setChainLoading(false);
      }
    };

    loadOptionChain(Boolean(optionChain.length));
    if (!autoRefresh) return () => { cancelled = true; };
    const timer = window.setInterval(() => {
      if (isAfterMarketClose()) return;
      loadOptionChain(true);
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [autoRefresh, chartSymbol, optionChain.length]);

  useEffect(() => {
    let cancelled = false;
    const loadCharts = async (silent = false) => {
      if (!chartSymbol || !strike) return;
      const indexCacheKey = chartSymbol;
      const strikeCacheKey = selectedHistorySymbol || `${chartSymbol}:${strike}:${side}`;
      const cachedIndex = loadCachedFyersChart(indexCacheKey, resolution, "dual-index");
      const cachedStrike = loadCachedFyersChart(strikeCacheKey, resolution, "dual-strike");
      if (!silent && (cachedIndex || cachedStrike)) {
        setChartMap((prev) => ({
          index: cachedIndex || prev?.index || null,
          strike: cachedStrike || prev?.strike || null,
        }));
      }
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const lookback = getChartLookback(resolution);
        const issues = [];

        const loadOneChart = async ({ key, scope, url, label }) => {
          try {
            const json = await fetchJson(url, 30000);
            if (cancelled) return;
            if (json?.ok && isFreshChartPayload(json, resolution)) {
              storeCachedFyersChart(key, resolution, json, scope);
              setChartMap((prev) => ({ ...(prev || {}), [scope === "dual-index" ? "index" : "strike"]: json }));
              return;
            }
            issues.push(json?.error || `${label} chart unavailable`);
          } catch (err) {
            issues.push(`${label}: ${String(err?.message || err)}`);
          }
        };

        await Promise.all([
          loadOneChart({
            key: indexCacheKey,
            scope: "dual-index",
            label: "Index",
            url: `/api/fyers/history?symbol=${chartSymbol}&resolution=${resolution}&lookback=${lookback}`,
          }),
          loadOneChart({
            key: strikeCacheKey,
            scope: "dual-strike",
            label: "Strike",
            url: `/api/fyers/history?symbol=${chartSymbol}&resolution=${resolution}&lookback=${lookback}&optionStrike=${encodeURIComponent(strike)}&optionSide=${encodeURIComponent(side)}${selectedHistorySymbol ? `&rawSymbol=${encodeURIComponent(selectedHistorySymbol)}` : ""}`,
          }),
        ]);
        if (cancelled) return;
        setError(issues.join(" | "));
      } catch (err) {
        if (!cancelled) setError(String(err?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCharts();
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      if (isAfterMarketClose()) return;
      loadCharts(true);
    }, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [autoRefresh, chartSymbol, resolution, selectedHistorySymbol, side, strike]);

  const indexChart = chartMap.index || {};
  const strikeChart = chartMap.strike || {};
  const levelSource = setup?.analytics ? setup : card?.analytics ? card : fetchedDetail?.analytics ? fetchedDetail : card;
  const levelSnapshot = getCardLevels(levelSource, strip);
  const chartLevelLines = [
    ...(levelSnapshot.supports || []).map((price, index) => ({ price, label: `S${index + 1}`, tone: "support" })),
    ...(levelSnapshot.resistances || []).map((price, index) => ({ price, label: `R${index + 1}`, tone: "resistance" })),
  ];
  const strikeLevelSnapshot = useMemo(() => {
    const rows = normalizeHistoryCandles(strikeChart?.candles || []).map((row, index) => ({
      time: row.time || Math.floor(Number(row.ts || 0) / 1000) || index,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    })).filter((row) => isNum(row.close) && isNum(row.high) && isNum(row.low));
    const lastClose = rows[rows.length - 1]?.close;
    if (!rows.length || !isNum(lastClose)) return { supports: [], resistances: [], lines: [] };
    const zones = calculateSupportResistance(rows, 8, 8);
    const supports = uniqueNumbers(zones.filter((zone) => Number(zone.price) <= Number(lastClose)).map((zone) => zone.price))
      .sort((a, b) => b - a)
      .slice(0, 3);
    const resistances = uniqueNumbers(zones.filter((zone) => Number(zone.price) >= Number(lastClose)).map((zone) => zone.price))
      .sort((a, b) => a - b)
      .slice(0, 3);
    return {
      supports,
      resistances,
      lines: [
        ...supports.map((price, index) => ({ price, label: `PS${index + 1}`, tone: "support" })),
        ...resistances.map((price, index) => ({ price, label: `PR${index + 1}`, tone: "resistance" })),
      ],
    };
  }, [strikeChart?.candles]);
  const selectedMoneyness = getOptionPositionLabel(strike, side);
  const selectedStrikeReason = buildSelectedStrikeReason({
    side,
    indexPrice: indexLivePrice,
    premium: strikeLivePrice,
    indexLevels: levelSnapshot,
    premiumLevels: strikeLevelSnapshot,
    oiChange: selectedOiChange,
    moneyness: selectedMoneyness,
  });

  return (
    <div className="dual-chart-page">
      <Card className="pro-card dual-chart-control-card" styles={{ body: { padding: 12 } }}>
        <div className="terminal-contract-head">
          <div>
            <span className="command-eyebrow">Selected Contract</span>
            <h2>
              {INDEX_LABELS[chartSymbol] || chartSymbol}
              <Tag color={side === "CE" ? "blue" : "success"}>{formatPrice(strike)} {side}</Tag>
              <Tag color="default">{selectedMoneyness}</Tag>
            </h2>
            <div className="terminal-contract-price">
              <b>{formatPremium(strikeLivePrice)}</b>
              <span>IV {formatNum(selectedIv, 2)}</span>
              <span>OI {formatCompactInt(selectedOi)}</span>
              <span><DirectionValue value={selectedOiChange}>OI Chg {formatCompactInt(selectedOiChange)}</DirectionValue></span>
            </div>
            <div className="terminal-contract-insight">
              <div className="terminal-level-tile">
                <span>Index S/R</span>
                <b><span className="support-text">S {formatLevelList(levelSnapshot.supports)}</span></b>
                <b><span className="resistance-text">R {formatLevelList(levelSnapshot.resistances)}</span></b>
              </div>
              <div className="terminal-level-tile">
                <span>Strike S/R</span>
                <b><span className="support-text">S {formatLevelList(strikeLevelSnapshot.supports)}</span></b>
                <b><span className="resistance-text">R {formatLevelList(strikeLevelSnapshot.resistances)}</span></b>
              </div>
              <div className={`terminal-trade-reason ${selectedStrikeReason.tone}`}>
                <span>Reason to Trade</span>
                <b>{selectedStrikeReason.title}</b>
                <small>{selectedStrikeReason.text}</small>
              </div>
            </div>
          </div>
          <Space wrap size={8}>
            <Tooltip title="Show or hide sidebar">
              <Switch checked={sidebarVisible} onChange={setSidebarVisible} checkedChildren="Menu" unCheckedChildren="Hide" />
            </Tooltip>
            <Button icon={<HomeOutlined />} onClick={() => setView?.("home")}>
              Dashboard
            </Button>
            <div className="chart-index-select">
              <span>Select Indice</span>
              <Select
                value={chartSymbol}
                style={{ width: 190 }}
                onChange={(value) => {
                  setChartSymbol(value);
                  onSymbolChange?.(value);
                }}
                options={INDEXES.map((item) => ({
                  label: INDEX_DISPLAY_LABELS[item] || INDEX_LABELS[item] || item,
                  value: item,
                }))}
              />
            </div>
            <Button icon={<EyeOutlined />} onClick={() => setShowOptionChain((prev) => !prev)}>
              {showOptionChain ? "Hide OI Chain" : "Show OI Chain"}
            </Button>
            {showOptionChain ? (
              <Select
                value={chainRowCount}
                style={{ width: 106 }}
                options={[
                  { label: "10 rows", value: 10 },
                  { label: "12 rows", value: 12 },
                  { label: "16 rows", value: 16 },
                  { label: "20 rows", value: 20 },
                ]}
                onChange={setChainRowCount}
              />
            ) : null}
            <Segmented
              value={resolution}
              onChange={setResolution}
              options={[
                { label: "5m", value: "5" },
                { label: "15m", value: "15" },
                { label: "30m", value: "30" },
                { label: "1h", value: "60" },
                { label: "1D", value: "D" },
              ]}
            />
            {loading ? <Spin size="small" /> : <Tag color="processing">Auto 12s</Tag>}
            {chainLoading ? <Tag color="warning">Chain loading</Tag> : null}
            <Checkbox checked={showSignals} onChange={(e) => setShowSignals(e.target.checked)}>
              <span className="chart-toggle-label"><LineChartOutlined />Signals</span>
            </Checkbox>
            <Checkbox checked={showLongSignals} onChange={(e) => setShowLongSignals(e.target.checked)}>
              <span className="chart-toggle-label long"><ArrowUpOutlined />Long</span>
            </Checkbox>
            <Checkbox checked={showShortSignals} onChange={(e) => setShowShortSignals(e.target.checked)}>
              <span className="chart-toggle-label short"><ArrowDownOutlined />Short</span>
            </Checkbox>
            <Checkbox checked={showVWAP} onChange={(e) => setShowVWAP(e.target.checked)}>
              <span className="chart-toggle-label"><LineChartOutlined />VWAP</span>
            </Checkbox>
            <Checkbox checked={showZones} onChange={(e) => setShowZones(e.target.checked)}>
              <span className="chart-toggle-label"><ControlOutlined />S/R</span>
            </Checkbox>
          </Space>
        </div>
      </Card>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <div className={`terminal-flow ${showOptionChain ? "" : "chain-hidden"}`}>
        <Card className="pro-card dual-chart-panel terminal-main-index-card" styles={{ body: { padding: 10 } }}>
          {loading && !indexChart?.candles?.length ? (
            <div className="real-chart-empty">
              <Spin size="small" />
              <b>Loading live index chart</b>
              <span>Cached chart will open instantly after the first successful load.</span>
            </div>
          ) : (
            <FyersCandleChart
              candles={indexChart?.candles || []}
              updatedAt={strip?.updated_at || indexChart?.timestamp}
              resolution={indexChart?.resolution || resolution}
              livePrice={indexLivePrice}
              themeMode={themeMode}
              height={520}
              title={`${INDEX_LABELS[chartSymbol] || chartSymbol} Index`}
              sourceLabel={indexChart?.window ? `Session ${indexChart.window}` : indexChart?.source === "quote_fallback" ? "Quote fallback" : "Fyers history"}
              levels={chartLevelLines}
              showSignals={showSignals || showLongSignals || showShortSignals}
              showLongSignals={showLongSignals}
              showShortSignals={showShortSignals}
              showVWAP={showVWAP}
              showZones={showZones}
            />
          )}
        </Card>

        {showOptionChain ? (
        <Card className="pro-card dual-option-card" styles={{ body: { padding: 10 } }}>
          <div className="terminal-panel-title">
            <div>
              <span className="command-eyebrow">Option Chain</span>
              <b>{INDEX_LABELS[chartSymbol] || chartSymbol} {formatPrice(strike)} {side}</b>
            </div>
            <Tag color={side === "CE" ? "blue" : "success"}>{getOptionPositionLabel(strike, side)}</Tag>
          </div>
          <div className="dual-option-chain">
          <div className="dual-option-chain-head">
            <span>Call OI</span>
            <span>Call LTP</span>
            <b>Strike</b>
            <span>Put LTP</span>
            <span>Put OI</span>
          </div>
          <div className="dual-option-chain-body">
            {visibleStrikeRows.length ? visibleStrikeRows.map((row) => {
              const isActiveStrike = Number(row?.strike) === Number(strike);
              const ceActive = isActiveStrike && side === "CE";
              const peActive = isActiveStrike && side === "PE";
              const isAtm = isNum(atmStrike) && Number(row?.strike) === Number(atmStrike);
              const showSpotLine = isNum(indexLivePrice) && Number(row?.strike) > Number(indexLivePrice) && !visibleStrikeRows.some((item) => Number(item?.strike) > Number(indexLivePrice) && Number(item?.strike) < Number(row?.strike));
              const ceOi = asNum(row?.ce_oi ?? row?.callOi, null);
              const peOi = asNum(row?.pe_oi ?? row?.putOi, null);
              const selectOption = (nextSide) => {
                setStrike(String(row.strike));
                setSide(nextSide);
              };
              return (
                <React.Fragment key={row.strike}>
                  {showSpotLine ? (
                    <div className="dual-spot-row">
                      <b>Spot price {formatPrice(indexLivePrice)}</b>
                      <small><ChangeText change={strip?.change} changePct={strip?.change_pct} /></small>
                    </div>
                  ) : null}
                  <div className={`dual-option-row ${isActiveStrike ? "active" : ""} ${isAtm ? "atm" : ""}`}>
                    <span className="dual-oi-cell call" style={{ "--oi-width": `${Math.max(7, Math.min(100, (asNum(ceOi, 0) / maxVisibleOi) * 100))}%` }}>
                      <strong>{formatCompactInt(ceOi)}</strong>
                      <small>OI</small>
                    </span>
                    <button type="button" className={ceActive ? "active ce" : "ce"} onClick={() => selectOption("CE")}>
                      <strong>{formatPremium(row?.ce_ltp)}</strong>
                      <small>{getOptionPositionLabel(row.strike, "CE")} | IV {formatNum(row?.ce_iv, 2)}</small>
                    </button>
                    <b className="dual-strike-cell">
                      {formatPrice(row.strike)}
                      <small>{isAtm ? "ATM" : ""}</small>
                    </b>
                    <button type="button" className={peActive ? "active pe" : "pe"} onClick={() => selectOption("PE")}>
                      <strong>{formatPremium(row?.pe_ltp)}</strong>
                      <small>{getOptionPositionLabel(row.strike, "PE")} | IV {formatNum(row?.pe_iv, 2)}</small>
                    </button>
                    <span className="dual-oi-cell put" style={{ "--oi-width": `${Math.max(7, Math.min(100, (asNum(peOi, 0) / maxVisibleOi) * 100))}%` }}>
                      <strong>{formatCompactInt(peOi)}</strong>
                      <small>OI</small>
                    </span>
                  </div>
                </React.Fragment>
              );
            }) : (
              <div className="dual-option-empty">Option-chain strikes are not loaded yet. Open Token / refresh Fyers login if this stays blank.</div>
            )}
          </div>
        </div>
        </Card>
        ) : null}

        <Card className="pro-card dual-chart-panel terminal-strike-chart-card" styles={{ body: { padding: 10 } }}>
          {loading && !strikeChart?.candles?.length ? (
            <div className="real-chart-empty">
              <Spin size="small" />
              <b>Loading live strike chart</b>
              <span>Strike history is slower than index history; it will not block the index chart.</span>
            </div>
          ) : (
            <FyersCandleChart
              candles={strikeChart?.candles || []}
              updatedAt={strikeChart?.timestamp}
              resolution={strikeChart?.resolution || resolution}
              livePrice={strikeLivePrice}
              themeMode={themeMode}
              height={520}
              title={`${INDEX_LABELS[chartSymbol] || chartSymbol} ${formatPrice(strike)} ${side}`}
              sourceLabel={strikeChart?.window ? `Session ${strikeChart.window}` : strikeChart?.source === "quote_fallback" ? "Quote fallback" : "Fyers option history"}
              levels={strikeLevelSnapshot.lines}
              showSignals={false}
              showVWAP={showVWAP}
              showZones={showZones}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function DetailOptions({ detail }) {
  const analytics = detail?.analytics || {};
  const spot = detail?.spot || {};
  const chain = detail?.optionChain || [];
  const atm = getAtmStrike(chain, analytics, spot);

  return (
    <div className="grid gap-4">
      <OptionChainContent detail={detail} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Option Analytics" icon={<LineChartOutlined />}>
          <div className="metric-grid">
            <MetricTile label="ATM Strike" value={formatPrice(atm)} />
            <MetricTile label="Straddle" value={formatPrice(analytics?.straddle?.straddle)} />
            <MetricTile label="Straddle Low" value={formatPrice(analytics?.straddle?.low)} />
            <MetricTile label="Straddle High" value={formatPrice(analytics?.straddle?.high)} />
            <MetricTile label="OI Concentration" value={isNum(analytics?.oiConcentration) ? `${formatNum(analytics.oiConcentration, 0)}%` : "-"} />
            <MetricTile label="Gamma Summary" value={analytics?.gexSummary?.label || "-"} />
            <MetricTile label="Liquidity" value={analytics?.liquiditySummary?.label || "-"} />
            <MetricTile label="Strongest Build-up" value={analytics?.strongestBuildup?.type || "-"} sub={formatPrice(analytics?.strongestBuildup?.strike)} />
          </div>
        </SectionCard>

        <SectionCard title="Flow Detector" icon={<ThunderboltOutlined />}>
          <div className="metric-grid">
            <MetricTile label="Market Structure" value={analytics?.optionsFlowDetector?.marketStructure?.label || "-"} />
            <MetricTile label="Dominant Event" value={analytics?.optionsFlowDetector?.dominantOptionEvent?.label || "-"} />
            <MetricTile label="Call OI Change" value={formatInt(analytics?.callPutDominance?.callOIChange)} />
            <MetricTile label="Put OI Change" value={formatInt(analytics?.callPutDominance?.putOIChange)} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function TerminalV2Page({
  cards = {},
  setups = [],
  stripByLabel = {},
  selectedSymbol = "NIFTY",
  onSymbolChange,
  themeMode = "light",
  autoRefresh = true,
  pcrHistory = {},
  optionSignalHistory = {},
  gateHistory = [],
  vix = {},
  marketMood = {},
  onOpenV1,
}) {
  const safeSymbol = INDEXES.includes(selectedSymbol) ? selectedSymbol : "NIFTY";
  const terminalSymbol = safeSymbol;

  const setupMap = useMemo(() => setups.reduce((acc, setup) => {
    if (setup?.symbol) acc[setup.symbol] = setup;
    return acc;
  }, {}), [setups]);
  const setup = setupMap[terminalSymbol] || {};
  const card = cards?.[terminalSymbol] || {};
  const strip = getStripForSymbol(stripByLabel, terminalSymbol);
  const levels = getCardLevels(setup?.analytics ? setup : card, strip);
  const option = setup?.option || setup?.displayOption || {};
  const pcrTrack = getPcrTracker(pcrHistory, terminalSymbol, setup?.pcr ?? card?.analytics?.pcr);
  const levelShift = getLevelShiftSignal(optionSignalHistory, terminalSymbol, levels, setup?.analytics || card?.analytics || {});
  const selectedGateRows = Array.isArray(gateHistory)
    ? gateHistory.filter((row) => row?.symbol === terminalSymbol).slice(-8).reverse()
    : [];
  const recentSignalRows = Array.isArray(optionSignalHistory?.[terminalSymbol])
    ? optionSignalHistory[terminalSymbol].slice(-5).reverse()
    : [];
  const marketBias = marketMood?.bias || marketMood?.label || strip?.bias || "-";
  const gateScore = setup?.professionalGate ? `${setup.professionalGate.score}/${setup.professionalGate.total}` : "-";
  const finalDecision = setup?.professionalGate?.decision || setup?.action || setup?.readiness || "WAIT";
  const oiShift = getWriterShiftSignal(setup);
  const spotPrice = firstPositiveValue(strip?.ltp, setup?.spot, setup?.spotQuote?.ltp, card?.spot?.ltp, card?.analytics?.spot);
  const signalAge = getTerminalSignalAge(optionSignalHistory, terminalSymbol, option);
  const nearestLevel = getTerminalNearestLevel(levels, spotPrice, option?.side);
  const conflictMeter = getTerminalConflictMeter({ setup, option, pcrTrack, oiShift });
  const finalTone = String(finalDecision).includes("READY")
    ? "up"
    : String(finalDecision).includes("AVOID")
      ? "down"
      : "warn";
  const finalReason = setup?.professionalGate?.reason || setup?.warnings?.[0] || setup?.noTradeReason || "Waiting for a clean setup.";
  const terminalSymbolChange = (value) => {
    onSymbolChange?.(value);
  };

  return (
    <div className="terminal-v2-page">
      <div className="terminal-v2-head">
        <div>
          <span className="command-eyebrow">Terminal V2</span>
          <h2>{INDEX_LABELS[terminalSymbol] || terminalSymbol}</h2>
          <p>Index chart, option chain, strike chart and decision tape in one workspace.</p>
        </div>
        <Space wrap size={8}>
          <Segmented
            value={terminalSymbol}
            onChange={terminalSymbolChange}
            options={INDEXES.map((item) => ({
              label: (
                <span className={`chart-index-option ${String(item).toLowerCase()}`}>
                  <BarChartOutlined />
                  <span>{INDEX_LABELS[item] || item}</span>
                </span>
              ),
              value: item,
            }))}
          />
          <Button icon={<HomeOutlined />} onClick={onOpenV1}>Dashboard V1</Button>
        </Space>
      </div>

      <div className={`terminal-v2-decision-header ${finalTone}`}>
        <div className="terminal-v2-primary-call">
          <span>Final Action</span>
          <strong>{finalDecision}</strong>
          <small>{finalReason}</small>
        </div>
        <div className={`terminal-v2-signal-chip ${conflictMeter.tone}`}>
          <span>Conflict Meter</span>
          <strong>{conflictMeter.label}</strong>
          <small>{conflictMeter.sub}</small>
        </div>
        <div className={`terminal-v2-signal-chip ${signalAge.tone}`}>
          <span>Signal Age</span>
          <strong>{signalAge.label}</strong>
          <small>{signalAge.sub}</small>
        </div>
        <div className={`terminal-v2-signal-chip ${nearestLevel.tone}`}>
          <span>Nearest Level</span>
          <strong>{nearestLevel.label}</strong>
          <small>{nearestLevel.sub}</small>
        </div>
      </div>

      <div className="terminal-v2-detail-board">
        <SectionCard title="Indexes" icon={<BarChartOutlined />} className="terminal-v2-index-card">
          <div className="terminal-v2-index-list compact">
            {INDEXES.map((item) => {
              const itemSetup = setupMap[item] || {};
              const itemStrip = getStripForSymbol(stripByLabel, item);
              const itemOption = itemSetup?.option || itemSetup?.displayOption || {};
              return (
                <button
                  type="button"
                  key={item}
                  className={item === terminalSymbol ? "active" : ""}
                  onClick={() => terminalSymbolChange(item)}
                >
                  <span>{INDEX_LABELS[item] || item}</span>
                  <b>{formatPrice(itemStrip?.ltp ?? itemSetup?.spot)}</b>
                  <small>{itemOption?.strike ? `${formatPrice(itemOption.strike)} ${itemOption.side}` : "Strike collecting"}</small>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Trade Plan" icon={<ThunderboltOutlined />} className="terminal-v2-plan-card">
          <div className="terminal-v2-focus">
            <b>{option?.strike ? `${formatPrice(option.strike)} ${option.side}` : "No strike selected"}</b>
            <span>{setup?.warnings?.[0] || setup?.noTradeReason || "Waiting for clean trigger."}</span>
            <div className="terminal-v2-mini-grid four">
              <MetricTile label="Entry" value={formatPremium(setup?.plan?.entry)} />
              <MetricTile label="Target" value={formatPremium(setup?.plan?.target)} />
              <MetricTile label="SL" value={formatPremium(setup?.plan?.stoploss)} />
              <MetricTile label="R:R" value={formatNum(setup?.plan?.riskReward, 2)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Market Checks" icon={<ControlOutlined />} className="terminal-v2-check-card">
          <div className="terminal-v2-market-grid">
            <MetricTile label="Bias" value={marketBias} sub={dashboardFeedLabel(strip)} tone={toneBySign(strip?.change_pct ?? strip?.change)} />
            <MetricTile label="Gate Score" value={gateScore} sub={finalDecision} tone={finalTone} />
            <MetricTile label="PCR" value={formatNum(pcrTrack.current, 2)} sub={`${pcrTrack.trendLabel} | 5m ${formatNum(pcrTrack.delta5m, 2)}`} tone={pcrTrack.tone === "success" ? "up" : pcrTrack.tone === "error" ? "down" : "warn"} />
            <MetricTile label="OI Shift" value={oiShift.label} sub={oiShift.note} tone={oiShift.tone === "success" ? "up" : oiShift.tone === "error" ? "down" : "warn"} />
            <MetricTile label="VIX" value={formatNum(vix?.ltp, 2)} sub={formatPct(vix?.change_pct)} tone={toneBySign(vix?.change_pct)} />
            <MetricTile label="Level Shift" value={levelShift.label} sub={levelShift.note} tone={levelShift.tone === "success" ? "up" : levelShift.tone === "error" ? "down" : "warn"} />
          </div>
        </SectionCard>

        <SectionCard title="Event Tape" icon={<EyeOutlined />} className="terminal-v2-tape-card">
          <div className="terminal-v2-tape horizontal">
            <div><ArrowUpOutlined /><span>PCR {pcrTrack.trendLabel}: {formatNum(pcrTrack.current, 2)}</span></div>
            <div><ControlOutlined /><span>S {formatLevelList(levels.supports)} / R {formatLevelList(levels.resistances)}</span></div>
            <div><LineChartOutlined /><span>{oiShift.label}: {formatCompactInt(oiShift.net)}</span></div>
            {recentSignalRows.slice(0, 3).map((row, index) => (
              <div key={`${row.ts || index}-${row.strike}`}><ThunderboltOutlined /><span>{formatPrice(row.strike)} {row.side} premium {formatPremium(row.premium)}</span></div>
            ))}
            {selectedGateRows.slice(0, 2).map((row, index) => (
              <div key={`${row.ts || index}-${row.decision}`}><CheckCircleFilled /><span>{row.decision || "-"} {row.strike ? `${formatPrice(row.strike)} ${row.side || ""}` : ""}</span></div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="terminal-v2-main clean">
        <DualChartPage
          cards={cards}
          setups={setups}
          stripByLabel={stripByLabel}
          selectedSymbol={terminalSymbol}
          onSymbolChange={terminalSymbolChange}
          themeMode={themeMode}
          autoRefresh={autoRefresh}
        />
      </div>
    </div>
  );
}

function dashboardFeedLabel(strip = {}) {
  if (strip?.source === "option_chain_implied") return "Implied feed";
  if (strip?.source) return String(strip.source);
  return "Live index";
}

export default function ProfessionalDashboard({ onLogout, currentUser = "Admin" }) {
  const [themeMode, setThemeMode] = useState(() => {
    const saved = localStorage.getItem("pro-dashboard-theme") || "light";
    return saved === "dark" ? "black" : saved;
  });
  const [sidebarVisible, setSidebarVisible] = useState(() => localStorage.getItem("pro-dashboard-sidebar") !== "hidden");
  
  const location = useLocation();
  const navigate = useNavigate();

  const view = useMemo(() => {
    const path = location.pathname.substring(1).toLowerCase();
    if (path === "pcr") return "pcr";
    if (path === "signal-history") return "gate";
    if (path === "movers") return "movers";
    if (path === "sectors") return "sectors";
    if (path === "charts") return "charts";
    if (path === "terminal-v2") return "terminal-v2";
    if (path === "detail" || path === "oi-option-chain") return "detail";
    if (path === "review") return "review";
    return "home";
  }, [location.pathname]);

  const setView = useCallback((newView) => {
    if (newView === "home") navigate("/");
    else if (newView === "pcr") navigate("/PCR");
    else if (newView === "gate") navigate("/signal-history");
    else if (newView === "movers") navigate("/movers");
    else if (newView === "sectors") navigate("/sectors");
    else if (newView === "charts") navigate("/charts");
    else if (newView === "terminal-v2") navigate("/terminal-v2");
    else if (newView === "detail") navigate("/oi-option-chain");
    else if (newView === "review") navigate("/review");
    else navigate(`/${newView}`);
  }, [navigate]);
  const [symbol, setSymbol] = useState("NIFTY");
  const [dashboardSelection, setDashboardSelection] = useState("ALL");
  const [pcrDetailSymbol, setPcrDetailSymbol] = useState("ALL");
  const [gateDetailSymbol, setGateDetailSymbol] = useState("ALL");
  const [reviewSymbol, setReviewSymbol] = useState("ALL");
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem("pro-dashboard-autorefresh") !== "false");
  const [focusMode, setFocusMode] = useState(false);
  const [readyAlertsEnabled, setReadyAlertsEnabled] = useState(() => localStorage.getItem(READY_ALERTS_ENABLED_KEY) !== "false");
  const [readyAlertBeepMuted, setReadyAlertBeepMuted] = useState(() => localStorage.getItem(READY_ALERT_BEEP_MUTED_KEY) === "true");
  const [collapsedSections, setCollapsedSections] = useState({});
  const [buyerMode, setBuyerMode] = useState("INTRADAY");
  const [homeData, setHomeData] = useState(() => loadCachedHomeData());
  const [tickerData, setTickerData] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingHome, setLoadingHome] = useState(() => !loadCachedHomeData());
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSymbol, setQuickSymbolState] = useState(() => sessionStorage.getItem("dashboardQuickSymbol") || "");
  const setQuickSymbol = (val) => {
    setQuickSymbolState(val);
    if (val) sessionStorage.setItem("dashboardQuickSymbol", val);
    else sessionStorage.removeItem("dashboardQuickSymbol");
  };
  const [quickData, setQuickData] = useState(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [chartPopupSymbol, setChartPopupSymbolState] = useState(() => sessionStorage.getItem("dashboardChartSymbol") || "");
  const setChartPopupSymbol = (val) => {
    setChartPopupSymbolState(val);
    if (val) sessionStorage.setItem("dashboardChartSymbol", val);
    else sessionStorage.removeItem("dashboardChartSymbol");
  };
  const [optionChainPopupSymbol, setOptionChainPopupSymbolState] = useState(() => sessionStorage.getItem("dashboardOptionChainSymbol") || "");
  const setOptionChainPopupSymbol = (val) => {
    setOptionChainPopupSymbolState(val);
    if (val) sessionStorage.setItem("dashboardOptionChainSymbol", val);
    else sessionStorage.removeItem("dashboardOptionChainSymbol");
  };
  const [threeChartsOpen, setThreeChartsOpen] = useState(false);
  const [chartPopupFullPage, setChartPopupFullPage] = useState(false);
  const [threeChartsFullPage, setThreeChartsFullPage] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenStatus, setTokenStatus] = useState(null);
  const [tokenLoginUrl, setTokenLoginUrl] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenResult, setTokenResult] = useState(null);
  const [buyerSetupData, setBuyerSetupData] = useState({});
  const [loadingSetups, setLoadingSetups] = useState(false);
  const [marketNews, setMarketNews] = useState(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [pcrHistory, setPcrHistory] = useState(loadPcrHistory);
  const [optionSignalHistory, setOptionSignalHistory] = useState(loadOptionSignalHistory);
  const [signalJournal, setSignalJournal] = useState(loadSignalJournal);
  const [gateHistory, setGateHistory] = useState(loadGateHistory);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [liveTickMap, setLiveTickMap] = useState({});
  const [timeframeData, setTimeframeData] = useState({});
  const [dashboardFeed, setDashboardFeed] = useState("REST");
  const detailRequestRef = useRef(0);
  const homeRequestRef = useRef(false);
  const tickerRequestRef = useRef(false);
  const analyticsRequestRef = useRef(false);
  const buyerSetupsRequestRef = useRef(false);
  const timeframeRequestRef = useRef(false);
  const historySyncTimerRef = useRef(null);
  const readyAlertStateRef = useRef({ primed: false, keys: new Map() });

  const toggleDashboardSection = useCallback((key) => {
    setCollapsedSections((prev) => ({ ...(prev || {}), [key]: !prev?.[key] }));
  }, []);

  useEffect(() => {
    localStorage.setItem("pro-dashboard-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem("pro-dashboard-sidebar", sidebarVisible ? "visible" : "hidden");
  }, [sidebarVisible]);

  useEffect(() => {
    localStorage.setItem(READY_ALERTS_ENABLED_KEY, String(Boolean(readyAlertsEnabled)));
  }, [readyAlertsEnabled]);

  useEffect(() => {
    localStorage.setItem("pro-dashboard-autorefresh", String(Boolean(autoRefresh)));
  }, [autoRefresh]);



  useEffect(() => {
    localStorage.setItem(READY_ALERT_BEEP_MUTED_KEY, String(Boolean(readyAlertBeepMuted)));
  }, [readyAlertBeepMuted]);

  useEffect(() => {
    let cancelled = false;
    fetchJson("/api/dashboard-history", 12000)
      .then((payload) => {
        if (cancelled || !payload?.ok) return;
        setPcrHistory((prev) => {
          const merged = cleanPcrHistory(mergeObjectHistory(prev, payload.pcrHistory || {}, 120));
          persistLocalJson(PCR_HISTORY_KEY, merged);
          return merged;
        });
        setOptionSignalHistory((prev) => {
          const merged = trimObjectHistory(mergeObjectHistory(prev, payload.optionSignalHistory || {}, OPTION_SIGNAL_HISTORY_LIMIT), OPTION_SIGNAL_HISTORY_LIMIT);
          persistLocalJson(OPTION_SIGNAL_HISTORY_KEY, merged, trimObjectHistory(merged, 30));
          return merged;
        });
        setSignalJournal((prev) => {
          const merged = mergeArrayHistory(prev, payload.signalJournal || [], SIGNAL_JOURNAL_SYNC_LIMIT, signalJournalKey);
          persistLocalJson(SIGNAL_JOURNAL_KEY, merged, merged.slice(-500));
          return merged;
        });
        setGateHistory((prev) => {
          const merged = mergeArrayHistory(prev, payload.gateHistory || [], 3000, professionalGateHistoryKey);
          persistLocalJson(GATE_HISTORY_KEY, merged, merged.slice(-1000));
          return merged;
        });
      })
      .catch((err) => {
        console.warn("dashboard history load failed", err);
      })
      .finally(() => {
        if (!cancelled) setHistoryHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyHydrated) return undefined;
    if (historySyncTimerRef.current) window.clearTimeout(historySyncTimerRef.current);
    historySyncTimerRef.current = window.setTimeout(() => {
      postJson("/api/dashboard-history", {
        pcrHistory,
        optionSignalHistory,
        signalJournal,
        gateHistory,
      }, 15000).catch((err) => {
        console.warn("dashboard history sync failed", err);
      });
    }, 1800);
    return () => {
      if (historySyncTimerRef.current) window.clearTimeout(historySyncTimerRef.current);
    };
  }, [gateHistory, historyHydrated, optionSignalHistory, pcrHistory, signalJournal]);

  const loadHome = useCallback(async (silent = false) => {
    if (homeRequestRef.current) return;
    try {
      homeRequestRef.current = true;
      if (!silent) setLoadingHome(true);
      setError("");
      const dashboardJson = await fetchJson("/api/home-ticker", 15000);
      setHomeData((prev) => {
        const merged = mergeHomePayload(prev, dashboardJson);
        storeHomeCache(merged);
        return merged;
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        console.warn("home dashboard request timed out");
      } else {
        setError(String(err?.message || err));
      }
    } finally {
      setLoadingHome(false);
      homeRequestRef.current = false;
    }
  }, []);

  const loadTicker = useCallback(async () => {
    if (tickerRequestRef.current) return;
    try {
      tickerRequestRef.current = true;
      const json = await fetchJson("/api/home-ticker", 15000);
      setError("");
      setTickerData((prev) => mergeTickerPayload(prev, json));
      setHomeData((prev) => {
        const merged = mergeHomePayload(prev, json);
        storeHomeCache(merged);
        return merged;
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        console.warn("ticker request timed out");
      } else {
        console.error("ticker error", err);
      }
    } finally {
      tickerRequestRef.current = false;
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    if (analyticsRequestRef.current) return;
    try {
      analyticsRequestRef.current = true;
      const json = await fetchJson("/api/home-index-analytics", 45000);
      setHomeData((prev) => {
        const merged = mergeHomePayload(prev, json);
        storeHomeCache(merged);
        return merged;
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        console.warn("home analytics request timed out");
      } else {
        console.warn("home analytics error", err);
      }
    } finally {
      analyticsRequestRef.current = false;
    }
  }, []);

  const loadDetail = useCallback(async (selectedSymbol = symbol, silent = false) => {
    const requestId = ++detailRequestRef.current;
    try {
      if (!silent) setLoadingDetail(true);
      setError("");
      const json = await fetchJson(`/api/dashboard?symbol=${selectedSymbol}`, 90000);
      if (requestId === detailRequestRef.current) {
        setDetailData(json);
      }
    } catch (err) {
      if (requestId === detailRequestRef.current) {
        setError(String(err?.message || err));
      }
    } finally {
      if (requestId === detailRequestRef.current) {
        setLoadingDetail(false);
      }
    }
  }, [symbol]);

  const loadBuyerSetups = useCallback(async (silent = false) => {
    if (buyerSetupsRequestRef.current) return;
    try {
      buyerSetupsRequestRef.current = true;
      if (!silent) setLoadingSetups(true);
      const newSetups = {};
      await Promise.allSettled(
        INDEXES.map(async (item) => {
          try {
            const data = await fetchJson(`/api/dashboard?symbol=${item}`, 45000);
            if (data?.symbol) {
              newSetups[item] = data;
            }
          } catch (err) {
            console.warn(`buyer setup scan failed for ${item}`, err);
          }
        })
      );
      if (Object.keys(newSetups).length > 0) {
        setBuyerSetupData((prev) => ({ ...prev, ...newSetups }));
      }
    } catch (err) {
      console.warn("buyer setup scan failed", err);
    } finally {
      setLoadingSetups(false);
      buyerSetupsRequestRef.current = false;
    }
  }, []);

  const refreshBuyerSetup = useCallback(async (selectedSymbol) => {
    if (!selectedSymbol || !INDEXES.includes(selectedSymbol)) return;
    try {
      const data = await fetchJson(`/api/dashboard?symbol=${selectedSymbol}`, 45000);
      if (data?.symbol) {
        setBuyerSetupData((prev) => ({ ...prev, [selectedSymbol]: data }));
      }
    } catch (err) {
      console.warn(`buyer setup refresh failed for ${selectedSymbol}`, err);
    }
  }, []);

  const loadTimeframeConfirmations = useCallback(async () => {
    if (timeframeRequestRef.current) return;
    try {
      timeframeRequestRef.current = true;
      const results = await Promise.allSettled(
        INDEXES.map(async (item) => {
          const [five, fifteen, hourly, daily] = await Promise.all([
            fetchJson(`/api/fyers/history?symbol=${item}&resolution=5&lookback=900`, 30000),
            fetchJson(`/api/fyers/history?symbol=${item}&resolution=15&lookback=1875`, 30000),
            fetchJson(`/api/fyers/history?symbol=${item}&resolution=60&lookback=7500`, 30000),
            fetchJson(`/api/fyers/history?symbol=${item}&resolution=D&lookback=259200`, 30000),
          ]);
          return [item, { 5: five, 15: fifteen, 60: hourly, D: daily }];
        })
      );
      const next = {};
      results.forEach((result) => {
        if (result.status !== "fulfilled") return;
        const [item, data] = result.value || [];
        if (!item || !Object.values(data || {}).some((block) => block?.ok)) return;
        next[item] = data;
      });
      if (Object.keys(next).length) {
        setTimeframeData((prev) => ({ ...(prev || {}), ...next }));
      }
    } catch (err) {
      console.warn("timeframe confirmation load failed", err);
    } finally {
      timeframeRequestRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!chartPopupSymbol && !optionChainPopupSymbol) return;
    const selectedSymbol = chartPopupSymbol || optionChainPopupSymbol;
    refreshBuyerSetup(selectedSymbol);
  }, [chartPopupSymbol, optionChainPopupSymbol, refreshBuyerSetup]);

  useEffect(() => {
    if (view !== "home") return undefined;
    const timers = INDEXES.map((item, index) => {
      if (buyerSetupData?.[item]?.optionChain?.length) return;
      return window.setTimeout(() => refreshBuyerSetup(item), index * 700);
    });
    return () => {
      timers.filter(Boolean).forEach((timer) => window.clearTimeout(timer));
    };
  }, [buyerSetupData, refreshBuyerSetup, view]);

  const loadMarketNews = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingNews(true);
      const json = await fetchJson("/api/market-news", 12000);
      setMarketNews(json);
    } catch (err) {
      console.warn("market news error", err);
    } finally {
      setLoadingNews(false);
    }
  }, []);

  useEffect(() => {
    loadHome(false);
    loadMarketNews(false);
    const analyticsTimer = window.setTimeout(() => loadAnalytics(), 1200);
    const setupTimer = window.setTimeout(() => loadBuyerSetups(false), 400);
    const timeframeTimer = window.setTimeout(() => loadTimeframeConfirmations(), 1600);
    return () => {
      window.clearTimeout(analyticsTimer);
      window.clearTimeout(setupTimer);
      window.clearTimeout(timeframeTimer);
    };
  }, [loadAnalytics, loadBuyerSetups, loadHome, loadMarketNews, loadTimeframeConfirmations]);

  useEffect(() => {
    if (view !== "detail") return;
    loadDetail(symbol, false);
  }, [loadDetail, symbol, view]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(() => {
      if (isAfterMarketClose()) return;
      if (view === "home" || view === "movers" || view === "sectors" || view === "pcr" || view === "gate" || view === "review" || view === "charts" || view === "terminal-v2") {
        loadTicker();
      } else {
        loadDetail(symbol, true);
      }
    }, view === "home" || view === "movers" || view === "sectors" || view === "pcr" || view === "gate" || view === "review" || view === "charts" || view === "terminal-v2" ? 6000 : 45000);
    return () => clearInterval(id);
  }, [autoRefresh, loadDetail, loadHome, loadTicker, symbol, view]);

  useEffect(() => {
    if (!autoRefresh || (view !== "home" && view !== "movers" && view !== "charts" && view !== "terminal-v2")) return undefined;
    const id = setInterval(() => {
      if (isAfterMarketClose()) return;
      loadAnalytics();
    }, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, loadAnalytics, view]);

  useEffect(() => {
    if (!autoRefresh || (view !== "home" && view !== "charts" && view !== "terminal-v2")) return undefined;
    const id = setInterval(() => {
      if (isAfterMarketClose()) return;
      loadBuyerSetups(true);
    }, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, loadBuyerSetups, view]);

  useEffect(() => {
    if (!autoRefresh || (view !== "home" && view !== "charts" && view !== "terminal-v2")) return undefined;
    const id = setInterval(() => {
      if (isAfterMarketClose()) return;
      loadTimeframeConfirmations();
    }, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, loadTimeframeConfirmations, view]);

  useEffect(() => {
    if (!autoRefresh || view !== "home") return undefined;
    const id = setInterval(() => {
      if (isAfterMarketClose()) return;
      loadMarketNews(true);
    }, 180000);
    return () => clearInterval(id);
  }, [autoRefresh, loadMarketNews, view]);

  useEffect(() => {
    if (!autoRefresh || isAfterMarketClose()) return undefined;
    if (typeof EventSource === "undefined") return undefined;
    let liveCount = 0;
    const symbols = DASHBOARD_STREAM_KEYS.map((item) => encodeURIComponent(item)).join(",");
    const stream = new EventSource(`/api/fyers/market-stream?symbols=${symbols}`);
    stream.onopen = () => {
      setDashboardFeed("WS");
    };
    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        const tick = payload?.tick;
        const item = payload?.symbol;
        if (!item || !isNum(tick?.ltp)) return;
        liveCount += 1;
        setDashboardFeed("WS");
        setLiveTickMap((prev) => ({
          ...(prev || {}),
          [item]: normalizeLiveTick(tick, prev?.[item]),
        }));
      } catch (err) {
        console.warn("market stream parse failed", err);
      }
    };
    stream.onerror = () => {
      if (!liveCount) setDashboardFeed("REST");
    };

    return () => {
      stream.close();
    };
  }, [autoRefresh]);

  const marketStripBase = useMemo(() => {
    const tickerStrip = tickerData?.marketStrip || [];
    const sourceStrip = tickerStrip.some(hasQuoteValue) ? tickerStrip : (homeData?.marketStrip || tickerStrip || []);
    return [...sourceStrip].sort((a, b) => getStripSortIndex(a.label || a.indexName) - getStripSortIndex(b.label || b.indexName));
  }, [homeData?.marketStrip, tickerData?.marketStrip]);
  const marketStrip = useMemo(
    () => applyLiveTicksToMarketStrip(marketStripBase, liveTickMap),
    [liveTickMap, marketStripBase]
  );
  const vix = useMemo(
    () => (hasQuoteValue(tickerData?.vix) ? tickerData.vix : homeData?.vix || tickerData?.vix || {}),
    [homeData?.vix, tickerData?.vix]
  );
  const homeCards = useMemo(
    () => applyLiveTicksToIndexCards(homeData?.indices || {}, liveTickMap),
    [homeData?.indices, liveTickMap]
  );
  const liveBuyerSetupData = useMemo(
    () => applyLiveTicksToIndexCards(buyerSetupData, liveTickMap),
    [buyerSetupData, liveTickMap]
  );
  const marketMood = homeData?.marketMood || {};
  const sectors = useMemo(() => homeData?.sectorStrength || [], [homeData?.sectorStrength]);
  const advanceDecline = homeData?.advanceDecline || {};
  const foBreadth = useMemo(() => homeData?.foBreadth || {}, [homeData?.foBreadth]);
  const buyerSetups = useMemo(
    () => INDEXES.map((item) => liveBuyerSetupData?.[item]).filter(Boolean).map((item) => buildBuyerSetup(item, vix, buyerMode, timeframeData?.[item?.symbol], optionSignalHistory?.[item?.symbol] || [], foBreadth, sectors)),
    [buyerMode, foBreadth, liveBuyerSetupData, optionSignalHistory, sectors, timeframeData, vix]
  );
  const displayMarketStrip = useMemo(
    () => mergeImpliedStripValues(marketStrip, buyerSetups),
    [buyerSetups, marketStrip]
  );
  const dashboardSelectedSymbol = dashboardSelection && dashboardSelection !== "ALL" ? dashboardSelection : "";
  const dashboardMarketStrip = useMemo(
    () => dashboardSelectedSymbol
      ? displayMarketStrip.filter((item) => stripLabelToIndexSymbol(item?.label) === dashboardSelectedSymbol)
      : displayMarketStrip,
    [dashboardSelectedSymbol, displayMarketStrip]
  );
  const dashboardBuyerSetups = useMemo(
    () => dashboardSelectedSymbol ? buyerSetups.filter((item) => item?.symbol === dashboardSelectedSymbol) : buyerSetups,
    [buyerSetups, dashboardSelectedSymbol]
  );

  useEffect(() => {
    const stamp = Date.now();
    setPcrHistory((prev) => {
      let changed = false;
      const next = { ...(prev || {}) };

      INDEXES.forEach((item) => {
        const setup = buyerSetups.find((row) => row?.symbol === item) || {};
        const card = homeCards?.[item] || buyerSetupData?.[item] || {};
        const snapshot = makePcrLiveSnapshot(item, setup, card);
        if (!isNum(snapshot.value)) return;

        PCR_TABLE_INTERVALS.forEach((interval) => {
          const key = getPcrHistoryKey(item, interval);
          const existing = bucketPcrRows(Array.isArray(next[key]) ? next[key] : [], interval);
          const bucketTs = getPcrBucketTs(stamp, interval);
          const safeSnapshot = hydratePcrSnapshot(snapshot, existing);
          if (!isNum(safeSnapshot.value)) return;
          const row = { ts: bucketTs, bucketTs, interval, ...safeSnapshot };
          const last = existing[existing.length - 1];
          const nextRows = last && Number(last.bucketTs || last.ts || 0) === bucketTs
            ? [...existing.slice(0, -1), { ...last, ...row }]
            : [...existing, row];
          const trimmed = nextRows.slice(-80);
          const previousText = JSON.stringify(existing.slice(-80));
          const nextText = JSON.stringify(trimmed);
          if (previousText !== nextText) {
            next[key] = trimmed;
            if (interval === 5) next[item] = trimmed;
            changed = true;
          }
        });
      });

      if (changed) {
        const cleaned = cleanPcrHistory(next);
        persistLocalJson(PCR_HISTORY_KEY, cleaned);
        return cleaned;
      }
      return prev;
    });
  }, [buyerSetupData, buyerSetups, homeCards]);

  useEffect(() => {
    const stamp = Date.now();
    setOptionSignalHistory((prev) => {
      let changed = false;
      const next = { ...(prev || {}) };

      buyerSetups.forEach((setup) => {
        const option = setup?.option || setup?.displayOption;
        if (!setup?.symbol || !option) return;

        const row = {
          ts: stamp,
          strike: option.strike,
          side: option.side,
          premium: isNum(option.premium) ? Number(Number(option.premium).toFixed(2)) : null,
          iv: isNum(option.iv) ? Number(Number(option.iv).toFixed(2)) : null,
          volume: isNum(option.volume) ? Number(option.volume) : null,
          oi: isNum(option.oi) ? Number(option.oi) : null,
          oiChange: isNum(option.oiChange) ? Number(option.oiChange) : null,
          support1: isNum(setup?.analytics?.supports?.[0] ?? setup?.analytics?.putWall) ? Number(setup?.analytics?.supports?.[0] ?? setup?.analytics?.putWall) : null,
          resistance1: isNum(setup?.analytics?.resistances?.[0] ?? setup?.analytics?.callWall) ? Number(setup?.analytics?.resistances?.[0] ?? setup?.analytics?.callWall) : null,
          putWall: isNum(setup?.analytics?.putWall) ? Number(setup.analytics.putWall) : null,
          callWall: isNum(setup?.analytics?.callWall) ? Number(setup.analytics.callWall) : null,
          maxPain: isNum(setup?.analytics?.maxPain) ? Number(setup.analytics.maxPain) : null,
        };
        const existing = Array.isArray(next[setup.symbol]) ? next[setup.symbol] : [];
        const last = existing[existing.length - 1];
        if (
          last &&
          last.strike === row.strike &&
          last.side === row.side &&
          last.premium === row.premium &&
          last.iv === row.iv &&
          last.volume === row.volume &&
          last.oi === row.oi &&
          last.oiChange === row.oiChange &&
          last.support1 === row.support1 &&
          last.resistance1 === row.resistance1 &&
          last.putWall === row.putWall &&
          last.callWall === row.callWall &&
          last.maxPain === row.maxPain &&
          stamp - Number(last.ts || 0) < 60000
        ) {
          return;
        }

        next[setup.symbol] = [...existing, row].slice(-80);
        changed = true;
      });

      if (changed) {
        persistLocalJson(OPTION_SIGNAL_HISTORY_KEY, next, trimObjectHistory(next, 30));
        return next;
      }
      return prev;
    });
  }, [buyerSetups]);

  useEffect(() => {
    if (!buyerSetups.length || !displayMarketStrip.length) return;
    const stripMap = displayMarketStrip.reduce((acc, item) => {
      const symbolKey = stripLabelToIndexSymbol(item?.label);
      if (symbolKey) acc[symbolKey] = item;
      return acc;
    }, {});

    setSignalJournal((prev) => {
      const existing = Array.isArray(prev) ? prev : [];
      const incoming = [];

      buyerSetups.forEach((setup) => {
        if (!shouldRecordSignal(setup)) return;
        const row = makeSignalJournalRow(setup, stripMap[setup?.symbol] || {});
        if (!row) return;
        incoming.push(row);
      });

      const { changed, rows: next } = upsertSignalJournalRows(existing, incoming);
      if (!changed) return prev;
      persistLocalJson(SIGNAL_JOURNAL_KEY, next, next.slice(-500));
      return next;
    });
  }, [buyerSetups, displayMarketStrip]);

  useEffect(() => {
    if (!buyerSetups.length || !displayMarketStrip.length) return;
    const stripMap = displayMarketStrip.reduce((acc, item) => {
      const symbolKey = stripLabelToIndexSymbol(item?.label);
      if (symbolKey) acc[symbolKey] = item;
      return acc;
    }, {});

    setGateHistory((prev) => {
      let changed = false;
      const existing = Array.isArray(prev) ? prev : [];
      const recentKeys = new Set(
        existing
          .filter((row) => Date.now() - Number(row?.ts || 0) < GATE_HISTORY_COOLDOWN_MS)
          .map(professionalGateHistoryKey)
      );
      const additions = [];

      buyerSetups.forEach((setup) => {
        const row = makeProfessionalGateHistoryRow(setup, stripMap[setup?.symbol] || {});
        if (!row) return;
        const key = professionalGateHistoryKey(row);
        if (recentKeys.has(key)) return;
        recentKeys.add(key);
        additions.push(row);
        changed = true;
      });

      if (!changed) return prev;
      const next = [...existing, ...additions].slice(-3000);
      persistLocalJson(GATE_HISTORY_KEY, next, next.slice(-1000));
      return next;
    });
  }, [buyerSetups, displayMarketStrip]);

  useEffect(() => {
    const currentKeys = new Map();
    buyerSetups.forEach((setup) => {
      if (!shouldReadyAlert(setup)) return;
      currentKeys.set(getReadyAlertKey(setup), setup);
    });

    const previous = readyAlertStateRef.current.keys || new Map();
    const primed = readyAlertStateRef.current.primed;
    if (readyAlertsEnabled && primed) {
      currentKeys.forEach((setup, key) => {
        if (previous.has(key)) return;
        const option = setup?.option || setup?.displayOption || {};
        notification.success({
          message: `READY ${setup?.label || setup?.symbol}`,
          description: `${formatPrice(option.strike)} ${option.side} | Gate ${setup?.professionalGate?.score}/${setup?.professionalGate?.total} | R:R ${formatNum(setup?.plan?.riskReward, 2)}`,
          placement: "topRight",
          duration: 8,
        });
        if (!readyAlertBeepMuted) playReadyBeep();
      });
    }
    readyAlertStateRef.current = { primed: true, keys: currentKeys };
  }, [buyerSetups, readyAlertBeepMuted, readyAlertsEnabled]);

  const hasAnyMarketQuote = useMemo(
    () => displayMarketStrip.some(hasQuoteValue) || hasQuoteValue(vix),
    [displayMarketStrip, vix]
  );
  const quoteDataMissing = dashboardFeed !== "WS" && Boolean((tickerData || homeData) && displayMarketStrip.length && !hasAnyMarketQuote);
  const usingImpliedQuotes = displayMarketStrip.some((item) => item?.source === "option_chain_implied");
  const quoteStatus = tickerData?.quoteStatus || homeData?.quoteStatus || {};
  const quoteRateLimited = dashboardFeed !== "WS" && Boolean(quoteStatus?.rateLimited);
  const showHomeSpinner = loadingHome && !homeData && !tickerData;

  const stripByLabel = useMemo(() => {
    const map = {};
    displayMarketStrip.forEach((item) => {
      map[String(item?.label || "").toUpperCase()] = item;
    });
    return map;
  }, [displayMarketStrip]);

  const currentDetail = useMemo(() => {
    if (view !== "detail") return null;
    if (detailData?.symbol === symbol) return detailData;
    const fallback = homeCards?.[symbol];
    if (!fallback) return null;
    return {
      symbol,
      label: fallback?.label || INDEX_LABELS[symbol] || symbol,
      ...fallback,
      analytics: fallback?.analytics || {},
      optionChain: fallback?.optionChain || [],
      marketStrip: displayMarketStrip,
    };
  }, [detailData, displayMarketStrip, homeCards, symbol, view]);
  const getPopupDetail = useCallback((selectedSymbol) => {
    if (!selectedSymbol) return null;
    const raw = liveBuyerSetupData?.[selectedSymbol];
    if (raw?.symbol) return raw;

    const card = homeCards?.[selectedSymbol] || {};
    const setup = buyerSetups.find((item) => item?.symbol === selectedSymbol) || {};
    return {
      symbol: selectedSymbol,
      label: card?.label || setup?.label || INDEX_LABELS[selectedSymbol] || selectedSymbol,
      ...card,
      spot: card?.spot || setup?.spotQuote || {},
      future: card?.future || setup?.futureQuote || {},
      analytics: setup?.analytics || card?.analytics || {},
      optionChain: setup?.optionChain || card?.optionChain || [],
    };
  }, [buyerSetups, homeCards, liveBuyerSetupData]);

  const chartPopupDetail = useMemo(
    () => getPopupDetail(chartPopupSymbol),
    [chartPopupSymbol, getPopupDetail]
  );
  const optionChainPopupDetail = useMemo(
    () => getPopupDetail(optionChainPopupSymbol),
    [optionChainPopupSymbol, getPopupDetail]
  );

  useEffect(() => {
    const selectedSymbol = chartPopupSymbol || optionChainPopupSymbol;
    if (!selectedSymbol || buyerSetupData?.[selectedSymbol]?.optionChain?.length) return undefined;
    let cancelled = false;
    const loadPopupDetail = async () => {
      try {
        const data = await fetchJson(`/api/dashboard?symbol=${selectedSymbol}`, 45000);
        if (!cancelled && data?.symbol) {
          setBuyerSetupData((prev) => ({ ...prev, [selectedSymbol]: data }));
        }
      } catch (err) {
        console.warn(`popup detail load failed for ${selectedSymbol}`, err);
      }
    };
    loadPopupDetail();
    return () => {
      cancelled = true;
    };
  }, [buyerSetupData, chartPopupSymbol, optionChainPopupSymbol]);

  const openTerminal = (selectedSymbol) => {
    setSymbol(selectedSymbol);
    setView("detail");
  };

  const openPcrDetail = (selectedSymbol = "ALL") => {
    const nextSymbol = selectedSymbol && INDEXES.includes(selectedSymbol) ? selectedSymbol : "ALL";
    setPcrDetailSymbol(nextSymbol);
    setView("pcr");
  };

  const openChartPopup = (selectedSymbol) => {
    setChartPopupSymbol(selectedSymbol);
  };

  const openOptionChainPopup = (selectedSymbol) => {
    setOptionChainPopupSymbol(selectedSymbol);
  };

  const exportSignalJournal = useCallback(() => {
    const rows = Array.isArray(signalJournal) ? signalJournal : [];
    const headers = [
      "time", "symbol", "spot", "spotChange", "spotChangePct", "bias", "action", "readiness",
      "targetCrossed", "continuation", "side", "strike", "moneyness", "premium", "entry",
      "target", "stoploss", "riskReward", "indexTrigger", "indexTarget", "indexStop",
      "score", "pcr", "oi", "oiChange", "iv", "delta", "gamma", "theta", "vega", "volume",
      "professionalDecision", "professionalScore", "professionalTotal", "professionalReason", "professionalFreshness",
      "fiveMinute", "greekQuality", "premiumMomentum", "session", "blocker", "momentum", "liquidity", "premiumQuality", "reason",
    ];
    const escapeCsv = (value) => {
      if (value === null || value === undefined) return "";
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCsv(row?.[header])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `option-signal-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [signalJournal]);

  const downloadSignalReportExcel = useCallback(() => {
    const report = buildSignalAnalyticsReport(signalJournal, gateHistory);
    const html = signalReportHtml(report);
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `option-signal-analytical-report-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [gateHistory, signalJournal]);

  const downloadSignalReportPdf = useCallback(() => {
    const report = buildSignalAnalyticsReport(signalJournal, gateHistory);
    const html = signalReportHtml(report);
    const reportWindow = window.open("", "_blank", "width=1200,height=900");
    if (!reportWindow) return;
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => {
      reportWindow.print();
    }, 600);
  }, [gateHistory, signalJournal]);

  const testReadyAlert = useCallback(() => {
    notification.success({
      message: "READY Alert Test",
      description: readyAlertBeepMuted ? "Toast is working. Beep is muted." : "Toast is working. Beep should play now.",
      placement: "topRight",
      duration: 5,
    });
    if (!readyAlertBeepMuted) playReadyBeep();
  }, [readyAlertBeepMuted]);

  const loadTokenStatus = async () => {
    const status = await fetchJson("/api/fyers/token-status", 10000);
    setTokenStatus(status);
    return status;
  };

  const openTokenModal = async () => {
    setTokenOpen(true);
    setTokenResult(null);
    setTokenLoading(true);
    try {
      await loadTokenStatus();
    } catch (err) {
      setTokenResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setTokenLoading(false);
    }
  };

  const generateTokenLoginUrl = async () => {
    setTokenResult(null);
    setTokenLoading(true);
    try {
      const json = await fetchJson("/api/fyers/login-url", 10000);
      if (!json?.ok) {
        setTokenResult(json);
        return;
      }
      setTokenLoginUrl(json.loginUrl || "");
      setTokenStatus(json);
    } catch (err) {
      setTokenResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setTokenLoading(false);
    }
  };

  const saveFyersToken = async () => {
    setTokenResult(null);
    setTokenLoading(true);
    try {
      const json = await postJson("/api/fyers/save-token", { authCode: tokenInput }, 30000);
      setTokenResult(json);
      if (json?.ok) {
        setTokenStatus(json);
        setTokenInput("");
        await manualRefresh();
      }
    } catch (err) {
      setTokenResult({ ok: false, error: String(err?.message || err) });
    } finally {
      setTokenLoading(false);
    }
  };

  const openQuick = async (selectedSymbol) => {
    setQuickSymbol(selectedSymbol);
    setQuickOpen(true);
    setQuickData(homeCards?.[selectedSymbol] || null);
    setQuickLoading(true);
    try {
      const json = await fetchJson(`/api/dashboard?symbol=${selectedSymbol}`, 90000);
      setQuickData(json);
    } catch (err) {
      console.error("quick view error", err);
    } finally {
      setQuickLoading(false);
    }
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      if (view === "home" || view === "movers" || view === "sectors" || view === "charts" || view === "terminal-v2") {
        await loadTicker();
        await Promise.all([
          loadAnalytics(),
          loadBuyerSetups(true),
          loadMarketNews(true),
        ]);
      } else {
        await loadDetail(symbol, true);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const quickAnalytics = quickData?.analytics || {};
  const quickSignal = quickAnalytics?.tradeSignalPanel || {};
  const quickUnderlyingPrice = asNum(quickData?.spot?.ltp || quickData?.future?.ltp);
  const quickOption = selectTradableOption(quickData?.optionChain || [], quickUnderlyingPrice, quickSignal?.bias);
  const quickQuality = evaluateTrade(quickOption, quickSignal);
  const darkSurface = themeMode !== "light";
  const surfaceClass = `${darkSurface ? "dark" : ""} ${themeMode === "navy" ? "navy" : ""} ${themeMode === "black" ? "black" : ""}`.trim();
  const navItems = [
    { label: "Dashboard V1", value: "home", icon: <HomeOutlined /> },
    { label: "Terminal V2", value: "terminal-v2", icon: <DashboardOutlined /> },
    { label: "PCR View", value: "pcr", icon: <ThunderboltOutlined /> },
    { label: "Signal History", value: "gate", icon: <EyeOutlined /> },
    { label: "Stock Action", value: "movers", icon: <BarChartOutlined /> },
    { label: "Sectors", value: "sectors", icon: <DashboardOutlined /> },
    { label: "3 indice chart", action: "three-charts", icon: <LineChartOutlined /> },
    { label: "Indice & Strike chart", value: "charts", icon: <LineChartOutlined /> },
    { label: "OI & Option Chain", value: "detail", icon: <LineChartOutlined /> },
    { label: "Session Summary", value: "review", icon: <DashboardOutlined /> },
  ];
  const currentPageLabel = navItems.find((item) => item.value === view)?.label || "Live Signals";

  return (
    <ConfigProvider
      theme={{
        algorithm: darkSurface ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 8,
          colorPrimary: "#0f766e",
          fontFamily: "Inter, Segoe UI, Arial, sans-serif",
        },
      }}
    >
      <div className={`pro-dashboard ${surfaceClass} ${focusMode ? "focus-mode" : ""}`}>
        <div className={`pro-shell ${sidebarVisible ? "" : "sidebar-hidden"}`}>
          {sidebarVisible ? (
          <aside className="dashboard-sidebar">
            <div className="sidebar-brand">
              <DashboardLogo />
              <div>
                <strong>Options Desk</strong>
                <span>{dashboardFeed === "WS" ? "Live feed" : "REST refresh"}</span>
              </div>
            </div>
            <nav className="sidebar-nav" aria-label="Workspace navigation">
              {navItems.map((item) => (
                <button
                  type="button"
                  className={view === item.value ? "active" : ""}
                  key={item.value}
                  onClick={() => {
                    if (item.action === "three-charts") {
                      setThreeChartsOpen(true);
                    } else {
                      setView(item.value);
                    }
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-status">
              <span>Mode</span>
              <b>{BUYER_MODES[buyerMode]?.label || buyerMode}</b>
              <small>VIX {formatNum(vix?.ltp, 2)} {formatPct(vix?.change_pct)}</small>
            </div>
          </aside>
          ) : null}

          <main className="dashboard-main">
          {view !== "charts" ? (
          <div className="dashboard-topbar">
            <div className="dashboard-title-block">
              <div>
                <h1 className="m-0 text-2xl font-black tracking-normal">{currentPageLabel}</h1>
              </div>
            </div>

            <Space className="dashboard-actions" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
              <div className="dashboard-index-select">
                <span>Select Indice</span>
                <Select
                  value={view === "home" ? dashboardSelection : view === "pcr" ? pcrDetailSymbol : view === "gate" ? gateDetailSymbol : view === "review" ? reviewSymbol : symbol}
                  style={{ width: 168 }}
                  onChange={(value) => {
                    if (view === "home") {
                      setDashboardSelection(value);
                      if (value !== "ALL") setSymbol(value);
                    } else if (view === "pcr") {
                      setPcrDetailSymbol(value);
                      if (value !== "ALL") setSymbol(value);
                    } else if (view === "gate") {
                      setGateDetailSymbol(value);
                      if (value !== "ALL") setSymbol(value);
                    } else if (view === "review") {
                      setReviewSymbol(value);
                      if (value !== "ALL") setSymbol(value);
                    } else if (view === "movers" || view === "sectors") {
                      if (value !== "ALL") setSymbol(value);
                    } else {
                      setSymbol(value);
                    }
                  }}
                  options={
                    view === "home"
                      ? [{ label: "All", value: "ALL" }, ...INDEXES.map((item) => ({ label: INDEX_DISPLAY_LABELS[item] || item, value: item }))]
                      : view === "movers" || view === "sectors" || view === "pcr" || view === "gate" || view === "review"
                        ? [{ label: "All", value: "ALL" }, ...INDEXES.map((item) => ({ label: INDEX_DISPLAY_LABELS[item] || item, value: item }))]
                        : INDEXES.map((item) => ({ label: INDEX_DISPLAY_LABELS[item] || item, value: item }))
                  }
                />
              </div>
              <HeaderClock />
              <HeaderVixPill vix={vix} />
              <Tooltip title="Auto refresh">
                <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="Auto" unCheckedChildren="Manual" />
              </Tooltip>
              <Tooltip title="Show only decision-critical sections">
                <Switch checked={focusMode} onChange={setFocusMode} checkedChildren="Focus" unCheckedChildren="Full" />
              </Tooltip>
              <Tooltip title="Show or hide sidebar">
                <Switch checked={sidebarVisible} onChange={setSidebarVisible} checkedChildren="Menu" unCheckedChildren="Hide" />
              </Tooltip>
              <Button icon={<ReloadOutlined spin={refreshing} />} onClick={manualRefresh}>
                Refresh
              </Button>
              {view !== "home" ? (
                <Button icon={<HomeOutlined />} onClick={() => setView("home")}>
                  Dashboard
                </Button>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid var(--border-color)', paddingLeft: 8 }}>
                <Button size="small" icon={<ControlOutlined />} onClick={openTokenModal}>Token</Button>
                <Segmented size="small" value={themeMode} onChange={setThemeMode} options={[ { label: "Light", value: "light" }, { label: "Navy", value: "navy" }, { label: "Black", value: "black" } ]} />
              </div>
              <div className="dashboard-user-card">
                <span>Logged in</span>
                <b>{currentUser || "Admin"}</b>
                <Button size="small" type="text" icon={<LogoutOutlined />} onClick={onLogout} danger>
                  Logout
                </Button>
              </div>
            </Space>
          </div>
          ) : null}

          <div style={{ position: 'absolute', top: 76, left: 16, right: 16, zIndex: 50, pointerEvents: 'none' }}>
            {error && !isAfterMarketClose() ? <Alert className="mb-4 shadow-md pointer-events-auto" type="error" showIcon title={error} /> : null}
            {quoteDataMissing && !isAfterMarketClose() ? (
              <Alert
                className="mb-4 shadow-md pointer-events-auto"
                type="warning"
                showIcon
                message="Fyers quotes are connected, but live values are not coming right now."
                description="The backend is running, but the quote API is returning blank values or a Fyers error. Check http://127.0.0.1:5000/api/debug/fyers-quote after refreshing the token."
              />
            ) : null}
            {quoteRateLimited && !isAfterMarketClose() ? (
              <Alert
                className="mb-4 shadow-md pointer-events-auto"
                type="warning"
                showIcon
                message="Live quote refresh is rate-limited right now."
                description={quoteStatus?.message || `Showing cached values. Retry after ${formatNum(quoteStatus?.cooldownSeconds, 0)} seconds or refresh the Fyers token if this continues.`}
              />
            ) : null}
            {usingImpliedQuotes && !isAfterMarketClose() ? (
              <Alert
                className="mb-4 shadow-md pointer-events-auto"
                type="info"
                showIcon
                message="Using Implied Option Quotes"
                description="Fyers WebSocket is disconnected or missing spots. Using option-chain implied spots instead. The charts might be slightly delayed."
              />
            ) : null}
          </div>

          {view === "home" ? (
            <Card className="pro-card mb-4" styles={{ body: { padding: 12 } }}>
              <div className="flex flex-wrap items-center gap-3">
                <MarketStrip items={dashboardMarketStrip} onOpen={openTerminal} />
              </div>
            </Card>
          ) : null}

          {view === "home" ? (
            <Spin spinning={showHomeSpinner}>
              <div className="grid gap-4">
                <CommandOverviewPanel
                  setups={dashboardBuyerSetups}
                  sectors={sectors}
                  mood={marketMood}
                  cards={homeCards}
                  pcrHistory={pcrHistory}
                  advanceDecline={advanceDecline}
                  foBreadth={foBreadth}
                  selectedSymbol={dashboardSelectedSymbol}
                  collapsed={Boolean(collapsedSections.market)}
                  onCollapse={() => toggleDashboardSection("market")}
                  onOpen={openTerminal}
                  onOpenMarket={() => setView("movers")}
                  onOpenPcr={openPcrDetail}
                />

                <OptionBuyerDesk
                  setups={dashboardBuyerSetups}
                  cards={homeCards}
                  stripByLabel={stripByLabel}
                  advanceDecline={advanceDecline}
                  vix={vix}
                  mood={marketMood}
                  news={marketNews}
                  pcrHistory={pcrHistory}
                  optionSignalHistory={optionSignalHistory}
                  buyerMode={buyerMode}
                  onModeChange={setBuyerMode}
                  signalJournalCount={signalJournal.length}
                  signalJournal={signalJournal}
                  gateHistoryCount={gateHistory.length}
                  gateHistory={gateHistory}
                  readyAlertsEnabled={readyAlertsEnabled}
                  readyAlertBeepMuted={readyAlertBeepMuted}
                  onReadyAlertsChange={setReadyAlertsEnabled}
                  onReadyBeepMutedChange={setReadyAlertBeepMuted}
                  onTestReadyAlert={testReadyAlert}
                  onExportSignals={exportSignalJournal}
                  onExcelReport={downloadSignalReportExcel}
                  onPdfReport={downloadSignalReportPdf}
                  loading={loadingSetups}
                  onOpen={openTerminal}
                  onChart={openChartPopup}
                  onOptionChain={openOptionChainPopup}
                  onQuick={openQuick}
                  selectedSymbol={dashboardSelectedSymbol}
                  collapsed={Boolean(collapsedSections.desk)}
                  onCollapse={() => toggleDashboardSection("desk")}
                />

                {!focusMode ? (
                  <MarketMoversPreview foBreadth={foBreadth} onOpen={() => setView("movers")} />
                ) : null}

                {!focusMode ? (
                  <div className="sector-news-grid">
                    <SectorBlock sectors={sectors} collapsed={Boolean(collapsedSections.sectors)} onCollapse={() => toggleDashboardSection("sectors")} />
                    <MarketNewsPanel news={marketNews} loading={loadingNews} />
                  </div>
                ) : null}
              </div>
            </Spin>
          ) : view === "movers" ? (
            <Spin spinning={showHomeSpinner}>
              <MarketMoversPage foBreadth={foBreadth} onBack={() => setView("home")} />
            </Spin>
          ) : view === "sectors" ? (
            <Spin spinning={showHomeSpinner}>
              <SectorStocksPage sectors={sectors} onBack={() => setView("home")} />
            </Spin>
          ) : view === "charts" ? (
            <Spin spinning={showHomeSpinner}>
              <DualChartPage
                cards={homeCards}
                setups={buyerSetups}
                stripByLabel={stripByLabel}
                selectedSymbol={symbol}
                onSymbolChange={setSymbol}
                themeMode={themeMode}
                autoRefresh={autoRefresh}
                setView={setView}
                sidebarVisible={sidebarVisible}
                setSidebarVisible={setSidebarVisible}
              />
            </Spin>
          ) : view === "terminal-v2" ? (
            <Spin spinning={showHomeSpinner}>
              <TerminalV2Page
                cards={homeCards}
                setups={buyerSetups}
                stripByLabel={stripByLabel}
                selectedSymbol={symbol}
                onSymbolChange={setSymbol}
                themeMode={themeMode}
                autoRefresh={autoRefresh}
                pcrHistory={pcrHistory}
                optionSignalHistory={optionSignalHistory}
                gateHistory={gateHistory}
                vix={vix}
                marketMood={marketMood}
                onOpenV1={() => setView("home")}
              />
            </Spin>
          ) : view === "pcr" ? (
            <Spin spinning={showHomeSpinner}>
              <PcrDetailPage
                setups={buyerSetups}
                cards={homeCards}
                pcrHistory={pcrHistory}
                selectedSymbol={pcrDetailSymbol}
                onSymbolChange={setPcrDetailSymbol}
                onBack={() => setView("home")}
              />
            </Spin>
          ) : view === "gate" ? (
            <Spin spinning={showHomeSpinner}>
              <GateHistoryPage
                gateHistory={gateHistory}
                selectedSymbol={gateDetailSymbol}
                onSymbolChange={setGateDetailSymbol}
                onBack={() => setView("home")}
              />
            </Spin>
          ) : view === "review" ? (
            <Spin spinning={showHomeSpinner}>
              <DailyReviewPage
                signalJournal={signalJournal}
                gateHistory={gateHistory}
                pcrHistory={pcrHistory}
                selectedSymbol={reviewSymbol}
                onSymbolChange={setReviewSymbol}
                onBack={() => setView("home")}
              />
            </Spin>
          ) : (
            <div className="grid gap-4">
              <Card className="pro-card" styles={{ body: { padding: 14 } }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Space wrap>
                    <Button icon={<HomeOutlined />} onClick={() => setView("home")}>Dashboard</Button>
                    <Segmented
                      value={symbol}
                      onChange={(value) => {
                        setSymbol(value);
                      }}
                      options={INDEXES}
                    />
                  </Space>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-300">Terminal</div>
                    <div className="text-lg font-black">{currentDetail?.label || INDEX_LABELS[symbol] || symbol}</div>
                  </div>
                </div>
              </Card>

              <Spin spinning={loadingDetail && !currentDetail}>
                {currentDetail ? (
                  <DetailOptions detail={currentDetail} />
                ) : (
                  <Card className="pro-card">
                    <Empty description="No terminal data loaded yet" />
                  </Card>
                )}
              </Spin>
            </div>
          )}
          </main>
        </div>

        <Modal
          title="Fyers Token"
          open={tokenOpen}
          onCancel={() => setTokenOpen(false)}
          footer={[
            <Button key="close" onClick={() => setTokenOpen(false)}>Close</Button>,
            <Button key="login" onClick={generateTokenLoginUrl} loading={tokenLoading}>Get Login URL</Button>,
            <Button key="save" type="primary" onClick={saveFyersToken} loading={tokenLoading}>Save Token</Button>,
          ]}
          width={760}
          className={`dashboard-popup ${surfaceClass}`}
        >
          <div className="token-modal-body">
            {tokenResult ? (
              <Alert
                type={tokenResult.ok ? "success" : "error"}
                showIcon
                message={tokenResult.ok ? tokenResult.message || "Token saved" : tokenResult.error || "Token refresh failed"}
              />
            ) : null}

            <div className="token-status-grid">
              <MetricTile label="Client ID" value={tokenStatus?.clientIdPresent ? "Found" : "Missing"} />
              <MetricTile label="Secret Key" value={tokenStatus?.secretKeyPresent ? "Found" : "Missing"} />
              <MetricTile label="Access Token" value={tokenStatus?.accessTokenPresent ? "Found" : "Missing"} />
              <MetricTile label="Last Saved" value={tokenStatus?.envUpdatedAt || "-"} />
            </div>

            {tokenLoginUrl ? (
              <Alert
                type="info"
                showIcon
                message="Open Fyers login, then paste the final redirected URL below."
                action={<Button size="small" type="primary" href={tokenLoginUrl} target="_blank">Open Login</Button>}
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                message="Click Get Login URL to generate a fresh Fyers login link."
                description="After login, Fyers redirects to a page URL. Paste that full final URL here; the dashboard will extract the auth_code and save the new access token."
              />
            )}

            <Input.TextArea
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Paste final Fyers redirect URL or auth_code here"
              autoSize={{ minRows: 3, maxRows: 5 }}
            />
          </div>
        </Modal>

        <Modal
          title={(
            <div className="modal-title-actions">
              <span>{INDEX_LABELS[chartPopupSymbol] || chartPopupSymbol || "Index"} Live Chart</span>
              <Space size={8}>
                <Button
                  size="small"
                  icon={chartPopupFullPage ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setChartPopupFullPage((prev) => !prev)}
                >
                  {chartPopupFullPage ? "Compact" : "Full Page"}
                </Button>
                <Button size="small" onClick={() => {
                  setChartPopupSymbol("");
                  setChartPopupFullPage(false);
                }}>Close</Button>
              </Space>
            </div>
          )}
          open={Boolean(chartPopupSymbol)}
          onCancel={() => {
            setChartPopupSymbol("");
            setChartPopupFullPage(false);
          }}
          maskClosable={false}
          footer={null}
          keyboard
          width={chartPopupFullPage ? "calc(100vw - 24px)" : 980}
          className={`dashboard-popup ${chartPopupFullPage ? "full-page-modal" : ""} ${surfaceClass}`}
          destroyOnHidden
        >
          {chartPopupDetail ? (
            <ChartPopupContent
              detail={chartPopupDetail}
              symbol={chartPopupSymbol}
              pcrHistory={pcrHistory}
              optionSignalHistory={optionSignalHistory}
              stripByLabel={stripByLabel}
              themeMode={themeMode}
              autoRefresh={autoRefresh}
              fullPage={chartPopupFullPage}
            />
          ) : (
            <Empty description="Chart data is still loading" />
          )}
        </Modal>

        <Modal
          title={(
            <div className="modal-title-actions">
              <span>Index Live Charts</span>
              <Space size={8}>
                <Button
                  size="small"
                  icon={threeChartsFullPage ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setThreeChartsFullPage((prev) => !prev)}
                >
                  {threeChartsFullPage ? "Compact" : "Full Page"}
                </Button>
                <Button size="small" onClick={() => {
                  setThreeChartsOpen(false);
                  setThreeChartsFullPage(false);
                }}>Close</Button>
              </Space>
            </div>
          )}
          open={threeChartsOpen}
          onCancel={() => {
            setThreeChartsOpen(false);
            setThreeChartsFullPage(false);
          }}
          footer={null}
          keyboard
          width={threeChartsFullPage ? "calc(100vw - 24px)" : 1480}
          className={`dashboard-popup three-chart-modal ${threeChartsFullPage ? "full-page-modal" : ""} ${surfaceClass}`}
          destroyOnHidden
        >
          <ThreeIndexChartsContent stripByLabel={stripByLabel} themeMode={themeMode} autoRefresh={autoRefresh} fullPage={threeChartsFullPage} />
        </Modal>

        <Modal
          title={`${INDEX_LABELS[optionChainPopupSymbol] || optionChainPopupSymbol || "Index"} Option Chain`}
          open={Boolean(optionChainPopupSymbol)}
          onCancel={() => setOptionChainPopupSymbol("")}
          footer={<Button onClick={() => setOptionChainPopupSymbol("")}>Close</Button>}
          keyboard
          width={1180}
          className={`dashboard-popup option-chain-popup ${surfaceClass}`}
          destroyOnHidden
        >
          {optionChainPopupDetail ? (
            <OptionChainContent detail={optionChainPopupDetail} framed={false} />
          ) : (
            <Empty description="Option chain is still loading" />
          )}
        </Modal>

        <Modal
          title={`${quickData?.label || quickSymbol || "Quick View"} Action Snapshot`}
          open={quickOpen}
          onCancel={() => setQuickOpen(false)}
          footer={[
            <Button key="close" onClick={() => setQuickOpen(false)}>Close</Button>,
            <Button key="open" type="primary" onClick={() => {
              setQuickOpen(false);
              openTerminal(quickSymbol);
            }}>
              Open Terminal
            </Button>,
          ]}
          width={920}
          className={`snapshot-modal ${surfaceClass}`}
        >
          <div className="grid gap-4">
            {quickLoading ? (
              <Alert type="info" showIcon title="Refreshing latest option-chain values..." />
            ) : null}
            <TradeBanner
              signal={quickSignal}
              option={quickOption}
              quality={quickQuality}
              underlyingPrice={quickUnderlyingPrice}
            />
            <div className="level-grid">
              <LevelPill label="Spot" value={formatPrice(quickData?.spot?.ltp)} />
              <LevelPill label="PCR" value={formatNum(quickAnalytics?.pcr, 2)} />
              <LevelPill label="Max Pain" value={formatPrice(quickAnalytics?.maxPain)} />
              <LevelPill label="Support" value={formatPrice(quickAnalytics?.supports?.[0] || quickAnalytics?.putWall)} tone="support" />
              <LevelPill label="Resistance" value={formatPrice(quickAnalytics?.resistances?.[0] || quickAnalytics?.callWall)} tone="resistance" />
            </div>
          </div>
        </Modal>
      </div>
    </ConfigProvider>
  );
}
