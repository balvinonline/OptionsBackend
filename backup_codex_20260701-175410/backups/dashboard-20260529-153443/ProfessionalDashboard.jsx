import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "antd/dist/reset.css";
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart } from "lightweight-charts";
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  theme,
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  ControlOutlined,
  DashboardOutlined,
  EyeOutlined,
  HomeOutlined,
  LineChartOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import "./ProfessionalDashboard.css";

const INDEXES = ["NIFTY", "BANKNIFTY", "SENSEX"];
const DASHBOARD_STREAM_KEYS = ["NIFTY", "BANKNIFTY", "SENSEX", "NIFTY MIDCAP 100", "NIFTY SMALLCAP 100", "NIFTY FIN SERVICE"];
const INDEX_LABELS = {
  NIFTY: "NIFTY 50",
  BANKNIFTY: "BANK NIFTY",
  SENSEX: "SENSEX",
};

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

function levelTone(value, support = true) {
  if (!isNum(value)) return "neutral";
  return support ? "support" : "resistance";
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
      label = "Put Support Heavy";
      detail = "Put OI is stronger than call OI near ATM.";
    } else if (pcrValue <= 0.85) {
      tone = "error";
      label = "Call Pressure Heavy";
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
      const oi = Number(side === "CE" ? row?.ce_oi : row?.pe_oi || 0);
      const oiChange = Number(side === "CE" ? row?.ce_oich : row?.pe_oich || 0);
      const volume = Number(side === "CE" ? row?.ce_volume : row?.pe_volume || 0);
      const iv = Number(side === "CE" ? row?.ce_iv : row?.pe_iv || row?.iv || 0);
      const delta = Number(side === "CE" ? row?.ce_delta : row?.pe_delta || 0);
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

      return { strike, side, premium, oi, oiChange, volume, iv, delta, score: Number(score.toFixed(2)), distance, moneyness, directionalBias };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.directionalBias - a.directionalBias || a.distance - b.distance);

  return candidates[0] || null;
}

function selectDisplayOption(chain = [], spotPrice = 0, bias = "Neutral") {
  if (!Array.isArray(chain) || !chain.length || !isNum(spotPrice)) return null;
  const side = String(bias || "").toLowerCase().includes("bear") ? "PE" : "CE";
  const step = getStrikeStep(chain);
  const candidates = chain
    .map((row) => {
      const strike = Number(row?.strike || 0);
      const premium = Number(side === "CE" ? row?.ce_ltp : row?.pe_ltp || 0);
      const oi = Number(side === "CE" ? row?.ce_oi : row?.pe_oi || 0);
      const oiChange = Number(side === "CE" ? row?.ce_oich : row?.pe_oich || 0);
      const volume = Number(side === "CE" ? row?.ce_volume : row?.pe_volume || 0);
      const iv = Number(side === "CE" ? row?.ce_iv : row?.pe_iv || row?.iv || 0);
      if (!strike || (!premium && !oi && !volume && !iv)) return null;
      const distance = Math.abs(strike - Number(spotPrice));
      const directionalBias = getDirectionalMoneynessBias(strike, spotPrice, side);
      if (distance > step * 1.6) return null;
      if (directionalBias < 0 && distance > step * 0.7) return null;
      return {
        strike,
        side,
        premium,
        oi,
        oiChange,
        volume,
        iv,
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

function getNoTradeReason({ option, plan, signal, quality, premiumQuality, momentum, trap, trigger, decay, mode }) {
  const rules = getBuyerModeRules(mode);
  const confidence = asNum(signal?.confidence, 0);
  if (trigger?.invalidated) return trigger.reason;
  if (trigger?.targetCrossed && trigger?.continuation) return "Target crossed; trail continuation only";
  if (trigger?.targetCrossed) return trigger.reason;
  if (!String(signal?.bias || "").match(/bull|bear/i)) return "No directional bias";
  if (!option) return "No liquid tradable strike";
  if (!plan) return "No valid premium plan";
  if (premiumQuality?.tone === "error") return premiumQuality.reason;
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

function buildBuyerSetup(detail, vix = {}, mode = "INTRADAY") {
  const analytics = detail?.analytics || {};
  const signal = deriveBuyerSignal(detail);
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
  const trigger = getTriggerStatus(activeOption, plan, underlyingPrice, signal, { momentum, volumeQuality, premiumQuality });
  const noTradeReason = getNoTradeReason({ option, plan, signal, quality, premiumQuality, momentum, trap, trigger, decay, mode });
  const oiTotals = chain.reduce((acc, row) => {
    acc.callOi += asNum(row?.ce_oi, 0);
    acc.putOi += asNum(row?.pe_oi, 0);
    acc.callOiChange += asNum(row?.ce_oich, 0);
    acc.putOiChange += asNum(row?.pe_oich, 0);
    return acc;
  }, { callOi: 0, putOi: 0, callOiChange: 0, putOiChange: 0 });

  const warnings = [];
  if (!option && displayOption) warnings.push("Nearest strike only; wait for clean trigger");
  if (!displayOption) warnings.push("No option-chain strike available");
  if (!String(signal?.bias || "").match(/bull|bear/i)) warnings.push("No directional bias");
  if (confidence < getBuyerModeRules(mode).minConfidence && signal?.source !== "option_chain_fallback") warnings.push(`Confidence below ${getBuyerModeRules(mode).minConfidence}%`);
  if (rr > 0 && rr < getBuyerModeRules(mode).minRiskReward) warnings.push("Reward/risk is weak");
  if (decay.tone !== "success") warnings.push(decay.note);
  if (premiumQuality.tone === "error") warnings.push(premiumQuality.reason);
  if (momentum.tone === "error" || momentum.label === "Slow") warnings.push(momentum.reason);
  if (vwapState.tone === "warning" && activeOption) warnings.push(vwapState.reason);
  if (volumeQuality.label === "Low Vol") warnings.push(volumeQuality.reason);
  if (trap.label === "Near S/R") warnings.push(trap.reason);
  if (trigger.invalidated || (trigger.ready === false && !trigger.targetCrossed)) warnings.push(trigger.reason);
  if (trigger.targetCrossed && !trigger.continuation) warnings.push(trigger.reason);
  if (vixPct < -4) warnings.push("VIX falling fast; premium expansion may be limited");

  let score = quality.score;
  score += confidence >= 70 ? 8 : confidence >= getBuyerModeRules(mode).minConfidence ? 4 : -8;
  score += rr >= 1.5 ? 8 : rr >= getBuyerModeRules(mode).minRiskReward ? 4 : rr > 0 ? -8 : -12;
  score += premiumQuality.tone === "success" ? 5 : premiumQuality.tone === "warning" ? -4 : -12;
  score += momentum.aligned ? 5 : -8;
  score += vwapState.aligned ? 4 : activeOption ? -4 : 0;
  score += volumeQuality.tone === "success" ? 4 : volumeQuality.label === "Low Vol" ? -5 : 0;
  score += trap.tone === "success" ? 4 : -6;
  score += trigger.ready ? 6 : trigger.invalidated ? -25 : -6;
  score += vixPct >= 0 ? 3 : vixPct < -4 ? -6 : -2;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const action = trigger.continuation ? "Trail beyond target" : trigger.targetCrossed ? "Book / Recheck" : trigger.invalidated ? "Setup Invalid" : !option && displayOption ? "Watch nearest strike" : warnings.length ? "Wait / Trigger only" : signal?.action || "Wait";
  const tone = trigger.invalidated || !displayOption || score < 45 ? "error" : score >= 70 && warnings.length <= 1 ? "success" : "warning";

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

function normalizeLiveTick(tick = {}, previous = {}) {
  if (!isNum(tick?.ltp)) return previous || {};
  return {
    ...(previous || {}),
    ltp: Number(tick.ltp),
    change: isNum(tick.change) ? Number(tick.change) : previous?.change,
    change_pct: isNum(tick.change_pct) ? Number(tick.change_pct) : previous?.change_pct,
    volume: isNum(tick.volume) ? Number(tick.volume) : previous?.volume,
    updated_at: tick.timestamp || tick.updated_at || previous?.updated_at,
    ts: tick.ts || previous?.ts,
    source: "fyers_ws",
  };
}

function applyTickToQuote(quote = {}, tick = {}) {
  if (!isNum(tick?.ltp)) return quote || {};
  return {
    ...(quote || {}),
    ltp: tick.ltp,
    change: isNum(tick.change) ? tick.change : quote?.change,
    change_pct: isNum(tick.change_pct) ? tick.change_pct : quote?.change_pct,
    volume: isNum(tick.volume) ? tick.volume : quote?.volume,
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
    return JSON.parse(localStorage.getItem("option-buyer-pcr-history") || "{}") || {};
  } catch {
    return {};
  }
}

function loadOptionSignalHistory() {
  try {
    return JSON.parse(localStorage.getItem("option-buyer-signal-history") || "{}") || {};
  } catch {
    return {};
  }
}

function loadSignalJournal() {
  try {
    return JSON.parse(localStorage.getItem(SIGNAL_JOURNAL_KEY) || "[]") || [];
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
    momentum: setup?.momentum?.label || "",
    liquidity: setup?.volumeQuality?.label || "",
    premiumQuality: setup?.premiumQuality?.label || "",
  };
}

function signalJournalKey(row = {}) {
  return [
    row.symbol,
    row.side,
    row.strike,
    row.entry,
    row.target,
    row.stoploss,
    row.readiness,
    row.targetCrossed ? "target" : "",
    row.continuation ? "trail" : "",
  ].join("|");
}

function getOptionSignalTracker(history = {}, symbol, option) {
  const rows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  const lastComparable = [...rows].reverse().find((row) =>
    option && row?.strike === option.strike && row?.side === option.side
  );
  const iv = isNum(option?.iv) ? Number(option.iv) : null;
  const volume = isNum(option?.volume) ? Number(option.volume) : null;
  const premium = isNum(option?.premium) ? Number(option.premium) : null;
  const ivDelta = iv !== null && isNum(lastComparable?.iv) ? Number((iv - Number(lastComparable.iv)).toFixed(2)) : null;
  const volumeDelta = volume !== null && isNum(lastComparable?.volume) ? volume - Number(lastComparable.volume) : null;
  const premiumDelta = premium !== null && isNum(lastComparable?.premium)
    ? Number((premium - Number(lastComparable.premium)).toFixed(2))
    : null;
  const ivLabel = !isNum(ivDelta) ? "IV collecting" : Math.abs(ivDelta) < 0.15 ? "IV flat" : ivDelta > 0 ? `IV +${formatNum(ivDelta, 2)}` : `IV ${formatNum(ivDelta, 2)}`;
  const volumeLabel = !isNum(volumeDelta) ? "Vol collecting" : volumeDelta > 0 ? "Vol rising" : volumeDelta < 0 ? "Vol cooling" : "Vol flat";
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
    ivLabel,
    volumeLabel,
    premiumLabel,
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

function getHistorySeries(history = {}, symbol, key = "value", matcher) {
  const rows = Array.isArray(history?.[symbol]) ? history[symbol] : [];
  return rows
    .filter((row) => (!matcher || matcher(row)) && isNum(row?.[key]))
    .map((row) => ({ ts: row.ts, value: Number(row[key]) }));
}

function getSeriesDelta(series = []) {
  const clean = series.filter((row) => isNum(row?.value));
  if (clean.length < 2) return null;
  const first = Number(clean[0].value);
  const last = Number(clean[clean.length - 1].value);
  return Number((last - first).toFixed(2));
}

function ChangeText({ change, changePct }) {
  const value = Number(change || 0);
  return (
    <span className={classBySign(change)}>
      <DirectionIcon value={value} />
      {isNum(change) ? `${Number(change) >= 0 ? "+" : ""}${formatNum(change, 2)}` : "-"}
      {isNum(changePct) ? ` (${formatPct(changePct)})` : ""}
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

function SectionCard({ title, icon, extra, children, className = "" }) {
  return (
    <Card className={`pro-card ${className}`} title={<h3 className="section-title">{icon}{title}</h3>} extra={extra}>
      {children}
    </Card>
  );
}

function MetricTile({ label, value, sub, tone }) {
  return (
    <div className="metric-tile">
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

function MarketStrip({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="market-strip-grid">
      {items.map((item, index) => (
        <div className="strip-tile" key={`${item?.label}-${index}`}>
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-300">
            <span>{item?.label}</span>
            {item?.source === "option_chain_implied" ? <span className="strip-source">Implied</span> : null}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <strong className={`text-lg price-tone ${toneBySign(item?.change_pct ?? item?.change)}`}>{formatPrice(item?.ltp)}</strong>
            <span className="text-xs font-bold"><ChangeText change={item?.change} changePct={item?.change_pct} /></span>
          </div>
        </div>
      ))}
    </div>
  );
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

function CommandSparkline({ values = [], tone = "flat" }) {
  const clean = values.filter(isNum).map(Number);
  const min = clean.length ? Math.min(...clean) : 0;
  const max = clean.length ? Math.max(...clean) : 0;
  const range = max - min || 1;
  const points = clean
    .map((point, index) => {
      const x = clean.length <= 1 ? 0 : (index / (clean.length - 1)) * 100;
      const y = 34 - ((point - min) / range) * 26;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const active = clean.length > 1 && Math.abs(max - min) > 0.01;

  return (
    <svg className="command-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      {active ? (
        <polyline points={points} className={`command-sparkline-path ${tone}`} />
      ) : (
        <path d="M4 24 L96 24" className="command-sparkline-path flat ghost" />
      )}
    </svg>
  );
}

function FyersCandleChart({ candles = [], updatedAt = "", resolution = "5", livePrice, themeMode = "light" }) {
  const chartEl = useRef(null);
  const chartApi = useRef(null);
  const candleSeries = useRef(null);
  const volumeSeries = useRef(null);
  const fittedWindowRef = useRef("");
  const baseCandles = candles
    .filter((row) => ["open", "high", "low", "close"].every((key) => isNum(row?.[key])))
    .slice(-90);
  const clean = baseCandles.map((row, index) => {
    if (index !== baseCandles.length - 1 || !isNum(livePrice)) return row;
    const live = Number(livePrice);
    return {
      ...row,
      close: live,
      high: Math.max(Number(row.high), live),
      low: Math.min(Number(row.low), live),
      live: true,
    };
  });
  const last = clean[clean.length - 1] || {};
  const first = clean[0] || {};
  const hasCandles = clean.length > 0;
  const move = isNum(last.close) && isNum(first.open) ? Number(last.close) - Number(first.open) : null;
  const chartDataMap = new Map();
  clean.forEach((row) => {
    const time = Math.floor(Number(row.ts));
    if (!time) return;
    chartDataMap.set(time, {
      time,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    });
  });
  const chartData = [...chartDataMap.values()].sort((a, b) => a.time - b.time);
  const volumeDataMap = new Map();
  clean.forEach((row) => {
    const time = Math.floor(Number(row.ts));
    if (!time) return;
    const up = Number(row.close) >= Number(row.open);
    volumeDataMap.set(time, {
      time,
      value: asNum(row.volume, 0),
      color: up ? "rgba(5, 150, 105, 0.42)" : "rgba(220, 38, 38, 0.35)",
    });
  });
  const volumeData = [...volumeDataMap.values()].sort((a, b) => a.time - b.time);
  const dataWindowKey = chartData.length
    ? `${resolution}:${chartData[0]?.time}:${chartData[chartData.length - 1]?.time}`
    : resolution;

  useEffect(() => {
    if (!chartEl.current || !hasCandles) return undefined;
    const isDark = themeMode === "dark";
    const chart = createChart(chartEl.current, {
      autoSize: true,
      height: 540,
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
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderColor: isDark ? "rgba(199, 210, 228, 0.18)" : "rgba(100, 116, 139, 0.18)",
        timeVisible: true,
        secondsVisible: false,
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
    const volumeApi = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeApi.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    chartApi.current = chart;
    candleSeries.current = candlesApi;
    volumeSeries.current = volumeApi;

    fittedWindowRef.current = "";
    return () => {
      chart.remove();
      chartApi.current = null;
      candleSeries.current = null;
      volumeSeries.current = null;
    };
  }, [hasCandles, themeMode]);

  useEffect(() => {
    if (!candleSeries.current || !volumeSeries.current) return;
    candleSeries.current.setData(chartData);
    volumeSeries.current.setData(volumeData);
    if (fittedWindowRef.current !== dataWindowKey) {
      chartApi.current?.timeScale().fitContent();
      fittedWindowRef.current = dataWindowKey;
    }
  }, [chartData, dataWindowKey, volumeData]);

  if (!hasCandles) {
    return (
      <div className="real-chart-empty">
        <b>Real Fyers chart unavailable</b>
        <span>Open Token and refresh Fyers login if this stays blank.</span>
      </div>
    );
  }

  return (
    <div className="real-chart-wrap">
      <div className="real-chart-toolbar">
        <div>
          <span>Fyers Full Chart</span>
          <b><DirectionValue value={move}>{formatPrice(last.close)}</DirectionValue></b>
        </div>
        <small>{resolution}m | {clean.length} candles | Live LTP {formatPrice(livePrice)} | Updated {updatedAt || "-"} | O {formatPrice(last.open)} H {formatPrice(last.high)} L {formatPrice(last.low)} C {formatPrice(last.close)}</small>
      </div>
      <div className="fyers-full-chart" ref={chartEl} />
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

function LiveChartsPanel({
  pcrHistory = {},
  optionSignalHistory = {},
  setups = [],
  cards = {},
  stripByLabel = {},
  onChart,
  onOptionChain,
}) {
  const setupMap = setups.reduce((acc, setup) => {
    if (setup?.symbol) acc[setup.symbol] = setup;
    return acc;
  }, {});

  return (
    <SectionCard title="Live Trend Charts" icon={<LineChartOutlined />} extra={<Tag color="processing">Auto collected</Tag>}>
      <div className="live-chart-grid">
        {INDEXES.map((item) => {
          const strip = getStripForSymbol(stripByLabel, item);
          const setup = setupMap[item];
          const card = cards?.[item] || {};
          const priceRef = {
            ...card?.spot,
            ltp: strip?.ltp ?? card?.spot?.ltp ?? card?.future?.ltp ?? setup?.spot,
            change: strip?.change ?? card?.spot?.change ?? card?.future?.change,
            change_pct: strip?.change_pct ?? card?.spot?.change_pct ?? card?.future?.change_pct,
          };
          const analytics = setup?.analytics || card?.analytics || {};
          const option = setup?.option || setup?.displayOption;
          const pcrTrack = getPcrTracker(pcrHistory, item, analytics?.pcr ?? setup?.pcr);
          const optionTrack = getOptionSignalTracker(optionSignalHistory, item, option);
          const displayPrice = priceRef.ltp;
          const selectedOi = option?.oi;
          const selectedOiChange = option?.oiChange;
          const chartSub = option
            ? `${formatPrice(option.strike)} ${option.side} ${option.moneyness || ""}`.trim()
            : "Option chain collecting";

          const changeValue = asNum(priceRef.change_pct ?? priceRef.change, 0);
          const tone = changeValue > 0 ? "up" : changeValue < 0 ? "down" : "flat";

          return (
            <div className={`live-chart-card ${tone}`} key={item}>
              <button className="live-chart-open" type="button" onClick={() => onChart?.(item)}>
                <span className="sr-only">Open {INDEX_LABELS[item] || item} chart</span>
              </button>
              <div className="live-chart-title">
                <div>
                  <div className="metric-label">{INDEX_LABELS[item] || item}</div>
                  <strong className={`price-tone ${tone}`}>{formatPrice(displayPrice)}</strong>
                </div>
                <span className="text-xs font-bold"><ChangeText change={priceRef.change} changePct={priceRef.change_pct} /></span>
              </div>

              <div className="chart-reading-grid">
                <div><span>Price</span><b><DirectionValue value={priceRef.change}>{formatPrice(displayPrice)}</DirectionValue></b></div>
                <div><span>PCR</span><b><DirectionValue value={pcrTrack.delta1h ?? pcrTrack.delta15m ?? pcrTrack.delta}>{formatNum(pcrTrack.current, 2)}</DirectionValue></b><small>{pcrTrack.changeLabel}</small></div>
                <div><span>{option ? `${formatPrice(option.strike)} ${option.side} IV` : "Strike IV"}</span><b><DirectionValue value={optionTrack.ivDelta}>{formatNum(option?.iv, 2)}</DirectionValue></b><small>{option ? optionTrack.volumeLabel.replace("Vol ", "") : "Wait"}</small></div>
                <div><span>OI</span><b><DirectionValue value={selectedOiChange}>{formatInt(selectedOi)}</DirectionValue></b><small>{isNum(selectedOiChange) ? `${formatInt(selectedOiChange)} chg` : chartSub}</small></div>
              </div>
              <div className="chart-action-row">
                <Button size="small" onClick={() => onChart?.(item)}>Chart</Button>
                <Button size="small" type="primary" onClick={() => onOptionChain?.(item)}>Option Chain</Button>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
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

function PcrOiTrackerCard({ setups = [], cards = {}, pcrHistory = {} }) {
  const [selectedSymbol, setSelectedSymbol] = useState("NIFTY");
  const setup = setups.find((item) => item?.symbol === selectedSymbol) || {};
  const analytics = setup?.analytics || cards?.[selectedSymbol]?.analytics || {};
  const pcrTrack = getPcrTracker(pcrHistory, selectedSymbol, analytics?.pcr ?? setup?.pcr);
  const option = setup?.option || {};
  const oiFlow = analytics?.smartOIFlow || {};
  const oiTotals = setup?.oiTotals || {};
  const titlePcr = isNum(pcrTrack.current) ? formatNum(pcrTrack.current, 2) : "-";
  const tone = pcrTrack.trendLabel === "Rising" ? "green" : pcrTrack.trendLabel === "Falling" ? "red" : "amber";
  const callOi = asNum(oiTotals.callOi, null);
  const putOi = asNum(oiTotals.putOi, null);
  const callPct = isNum(callOi) && isNum(putOi) && callOi + putOi > 0 ? (callOi / (callOi + putOi)) * 100 : 50;
  const oiChange = asNum(oiTotals.putOiChange, 0) - asNum(oiTotals.callOiChange, 0);
  const pcrValues = getHistorySeries(pcrHistory, selectedSymbol).map((row) => row.value);
  const pcrDirection = pcrTrack.delta1h ?? pcrTrack.delta15m ?? pcrTrack.delta;

  return (
    <div className={`command-tile pcr-oi-card ${tone}`}>
      <div className="command-tile-top">
        <div>
          <span className="command-eyebrow">PCR & OI Tracker</span>
          <h3>{INDEX_LABELS[selectedSymbol] || selectedSymbol} PCR <DirectionValue value={pcrDirection}>{titlePcr}</DirectionValue></h3>
          <p>{pcrTrack.biasLabel || "Balanced"} | {oiFlow?.label || "OI flow collecting"}</p>
        </div>
        <Select
          size="small"
          value={selectedSymbol}
          className="pcr-oi-select"
          onChange={setSelectedSymbol}
          options={INDEXES.map((item) => ({ label: INDEX_LABELS[item] || item, value: item }))}
        />
      </div>

      <div className="command-progress">
        <div className="command-progress-track">
          <span style={{ width: `${isNum(pcrTrack.current) ? Math.max(8, Math.min(100, Number(pcrTrack.current) * 55)) : 20}%` }} />
        </div>
        <b><DirectionIcon value={pcrTrack.delta1h} />{pcrTrack.trendLabel || "Collecting"}</b>
      </div>

      <div className="oi-pressure">
        <span className="put" style={{ width: `${100 - callPct}%` }} />
        <span className="call" style={{ width: `${callPct}%` }} />
      </div>

      <CommandSparkline
        values={pcrValues.length > 1 ? pcrValues : [0.78, 0.84, 0.91, titlePcr, pcrTrack.current].filter(isNum)}
        tone={tone === "green" ? "up" : tone === "red" ? "down" : "flat"}
      />

      <div className="command-stat-grid">
        <div className="command-stat red">
          <strong><DirectionValue value={pcrDirection}>{titlePcr}</DirectionValue></strong>
          <span>PCR</span>
        </div>
        <div className="command-stat blue">
          <strong><DirectionIcon value={pcrTrack.delta1h ?? pcrTrack.delta15m} />{pcrTrack.changeLabel || "-"}</strong>
          <span>PCR Chg</span>
        </div>
        <div className="command-stat green">
          <strong><DirectionValue value={oiTotals.putOiChange}>{formatCompactInt(putOi)}</DirectionValue></strong>
          <span>Put OI</span>
        </div>
        <div className="command-stat red">
          <strong><DirectionValue value={oiTotals.callOiChange}>{formatCompactInt(callOi)}</DirectionValue></strong>
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
    </div>
  );
}

function CommandTile({ priority = "", tone = "blue", eyebrow, title, subtitle, badge, stats = [], progress, trendValues = [], actionLabel, onAction }) {
  const progressValue = isNum(progress) ? Math.max(0, Math.min(100, Number(progress))) : null;
  const chartTone = tone === "green" || tone === "cyan" ? "up" : tone === "red" ? "down" : "flat";
  const trendDelta = getSeriesDelta(trendValues.map((value) => ({ value })));

  return (
    <div className={`command-tile ${tone} ${priority}`}>
      <div className="command-tile-top">
        <div>
          <span className="command-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {badge ? <span className="command-badge">{badge}</span> : null}
      </div>

      {isNum(progressValue) ? (
        <div className="command-progress">
          <div className="command-progress-track">
            <span style={{ width: `${progressValue}%` }} />
          </div>
          <b><DirectionValue value={trendDelta}>{formatNum(progressValue, 0)}%</DirectionValue></b>
        </div>
      ) : null}

      <CommandSparkline values={trendValues.length ? trendValues : [35, 48, 44, 58, 54, progressValue].filter(isNum)} tone={chartTone} />

      <div className="command-stat-grid">
        {stats.slice(0, 4).map((item) => (
          <div className={`command-stat ${item.tone || ""}`} key={`${item.label}-${item.value}`}>
            <strong>
              <DirectionValue value={item.directionValue} tone={item.directionTone}>
                {item.value}
              </DirectionValue>
            </strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {actionLabel ? (
        <Button type="primary" block onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function CommandOverviewPanel({
  setups = [],
  sectors = [],
  vix = {},
  mood = {},
  cards = {},
  pcrHistory = {},
}) {
  const topSector = sectors.find((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) > 0);
  const weakSector = [...sectors].reverse().find((sector) => isNum(sector?.change_pct) && Number(sector.change_pct) < 0);
  const readySetups = setups.filter((setup) => setup?.option && setup?.trigger?.ready).length;
  const marketScore = asNum(mood?.score, 50);
  const setupScoreTrend = setups.map((setup) => setup?.score).filter(isNum);
  const sectorTrend = sectors.map((sector) => sector?.change_pct).filter(isNum);
  const vixTrend = [
    asNum(vix?.open, null),
    asNum(vix?.low, null),
    asNum(vix?.ltp, null),
    asNum(vix?.high, null),
    asNum(vix?.ltp, null),
  ].filter(isNum);

  return (
    <div className="command-grid">
      <CommandTile
        priority="market"
        tone={marketScore >= 60 ? "green" : marketScore <= 42 ? "red" : "amber"}
        eyebrow="Market Direction"
        title={mood?.bias || "Neutral"}
        subtitle="Broad market score and actionable setup count."
        badge={readySetups ? `${readySetups} Ready` : "Wait"}
        progress={marketScore}
        trendValues={setupScoreTrend.length > 1 ? setupScoreTrend : [45, 54, 62, marketScore - 8, marketScore]}
        stats={[
          { label: "Score", value: formatNum(marketScore, 0), tone: "blue", directionValue: marketScore - 50 },
          { label: "Setups", value: formatInt(setups.length), tone: "green" },
          { label: "Ready", value: formatInt(readySetups), tone: readySetups ? "green" : "amber" },
        ]}
      />

      <CommandTile
        priority="vix"
        tone={asNum(vix?.change_pct, 0) > 2 ? "red" : asNum(vix?.change_pct, 0) < -3 ? "amber" : "violet"}
        eyebrow="Volatility"
        title={`VIX ${formatNum(vix?.ltp, 2)}`}
        subtitle="Premium expansion and decay pressure."
        badge={formatPct(vix?.change_pct)}
        progress={isNum(vix?.ltp) ? Math.min(100, Number(vix.ltp) * 4) : 50}
        trendValues={vixTrend.length > 1 ? vixTrend : [16.8, 15.9, 15.3, asNum(vix?.ltp, 14.98)]}
        stats={[
          { label: "VIX", value: formatNum(vix?.ltp, 2), tone: "violet", directionValue: vix?.change },
          { label: "Change", value: formatPct(vix?.change_pct), tone: asNum(vix?.change_pct, 0) >= 0 ? "green" : "red", directionValue: vix?.change_pct },
          { label: "Mode", value: getDecayState().label, tone: "amber" },
        ]}
      />

      <CommandTile
        priority="sector"
        tone="cyan"
        eyebrow="Sector Rotation"
        title={topSector?.name || "No Lead"}
        subtitle={weakSector?.name ? `Weak sector: ${weakSector.name}` : "Waiting for sector strength."}
        badge={formatPct(topSector?.change_pct)}
        progress={isNum(topSector?.change_pct) ? Math.min(100, Math.abs(Number(topSector.change_pct)) * 30) : 20}
        trendValues={sectorTrend.length > 1 ? sectorTrend : [-0.4, 0.2, 0.8, asNum(topSector?.change_pct, 1.2)]}
        stats={[
          { label: "Lead", value: topSector?.name || "-", tone: "green" },
          { label: "Lead %", value: formatPct(topSector?.change_pct), tone: "green", directionValue: topSector?.change_pct },
          { label: "Weak", value: weakSector?.name || "-", tone: "red" },
        ]}
      />

      <PcrOiTrackerCard setups={setups} cards={cards} pcrHistory={pcrHistory} />
    </div>
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

function SectorBlock({ sectors = [] }) {
  return (
    <SectionCard title="Sector Rotation" icon={<LineChartOutlined />}>
      {sectors.length ? (
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

function getNewsPulse(news = {}) {
  const items = Array.isArray(news?.items) ? news.items : [];
  const high = items.filter((item) => item?.impact === "High").length;
  const bullish = items.filter((item) => item?.tone === "Bullish").length;
  const bearish = items.filter((item) => item?.tone === "Bearish").length;
  const tone = !items.length ? "warning" : bearish > bullish ? "error" : bullish > bearish ? "success" : "default";
  const label = !items.length
    ? "No Feed"
    : bearish > bullish
      ? "Bearish News"
      : bullish > bearish
        ? "Bullish News"
        : "Mixed News";

  return { items, high, bullish, bearish, tone, label };
}

function getSetupSide(setup) {
  const option = setup?.option || setup?.displayOption;
  return option?.side === "PE" ? "PE" : option?.side === "CE" ? "CE" : null;
}

function isMarketConflict(setup, mood = {}) {
  const side = getSetupSide(setup);
  const bias = String(mood?.bias || setup?.signal?.bias || "").toLowerCase();
  if (!side || !bias) return false;
  return (side === "PE" && bias.includes("bull")) || (side === "CE" && bias.includes("bear"));
}

function getDecisionChecks({ setup, mood = {}, vix = {}, newsPulse = {}, pcrTrack = {}, optionTrack = {} }) {
  const side = getSetupSide(setup);
  const rr = asNum(setup?.plan?.riskReward, 0);
  const vixChange = asNum(vix?.change_pct, null);
  const newsConflict = side === "PE" ? newsPulse.bullish > newsPulse.bearish : side === "CE" ? newsPulse.bearish > newsPulse.bullish : false;
  const pcrOk = side === "PE"
    ? asNum(pcrTrack.current, 1) <= 1.05 || pcrTrack.trendLabel === "Falling"
    : side === "CE"
      ? asNum(pcrTrack.current, 1) >= 0.85 || pcrTrack.trendLabel === "Rising"
      : false;

  return [
    {
      label: "Trend",
      value: isMarketConflict(setup, mood) ? "Conflict" : side ? "Aligned" : "Wait",
      state: !side ? "warn" : isMarketConflict(setup, mood) ? "fail" : "pass",
    },
    {
      label: "Trigger",
      value: setup?.trigger?.ready ? "Ready" : "Wait",
      state: setup?.trigger?.ready ? "pass" : "warn",
    },
    {
      label: "R:R",
      value: isNum(rr) && rr > 0 ? formatNum(rr, 2) : "-",
      state: rr >= 1.5 ? "pass" : rr >= 1.1 ? "warn" : "fail",
    },
    {
      label: "PCR",
      value: isNum(pcrTrack.current) ? `${formatNum(pcrTrack.current, 2)} ${pcrTrack.trendLabel}` : "Collect",
      state: !side || !isNum(pcrTrack.current) ? "warn" : pcrOk ? "pass" : "warn",
    },
    {
      label: "VIX",
      value: isNum(vix?.ltp) ? `${formatNum(vix.ltp, 2)} ${formatPct(vixChange)}` : "-",
      state: isNum(vixChange) && vixChange < -4 ? "warn" : isNum(vixChange) && vixChange > 4 ? "fail" : "pass",
    },
    {
      label: "News",
      value: newsPulse.label || "No Feed",
      state: !newsPulse.items?.length ? "warn" : newsConflict ? "fail" : "pass",
    },
    {
      label: "Premium",
      value: optionTrack.ivLabel || setup?.premiumQuality?.label || "-",
      state: String(setup?.premiumQuality?.tone || "").includes("error") ? "fail" : "pass",
    },
  ];
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
  news = {},
  pcrHistory = {},
  optionSignalHistory = {},
  buyerMode = "INTRADAY",
  onModeChange,
  signalJournalCount = 0,
  onExportSignals,
  loading = false,
  onOpen,
  onQuick,
}) {
  const setupMap = setups.reduce((acc, setup) => {
    if (setup?.symbol) acc[setup.symbol] = setup;
    return acc;
  }, {});
  const newsPulse = getNewsPulse(news);
  const readyCount = setups.filter((setup) =>
    setup?.option && setup?.trigger?.ready && setup?.score >= 65 && setup?.warnings?.length <= 1
  ).length;
  const rankedSymbols = [...setups]
    .sort((a, b) => b.score - a.score)
    .reduce((acc, setup, index) => {
      if (setup?.symbol) acc[setup.symbol] = index + 1;
      return acc;
    }, {});

  const rows = INDEXES.map((item, fixedIndex) => {
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

  return (
    <SectionCard
      title="Option Buyer Desk"
      icon={<ThunderboltOutlined />}
      extra={
        <Space size={8} wrap>
          <Button size="small" onClick={onExportSignals}>
            Export Signals{signalJournalCount ? ` ${signalJournalCount}` : ""}
          </Button>
          <Segmented
            size="small"
            value={buyerMode}
            onChange={onModeChange}
            options={Object.entries(BUYER_MODES).map(([value, item]) => ({ label: item.label, value }))}
          />
          {loading ? <Spin size="small" /> : <Tag color={readyCount ? "success" : "warning"}>{readyCount ? `${readyCount} Ready` : "Wait Mode"}</Tag>}
        </Space>
      }
      className="desk-card"
    >
      <div className="decision-cockpit">
        <div className="index-decision-grid">
          {rows.map((row) => {
            const setup = row.setup;
            const plan = setup?.plan || {};
            const displayOption = setup?.option || setup?.displayOption;
            const adText = isNum(row.ad?.advances) || isNum(row.ad?.declines)
              ? `${formatInt(row.ad?.advances)} / ${formatInt(row.ad?.declines)}`
              : "-";
            const tone = setup?.trigger?.tone || setup?.tone || toneFromBias(row.bias);
            const pcrTrack = getPcrTracker(pcrHistory, row.symbol, row.analytics?.pcr ?? setup?.pcr);
            const optionTrack = getOptionSignalTracker(optionSignalHistory, row.symbol, displayOption);
            const checks = getDecisionChecks({ setup, mood, vix, newsPulse, pcrTrack, optionTrack });
            const blockers = checks.filter((check) => check.state !== "pass").slice(0, 2);
            const readiness = getTradeReadiness({ setup, displayOption, pcrTrack, optionTrack });

            return (
              <div className={`index-decision-card ${tone}`} key={row.symbol}>
                <div className="index-card-head">
                  <div>
                    <div className="metric-label">{row.rank ? `#${row.rank} ` : ""}{row.label}</div>
                    <div className={`index-price price-tone ${toneBySign(row.changePct ?? row.change)}`}>{formatPrice(row.price)}</div>
                    <div className="index-change"><ChangeText change={row.change} changePct={row.changePct} /></div>
                  </div>
                  <div className="card-status-stack">
                    <Tooltip title={readiness.reason || "Trade readiness"}>
                      <Tag color={readiness.tone}>{readiness.label}</Tag>
                    </Tooltip>
                    <Tag color={tone}>{setup?.trigger?.invalidated ? "Invalid" : row.command}</Tag>
                  </div>
                </div>

                <div className="index-action-line">
                  <strong>{displayOption ? `${formatPrice(displayOption.strike)} ${displayOption.side}` : "No Strike"}</strong>
                  <span>{readiness.reason || (setup?.option ? (setup?.premiumQuality?.label || setup?.quality?.label) : displayOption ? `${displayOption.moneyness || "Watch"} Premium` : row.bias)}</span>
                </div>

                <div className="mini-plan-grid">
                  <div><span>Entry</span><b>{formatPremium(plan.entry ?? displayOption?.premium)}</b></div>
                  <div><span>Target</span><b>{formatPremium(plan.target)}</b></div>
                  <div><span>SL</span><b>{formatPremium(plan.stoploss)}</b></div>
                  <div><span>R:R</span><b>{formatNum(plan.riskReward, 2)}</b></div>
                </div>

                <div className="execution-trigger-strip">
                  <span>
                    Trigger
                    <b>{isNum(plan.indexTrigger) ? `${displayOption?.side === "PE" ? "<" : ">"} ${formatPrice(plan.indexTrigger)}` : setup?.trigger?.label || "Wait"}</b>
                  </span>
                  <span>
                    Premium
                    <b><DirectionValue value={optionTrack.premiumDelta}>{optionTrack.premiumLabel || "Collecting"}</DirectionValue></b>
                  </span>
                  <span>
                    Liquidity
                    <b>{setup?.volumeQuality?.label || "Watch"}</b>
                  </span>
                </div>

                <div className="index-signal-strip">
                  <span>PCR <b><DirectionValue value={pcrTrack.delta1h ?? pcrTrack.delta15m ?? pcrTrack.delta}>{isNum(pcrTrack.current) ? formatNum(pcrTrack.current, 2) : "-"}</DirectionValue></b></span>
                  <span>A/D <b><DirectionValue value={asNum(row.ad?.advances, 0) - asNum(row.ad?.declines, 0)}>{adText}</DirectionValue></b></span>
                  <span>Score <b><DirectionValue value={asNum(setup?.score, 0) - 50}>{formatNum(setup?.score, 0)}</DirectionValue></b></span>
                  {(blockers.length ? blockers : [{ label: "Status", value: setup?.trigger?.ready ? "Ready" : "Watch", state: setup?.trigger?.ready ? "pass" : "warn" }]).map((item) => (
                    <span className={`blocker-chip ${item.state}`} key={`${row.symbol}-${item.label}`}>{item.label} <b>{item.value}</b></span>
                  ))}
                </div>

                <div className={`index-level-snapshot ${row.levelStatus?.tone || "neutral"}`}>
                  <div className="level-state-cell">
                    <span>Level</span>
                    <b><DirectionIcon tone={row.levelStatus?.tone} />{row.levelStatus?.label || "-"}</b>
                    <small>{row.levelStatus?.detail || "-"}</small>
                  </div>
                  <div className="level-full-cell">
                    <span>Support</span>
                    <b>{formatLevelList(row.levels.supports)}</b>
                  </div>
                  <div className="level-full-cell">
                    <span>Resistance</span>
                    <b>{formatLevelList(row.levels.resistances)}</b>
                  </div>
                  <div>
                    <span>VWAP</span>
                    <b><DirectionValue value={isNum(row.price) && isNum(row.vwap) ? Number(row.price) - Number(row.vwap) : null}>{formatPrice(row.vwap)}</DirectionValue></b>
                  </div>
                  <div>
                    <span>Pivot</span>
                    <b><DirectionValue value={isNum(row.price) && isNum(row.pivot) ? Number(row.price) - Number(row.pivot) : null}>{formatPrice(row.pivot)}</DirectionValue></b>
                  </div>
                </div>

                <div className="index-actions">
                  <Button size="small" icon={<EyeOutlined />} onClick={() => onQuick(row.symbol)}>Snapshot</Button>
                  <Button size="small" type="primary" icon={<DashboardOutlined />} onClick={() => onOpen(row.symbol)}>Terminal</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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

function DetailOverview({ detail }) {
  const analytics = detail?.analytics || {};
  const spot = detail?.spot || {};
  const future = detail?.future || {};
  const signal = analytics?.tradeSignalPanel || {};
  const chain = detail?.optionChain || [];
  const underlyingPrice = asNum(spot?.ltp || future?.ltp);
  const selectedOption = selectTradableOption(chain, underlyingPrice, signal?.bias);
  const optionPlan = buildOptionBuyerPlan(signal, selectedOption, underlyingPrice);
  const quality = evaluateTrade(selectedOption, signal);
  const previous = analytics?.previousDayLevels || {};
  const breakout = analytics?.breakoutBreakdown || {};
  const breadth = analytics?.breadthStats || {};
  const oiFlow = analytics?.smartOIFlow || {};
  const regime = analytics?.marketRegime || {};

  return (
    <div className="grid gap-4">
      <TradeBanner signal={signal} option={selectedOption} quality={quality} underlyingPrice={underlyingPrice} />

      <SectionCard title="Key Levels" icon={<ControlOutlined />}>
        <div className="level-grid">
          <LevelPill label="Spot" value={formatPrice(spot?.ltp)} />
          <LevelPill label="Future" value={formatPrice(future?.ltp)} sub={`Basis ${formatNum(future?.basis, 2)}`} />
          <LevelPill label="VWAP" value={formatPrice(analytics?.vwap || spot?.vwap || future?.vwap)} />
          <LevelPill label="Support 1" value={formatPrice(analytics?.supports?.[0] || analytics?.putWall)} tone={levelTone(analytics?.supports?.[0], true)} />
          <LevelPill label="Resistance 1" value={formatPrice(analytics?.resistances?.[0] || analytics?.callWall)} tone={levelTone(analytics?.resistances?.[0], false)} />
          <LevelPill label="PD High" value={formatPrice(previous?.high)} tone="resistance" />
          <LevelPill label="PD Low" value={formatPrice(previous?.low)} tone="support" />
          <LevelPill label="Pivot" value={formatPrice(previous?.pivot)} tone="warning" />
          <LevelPill label="Breakout" value={formatPrice(breakout?.breakoutLevel)} tone="support" />
          <LevelPill label="Breakdown" value={formatPrice(breakout?.breakdownLevel)} tone="resistance" />
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Decision Matrix" icon={<ThunderboltOutlined />}>
          <div className="metric-grid">
            <MetricTile label="PCR" value={formatNum(analytics?.pcr, 2)} />
            <MetricTile label="Max Pain" value={formatPrice(analytics?.maxPain)} />
            <MetricTile label="Market Regime" value={regime?.label || "-"} sub={regime?.tone || ""} />
            <MetricTile label="OI Flow" value={oiFlow?.label || "-"} sub={oiFlow?.bias || ""} />
            <MetricTile label="Call Wall" value={formatPrice(analytics?.callWall)} />
            <MetricTile label="Put Wall" value={formatPrice(analytics?.putWall)} />
            <MetricTile label="Breadth Score" value={formatNum(breadth?.breadthScore, 0)} />
            <MetricTile label="Option R:R" value={formatNum(optionPlan?.riskReward, 2)} />
          </div>
        </SectionCard>

        <SectionCard title="Range Projection" icon={<LineChartOutlined />}>
          <div className="metric-grid">
            <MetricTile label="Day Range" value={formatPrice(analytics?.intradayRangeProjection?.dayRange)} />
            <MetricTile label="Projected Move" value={formatPrice(analytics?.intradayRangeProjection?.projectedMove)} />
            <MetricTile label="Projected High" value={formatPrice(analytics?.intradayRangeProjection?.projectedHigh)} />
            <MetricTile label="Projected Low" value={formatPrice(analytics?.intradayRangeProjection?.projectedLow)} />
          </div>
        </SectionCard>
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

function ChartPopupContent({ detail = {}, symbol, pcrHistory = {}, optionSignalHistory = {}, stripByLabel = {}, themeMode = "light" }) {
  const item = symbol || detail?.symbol;
  const [resolution, setResolution] = useState("5");
  const [chartView, setChartView] = useState("fyers");
  const [fyersChart, setFyersChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [popupDetail, setPopupDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [liveQuote, setLiveQuote] = useState(null);
  const [liveFeed, setLiveFeed] = useState("REST");
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
  const pcrTrack = getPcrTracker(pcrHistory, item, analytics?.pcr);
  const optionTrack = getOptionSignalTracker(optionSignalHistory, item, option);

  useEffect(() => {
    setPopupDetail(null);
    setDetailLoading(false);
  }, [item]);

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
      if (!silent) setChartLoading(true);
      if (!silent) setChartError("");
      try {
        const lookback = resolution === "1"
          ? 375
          : resolution === "2"
            ? 390
            : resolution === "15"
              ? 1500
              : resolution === "30"
                ? 3000
                : 900;
        const json = await fetchJson(`/api/fyers/history?symbol=${item}&resolution=${resolution}&lookback=${lookback}`, 30000);
        if (cancelled) return;
        if (!json?.ok) {
          setFyersChart((prev) => prev);
          setChartError(json?.error || "Fyers chart data unavailable");
        } else {
          setFyersChart(json);
          setChartError("");
        }
      } catch (err) {
        if (!cancelled) {
          setFyersChart((prev) => prev);
          setChartError(String(err?.message || err));
        }
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    loadRealChart();
    const timer = window.setInterval(() => loadRealChart(true), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [item, resolution]);

  useEffect(() => {
    setLiveQuote(null);
    setLiveFeed("REST");
  }, [item]);

  useEffect(() => {
    if (!item || typeof EventSource === "undefined") return undefined;
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
  }, [item]);

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
    const timer = window.setInterval(loadLiveQuote, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [item]);

  return (
    <div className="chart-popup">
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
              onChange={setResolution}
              options={[
                { label: "1m", value: "1" },
                { label: "2m", value: "2" },
                { label: "5m", value: "5" },
                { label: "15m", value: "15" },
                { label: "30m", value: "30" },
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
          </Space>
          <Space size={6}>
            {chartLoading || detailLoading ? <Spin size="small" /> : null}
            <Tag color={chartView === "tradingview" ? "processing" : fyersChart?.ok ? "success" : "warning"}>
              {chartView === "tradingview" ? TRADINGVIEW_SYMBOLS[item] || "TradingView" : fyersChart?.sourceSymbol || "Fyers"}
            </Tag>
            <Tag color={liveFeed === "WS" ? "success" : "processing"}>{liveFeed === "WS" ? "Fyers WS live" : "Live quote 2s"}</Tag>
            {chartView === "fyers" ? <Tag color="processing">Candles 10s</Tag> : null}
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
        {chartView === "fyers" && chartError ? <Alert type="warning" showIcon message={chartError} /> : null}
        {chartView === "tradingview" ? (
          <TradingViewLaunchPanel symbol={item} />
        ) : chartLoading && !fyersChart?.candles?.length ? (
          <div className="real-chart-empty">
            <Spin />
            <b>Loading Fyers candles</b>
            <span>Fetching live candle history from Fyers.</span>
          </div>
        ) : (
          <FyersCandleChart candles={fyersChart?.candles || []} updatedAt={liveQuote?.updated_at || fyersChart?.timestamp} resolution={resolution} livePrice={priceRef.ltp} themeMode={themeMode} />
        )}
      </div>
      <div className="metric-grid">
        <MetricTile label="PCR" value={<DirectionValue value={pcrTrack.delta1h ?? pcrTrack.delta15m ?? pcrTrack.delta}>{formatNum(pcrTrack.current, 2)}</DirectionValue>} sub={pcrTrack.changeLabel} />
        <MetricTile label="Strike" value={option ? `${formatPrice(option.strike)} ${option.side}` : "-"} sub={option?.moneyness || "Option chain watch"} />
        <MetricTile label="Premium Momentum" value={<DirectionValue value={optionTrack.premiumDelta}>{formatPremium(option?.premium)}</DirectionValue>} sub={optionTrack.premiumLabel || ""} />
        <MetricTile label="Open Interest" value={<DirectionValue value={option?.oiChange}>{formatInt(option?.oi)}</DirectionValue>} sub={isNum(option?.oiChange) ? `OI chg ${formatInt(option.oiChange)}` : ""} />
        <MetricTile label="IV / Volume" value={formatNum(option?.iv, 2)} sub={optionTrack.volumeLabel || ""} />
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

function DetailRisk({ detail }) {
  const analytics = detail?.analytics || {};
  const spot = detail?.spot || {};
  const future = detail?.future || {};
  const chain = detail?.optionChain || [];
  const signal = analytics?.tradeSignalPanel || {};
  const underlyingPrice = asNum(spot?.ltp || future?.ltp);
  const option = selectTradableOption(chain, underlyingPrice, signal?.bias);
  const observedOption = option || selectDisplayOption(chain, underlyingPrice, signal?.bias);
  const optionPlan = buildOptionBuyerPlan(signal, option, underlyingPrice);
  const quality = evaluateTrade(option, signal);
  const confidence = asNum(signal?.confidence, 0);
  const premiumQuality = getPremiumQuality(option, underlyingPrice, "INTRADAY", getStrikeStep(chain));
  const momentum = getMomentumState(spot, future, observedOption?.side);
  const vwapState = getVwapState(spot, future, observedOption?.side);
  const volumeQuality = getVolumeQuality(observedOption, chain);
  const trap = getTrapStatus(observedOption, underlyingPrice, analytics, "INTRADAY");
  const trigger = getTriggerStatus(option, optionPlan, underlyingPrice, signal);
  const decay = getDecayState();
  const rr = asNum(optionPlan?.riskReward, null);
  const riskChecklist = [
    { label: "Directional bias", state: String(signal?.bias || "").match(/bull|bear/i) ? "pass" : "warn", value: signal?.bias || "Neutral" },
    { label: "Premium range", state: premiumQuality?.tone === "success" ? "pass" : premiumQuality?.tone === "error" ? "fail" : "warn", value: premiumQuality?.label || "-" },
    { label: "Momentum", state: momentum?.tone === "success" ? "pass" : momentum?.tone === "error" ? "fail" : "warn", value: momentum?.label || "-" },
    { label: "VWAP side", state: vwapState?.aligned ? "pass" : vwapState?.tone === "warning" ? "warn" : "fail", value: vwapState?.label || "-" },
    { label: "S/R trap", state: trap?.tone === "success" ? "pass" : trap?.label === "Near S/R" ? "warn" : "pass", value: trap?.label || "-" },
    { label: "Risk reward", state: isNum(rr) && rr >= 1.15 ? "pass" : isNum(rr) ? "warn" : "fail", value: isNum(rr) ? formatNum(rr, 2) : "-" },
  ];

  return (
    <div className="grid gap-4">
      <SectionCard title="Risk Control Plan" icon={<ControlOutlined />}>
        <div className="risk-plan-layout">
          <div className={`risk-verdict ${quality.tone || "warning"}`}>
            <Progress
              type="dashboard"
              percent={Math.max(0, Math.min(100, quality.score))}
              format={() => quality.label}
              strokeColor={quality.tone === "success" ? "#059669" : quality.tone === "error" ? "#dc2626" : "#d97706"}
              size={152}
            />
            <Alert type={quality.tone === "success" ? "success" : quality.tone === "error" ? "error" : "warning"} message={quality.reason} showIcon />
          </div>

          <div className="risk-control-grid">
            <MetricTile label="Selected Strike" value={observedOption ? `${formatPrice(observedOption.strike)} ${observedOption.side}` : "-"} sub={option ? "Tradable setup" : "Nearest liquid watch"} />
            <MetricTile label="Entry" value={formatPremium(optionPlan?.entry ?? observedOption?.premium)} sub={isNum(optionPlan?.indexTrigger) ? `Index trigger ${formatPrice(optionPlan.indexTrigger)}` : "Wait for trigger"} />
            <MetricTile label="Stop Loss" value={formatPremium(optionPlan?.stoploss)} sub={isNum(optionPlan?.risk) ? `Risk ${formatPremium(optionPlan.risk)}` : "No premium SL"} />
            <MetricTile label="Target" value={formatPremium(optionPlan?.target)} sub={isNum(optionPlan?.reward) ? `Reward ${formatPremium(optionPlan.reward)}` : "No target yet"} />
            <MetricTile label="Risk / Reward" value={formatNum(optionPlan?.riskReward, 2)} sub={isNum(rr) && rr >= 1.15 ? "Acceptable" : "Needs better reward"} />
            <MetricTile label="Invalidation" value={trigger?.label || "-"} sub={trigger?.reason || ""} />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="Risk Checklist" icon={<ThunderboltOutlined />}>
          <div className="risk-check-list">
            {riskChecklist.map((item) => (
              <div className={`risk-check ${item.state}`} key={item.label}>
                <span>{item.label}</span>
                <b><DirectionIcon tone={item.state} />{item.value}</b>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Liquidity & Open Interest" icon={<BarChartOutlined />}>
          <div className="metric-grid">
            <MetricTile label="Volume" value={formatInt(observedOption?.volume)} sub={volumeQuality?.reason || ""} />
            <MetricTile label="Open Interest" value={<DirectionValue value={observedOption?.oiChange}>{formatInt(observedOption?.oi)}</DirectionValue>} sub={isNum(observedOption?.oiChange) ? `OI chg ${formatInt(observedOption.oiChange)}` : ""} />
            <MetricTile label="Selected IV" value={formatNum(observedOption?.iv, 2)} sub={observedOption ? `${observedOption.moneyness || "-"} premium` : ""} />
            <MetricTile label="Confidence" value={`${formatNum(confidence, 0)}%`} sub={signal?.action || ""} />
            <MetricTile label="VWAP Side" value={vwapState?.label || "-"} sub={vwapState?.reason || ""} />
            <MetricTile label="S/R Risk" value={trap?.label || "-"} sub={trap?.reason || ""} />
            <MetricTile label="Decay" value={decay?.label || "-"} sub={decay?.note || ""} />
            <MetricTile label="Premium Quality" value={premiumQuality?.label || "-"} sub={premiumQuality?.reason || ""} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default function ProfessionalDashboard() {
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("pro-dashboard-theme") || "light");
  const [view, setView] = useState("home");
  const [symbol, setSymbol] = useState("NIFTY");
  const [detailTab, setDetailTab] = useState("overview");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [buyerMode, setBuyerMode] = useState("INTRADAY");
  const [homeData, setHomeData] = useState(() => loadCachedHomeData());
  const [tickerData, setTickerData] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingHome, setLoadingHome] = useState(() => !loadCachedHomeData());
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSymbol, setQuickSymbol] = useState("");
  const [quickData, setQuickData] = useState(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [chartPopupSymbol, setChartPopupSymbol] = useState("");
  const [optionChainPopupSymbol, setOptionChainPopupSymbol] = useState("");
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
  const [liveTickMap, setLiveTickMap] = useState({});
  const [dashboardFeed, setDashboardFeed] = useState("REST");
  const detailRequestRef = useRef(0);
  const homeRequestRef = useRef(false);
  const tickerRequestRef = useRef(false);
  const analyticsRequestRef = useRef(false);
  const buyerSetupsRequestRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("pro-dashboard-theme", themeMode);
  }, [themeMode]);

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
      await Promise.allSettled(
        INDEXES.map(async (item) => {
          try {
            const data = await fetchJson(`/api/dashboard?symbol=${item}`, 45000);
            if (data?.symbol) {
              setBuyerSetupData((prev) => ({ ...prev, [item]: data }));
            }
          } catch (err) {
            console.warn(`buyer setup scan failed for ${item}`, err);
          }
        })
      );
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
    return () => {
      window.clearTimeout(analyticsTimer);
      window.clearTimeout(setupTimer);
    };
  }, [loadAnalytics, loadBuyerSetups, loadHome, loadMarketNews]);

  useEffect(() => {
    if (view !== "detail") return;
    loadDetail(symbol, false);
  }, [loadDetail, symbol, view]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(() => {
      if (view === "home") {
        loadTicker();
      } else {
        loadDetail(symbol, true);
      }
    }, view === "home" ? 6000 : 45000);
    return () => clearInterval(id);
  }, [autoRefresh, loadDetail, loadHome, loadTicker, symbol, view]);

  useEffect(() => {
    if (!autoRefresh || view !== "home") return undefined;
    const id = setInterval(() => {
      loadAnalytics();
    }, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, loadAnalytics, view]);

  useEffect(() => {
    if (!autoRefresh || view !== "home") return undefined;
    const id = setInterval(() => {
      loadBuyerSetups(true);
    }, 120000);
    return () => clearInterval(id);
  }, [autoRefresh, loadBuyerSetups, view]);

  useEffect(() => {
    if (!autoRefresh || view !== "home") return undefined;
    const id = setInterval(() => {
      loadMarketNews(true);
    }, 180000);
    return () => clearInterval(id);
  }, [autoRefresh, loadMarketNews, view]);

  useEffect(() => {
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
  }, []);

  const marketStripBase = useMemo(() => {
    const tickerStrip = tickerData?.marketStrip || [];
    if (tickerStrip.some(hasQuoteValue)) return tickerStrip;
    return homeData?.marketStrip || tickerStrip || [];
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
  const buyerSetups = useMemo(
    () => INDEXES.map((item) => liveBuyerSetupData?.[item]).filter(Boolean).map((item) => buildBuyerSetup(item, vix, buyerMode)),
    [buyerMode, liveBuyerSetupData, vix]
  );
  const displayMarketStrip = useMemo(
    () => mergeImpliedStripValues(marketStrip, buyerSetups),
    [buyerSetups, marketStrip]
  );

  useEffect(() => {
    const stamp = Date.now();
    setPcrHistory((prev) => {
      let changed = false;
      const next = { ...(prev || {}) };

      INDEXES.forEach((item) => {
        const pcr = buyerSetupData?.[item]?.analytics?.pcr ?? homeCards?.[item]?.analytics?.pcr;
        if (!isNum(pcr)) return;

        const value = Number(Number(pcr).toFixed(2));
        const existing = Array.isArray(next[item]) ? next[item] : [];
        const last = existing[existing.length - 1];
        if (last && Math.abs(Number(last.value) - value) < 0.005 && stamp - Number(last.ts || 0) < 60000) return;

        next[item] = [...existing, { ts: stamp, value }].slice(-40);
        changed = true;
      });

      if (changed) {
        localStorage.setItem("option-buyer-pcr-history", JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [buyerSetupData, homeCards]);

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
          stamp - Number(last.ts || 0) < 60000
        ) {
          return;
        }

        next[setup.symbol] = [...existing, row].slice(-80);
        changed = true;
      });

      if (changed) {
        localStorage.setItem("option-buyer-signal-history", JSON.stringify(next));
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
      let changed = false;
      const existing = Array.isArray(prev) ? prev : [];
      const recentKeys = new Set(
        existing
          .filter((row) => Date.now() - Number(row?.ts || 0) < 60000)
          .map(signalJournalKey)
      );
      const additions = [];

      buyerSetups.forEach((setup) => {
        const row = makeSignalJournalRow(setup, stripMap[setup?.symbol] || {});
        if (!row) return;
        const key = signalJournalKey(row);
        if (recentKeys.has(key)) return;
        recentKeys.add(key);
        additions.push(row);
        changed = true;
      });

      if (!changed) return prev;
      const next = [...existing, ...additions].slice(-1500);
      localStorage.setItem(SIGNAL_JOURNAL_KEY, JSON.stringify(next));
      return next;
    });
  }, [buyerSetups, displayMarketStrip]);
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
    setDetailTab("overview");
    setView("detail");
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
      "score", "pcr", "oi", "oiChange", "iv", "volume", "momentum", "liquidity",
      "premiumQuality", "reason",
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
      if (view === "home") {
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

  return (
    <ConfigProvider
      theme={{
        algorithm: themeMode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 8,
          colorPrimary: "#0f766e",
          fontFamily: "Inter, Segoe UI, Arial, sans-serif",
        },
      }}
    >
      <div className={`pro-dashboard ${themeMode === "dark" ? "dark" : ""}`}>
        <div className="pro-shell">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-700 text-white">
                <DashboardOutlined />
              </div>
              <div>
                <h1 className="m-0 text-2xl font-black tracking-normal">Options Command Dashboard</h1>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                  Live index, futures, breadth, and option-chain execution desk
                </div>
              </div>
            </div>

            <Space wrap>
              <Tooltip title="Switch workspace">
                <Segmented
                  value={view}
                  onChange={(value) => setView(value)}
                  options={[
                    { label: "Home", value: "home", icon: <HomeOutlined /> },
                    { label: symbol, value: "detail", icon: <LineChartOutlined /> },
                  ]}
                />
              </Tooltip>
              <Select
                value={symbol}
                style={{ width: 132 }}
                onChange={(value) => {
                  setSymbol(value);
                  setView("detail");
                }}
                options={INDEXES.map((item) => ({ label: item, value: item }))}
              />
              <Tag color={dashboardFeed === "WS" ? "success" : "default"}>
                {dashboardFeed === "WS" ? "Fyers WS live" : "REST refresh"}
              </Tag>
              <Tooltip title="Auto refresh">
                <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="Auto" unCheckedChildren="Manual" />
              </Tooltip>
              <Button icon={<ControlOutlined />} onClick={openTokenModal}>
                Token
              </Button>
              <Button icon={<ReloadOutlined spin={refreshing} />} onClick={manualRefresh}>
                Refresh
              </Button>
              <Switch
                checked={themeMode === "dark"}
                onChange={(checked) => setThemeMode(checked ? "dark" : "light")}
                checkedChildren="Dark"
                unCheckedChildren="Light"
              />
            </Space>
          </div>

          {error ? <Alert className="mb-4" type="error" showIcon message={error} /> : null}
          {quoteDataMissing ? (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              message="Fyers quotes are connected, but live values are not coming right now."
              description="The backend is running, but the quote API is returning blank values or a Fyers error. Check http://127.0.0.1:5000/api/debug/fyers-quote after refreshing the token."
            />
          ) : null}
          {quoteRateLimited ? (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              message="Live quote refresh is rate-limited right now."
              description={quoteStatus?.message || `Showing cached values. Retry after ${formatNum(quoteStatus?.cooldownSeconds, 0)} seconds or refresh the Fyers token if this continues.`}
            />
          ) : null}
          {usingImpliedQuotes ? (
            <Alert
              className="mb-4"
              type="info"
              showIcon
              message="Using option-chain implied index levels while Fyers quotes recover."
              description="Signals and charts can continue from option-chain data. The top quote strip will switch back to live quote values automatically."
            />
          ) : null}

          <Card className="pro-card mb-4" styles={{ body: { padding: 12 } }}>
            <div className="flex flex-wrap items-center gap-3">
              <MarketStrip items={displayMarketStrip} />
            </div>
          </Card>

          {view === "home" ? (
            <Spin spinning={showHomeSpinner}>
              <div className="grid gap-4">
                <CommandOverviewPanel
                  setups={buyerSetups}
                  sectors={sectors}
                  vix={vix}
                  mood={marketMood}
                  cards={homeCards}
                  pcrHistory={pcrHistory}
                />

                <LiveChartsPanel
                  pcrHistory={pcrHistory}
                  optionSignalHistory={optionSignalHistory}
                  setups={buyerSetups}
                  cards={homeCards}
                  stripByLabel={stripByLabel}
                  onChart={openChartPopup}
                  onOptionChain={openOptionChainPopup}
                />

                <OptionBuyerDesk
                  setups={buyerSetups}
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
                  onExportSignals={exportSignalJournal}
                  loading={loadingSetups}
                  onOpen={openTerminal}
                  onQuick={openQuick}
                />

                <div className="sector-news-grid">
                  <SectorBlock sectors={sectors} />
                  <MarketNewsPanel news={marketNews} loading={loadingNews} />
                </div>
              </div>
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
                        setDetailTab("overview");
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
                  <Tabs
                    activeKey={detailTab}
                    onChange={setDetailTab}
                    items={[
                      {
                        key: "overview",
                        label: "Overview",
                        children: <DetailOverview detail={currentDetail} />,
                      },
                      {
                        key: "options",
                        label: "Options",
                        children: <DetailOptions detail={currentDetail} />,
                      },
                      {
                        key: "risk",
                        label: "Risk",
                        children: <DetailRisk detail={currentDetail} />,
                      },
                    ]}
                  />
                ) : (
                  <Card className="pro-card">
                    <Empty description="No terminal data loaded yet" />
                  </Card>
                )}
              </Spin>
            </div>
          )}
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
          className={`dashboard-popup ${themeMode === "dark" ? "dark" : ""}`}
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
          title={`${INDEX_LABELS[chartPopupSymbol] || chartPopupSymbol || "Index"} Live Chart`}
          open={Boolean(chartPopupSymbol)}
          onCancel={() => setChartPopupSymbol("")}
          footer={<Button onClick={() => setChartPopupSymbol("")}>Close</Button>}
          keyboard
          width={980}
          className={`dashboard-popup ${themeMode === "dark" ? "dark" : ""}`}
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
            />
          ) : (
            <Empty description="Chart data is still loading" />
          )}
        </Modal>

        <Modal
          title={`${INDEX_LABELS[optionChainPopupSymbol] || optionChainPopupSymbol || "Index"} Option Chain`}
          open={Boolean(optionChainPopupSymbol)}
          onCancel={() => setOptionChainPopupSymbol("")}
          footer={<Button onClick={() => setOptionChainPopupSymbol("")}>Close</Button>}
          keyboard
          width={1180}
          className={`dashboard-popup option-chain-popup ${themeMode === "dark" ? "dark" : ""}`}
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
          className={`snapshot-modal ${themeMode === "dark" ? "dark" : ""}`}
        >
          <div className="grid gap-4">
            {quickLoading ? (
              <Alert type="info" showIcon message="Refreshing latest option-chain values..." />
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
