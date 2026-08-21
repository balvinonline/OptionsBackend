import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ExcelDashboard.css";

/* =========================================================
   Helpers
========================================================= */

function hasUsableHomeSummaryPayload(card) {
  if (!card || typeof card !== "object") return false;
  if (card.error) return false;

  return (
    hasUsableSpot(card) ||
    hasUsableFuture(card) ||
    hasUsableAnalytics(card) ||
    hasUsableBreadth(card) ||
    hasUsableSectors(card) ||
    hasUsableMarketStrip(card?.marketStrip || []) ||
    hasUsableVix(card)
  );
}

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

function shallowEqualMarketItems(a = [], b = []) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] || {};
    const y = b[i] || {};
    if (
      x.label !== y.label ||
      Number(x.ltp || 0) !== Number(y.ltp || 0) ||
      Number(x.change || 0) !== Number(y.change || 0) ||
      Number(x.change_pct || 0) !== Number(y.change_pct || 0)
    ) {
      return false;
    }
  }

  return true;
}

function formatInt(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(num);
}

function formatNum(value, digits = 0) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
  }).format(num);
}

function formatPct(value) {
  const num = Number(value || 0);
  return `${num >= 0 ? "+" : ""}${formatNum(num, 2)}%`;
}

function formatPrice(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(num);
}

function round2(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

function isValidNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    !Number.isNaN(Number(value))
  );
}

function isUsableNumber(value) {
  return value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));
}

function pickFirstUsableNumber(...values) {
  for (const value of values) {
    if (isUsableNumber(value)) return Number(value);
  }
  return null;
}

function getSafeAdvanceDecline(source = {}) {
  if (!source || typeof source !== "object") {
    return {
      advances: 0,
      declines: 0,
      unchanged: 0,
      total: 0,
      ratio: null,
    };
  }

  const directAdvances = pickFirstUsableNumber(
    source?.advances,
    source?.advance,
    source?.sectorAdvances,
    source?.positive,
    source?.gainers
  );

  const directDeclines = pickFirstUsableNumber(
    source?.declines,
    source?.decline,
    source?.sectorDeclines,
    source?.negative,
    source?.losers
  );

  const directUnchanged = pickFirstUsableNumber(
    source?.unchanged,
    source?.sectorUnchanged,
    source?.neutral
  );

  const directTotal = pickFirstUsableNumber(
    source?.total,
    (directAdvances ?? 0) + (directDeclines ?? 0) + (directUnchanged ?? 0)
  );

  if (
    directAdvances !== null ||
    directDeclines !== null ||
    directUnchanged !== null ||
    directTotal !== null
  ) {
    return {
      advances: directAdvances ?? 0,
      declines: directDeclines ?? 0,
      unchanged: directUnchanged ?? 0,
      total: directTotal ?? 0,
      ratio: pickFirstUsableNumber(source?.ratio, source?.adRatio),
    };
  }

  const nested =
    source?.NIFTY ||
    source?.BANKNIFTY ||
    source?.SENSEX ||
    source?.data ||
    source?.breadthStats ||
    null;

  if (nested && typeof nested === "object") {
    return getSafeAdvanceDecline(nested);
  }

  return {
    advances: 0,
    declines: 0,
    unchanged: 0,
    total: 0,
    ratio: null,
  };
}

function hasUsableQuoteBlock(block) {
  if (!block || typeof block !== "object") return false;

  return [
    block.ltp,
    block.lastPrice,
    block.price,
    block.change,
    block.changePct,
    block.change_percent,
    block.netChange,
    block.dp,
    block.ch,
  ].some(isUsableNumber);
}

function mergeQuotePreservingBase(baseNode, incomingNode) {
  const base = baseNode && typeof baseNode === "object" ? baseNode : {};
  const incoming = incomingNode && typeof incomingNode === "object" ? incomingNode : {};

  if (!hasUsableQuoteBlock(incoming)) {
    return { ...base };
  }

  return {
    ...base,
    ...incoming,
    ltp: pickFirstUsableNumber(
      incoming.ltp,
      incoming.lastPrice,
      incoming.price,
      base.ltp,
      base.lastPrice,
      base.price
    ),
    change: pickFirstUsableNumber(
      incoming.change,
      incoming.netChange,
      incoming.ch,
      base.change,
      base.netChange,
      base.ch
    ),
    changePct: pickFirstUsableNumber(
      incoming.changePct,
      incoming.change_percent,
      incoming.dp,
      base.changePct,
      base.change_percent,
      base.dp
    ),
  };
}

function mergeHomeCardPreservingValues(baseCard, liveCard) {
  const base = baseCard && typeof baseCard === "object" ? baseCard : {};
  const live = liveCard && typeof liveCard === "object" ? liveCard : {};

  return {
    ...base,
    ...live,
    spot: mergeQuotePreservingBase(base.spot, live.spot),
    future: mergeQuotePreservingBase(base.future, live.future),
  };
}

function toNumberOrNull(value) {
  return isValidNumber(value) ? Number(value) : null;
}

function displayInt(value) {
  return isValidNumber(value) ? formatInt(value) : "-";
}

function displayNum(value, digits = 2) {
  return isValidNumber(value) ? formatNum(value, digits) : "-";
}

function displayPct(value, digits = 0, withSign = true) {
  if (!isValidNumber(value)) return "-";
  const num = Number(value);
  const formatted = Number(num).toFixed(digits);
  return `${withSign && num >= 0 ? "+" : ""}${formatted}%`;
}

function displayPrice(value) {
  return isValidNumber(value) ? formatPrice(value) : "-";
}
function getSafeVwap(analytics = {}, spot = {}, future = {}, safeDetailData = {}) {
  const directVwap = pickFirstUsableNumber(
    analytics?.vwap,
    analytics?.VWAP,
    analytics?.dayVwap,
    analytics?.day_vwap,
    analytics?.intradayVwap,
    analytics?.intraday_vwap,
    analytics?.sessionVwap,
    analytics?.session_vwap,

    safeDetailData?.analytics?.vwap,
    safeDetailData?.analytics?.VWAP,
    safeDetailData?.analytics?.dayVwap,
    safeDetailData?.analytics?.day_vwap,
    safeDetailData?.analytics?.intradayVwap,
    safeDetailData?.analytics?.intraday_vwap,
    safeDetailData?.analytics?.sessionVwap,
    safeDetailData?.analytics?.session_vwap,

    spot?.vwap,
    spot?.VWAP,
    spot?.avg_price,
    spot?.average_price,

    future?.vwap,
    future?.VWAP,
    future?.avg_price,
    future?.average_price,

    safeDetailData?.spot?.vwap,
    safeDetailData?.spot?.VWAP,
    safeDetailData?.spot?.avg_price,
    safeDetailData?.spot?.average_price,

    safeDetailData?.future?.vwap,
    safeDetailData?.future?.VWAP,
    safeDetailData?.future?.avg_price,
    safeDetailData?.future?.average_price,

    safeDetailData?.vwap,
    safeDetailData?.VWAP
  );

  if (isValidNumber(directVwap) && Number(directVwap) > 0) {
    return Number(directVwap);
  }

  const high = pickFirstUsableNumber(
    spot?.high,
    spot?.dayHigh,
    spot?.h,
    future?.high,
    future?.dayHigh,
    future?.h,
    safeDetailData?.spot?.high,
    safeDetailData?.spot?.dayHigh,
    safeDetailData?.spot?.h,
    safeDetailData?.future?.high,
    safeDetailData?.future?.dayHigh,
    safeDetailData?.future?.h
  );

  const low = pickFirstUsableNumber(
    spot?.low,
    spot?.dayLow,
    spot?.l,
    future?.low,
    future?.dayLow,
    future?.l,
    safeDetailData?.spot?.low,
    safeDetailData?.spot?.dayLow,
    safeDetailData?.spot?.l,
    safeDetailData?.future?.low,
    safeDetailData?.future?.dayLow,
    safeDetailData?.future?.l
  );

  const close = pickFirstUsableNumber(
    spot?.ltp,
    spot?.lastPrice,
    spot?.price,
    future?.ltp,
    future?.lastPrice,
    future?.price,
    safeDetailData?.spot?.ltp,
    safeDetailData?.spot?.lastPrice,
    safeDetailData?.spot?.price,
    safeDetailData?.future?.ltp,
    safeDetailData?.future?.lastPrice,
    safeDetailData?.future?.price
  );

  if (isValidNumber(high) && isValidNumber(low) && isValidNumber(close)) {
    return Math.round((Number(high) + Number(low) + Number(close)) / 3);
  }

  return null;
}


function getVwapDecisionData({
  analytics = {},
  spot = {},
  future = {},
  safeDetailData = {},
  bias = "",
}) {
  const vwap = getSafeVwap(analytics, spot, future, safeDetailData);
  const spotPrice = pickFirstUsableNumber(
    spot?.ltp,
    spot?.lastPrice,
    spot?.price,
    future?.ltp,
    future?.lastPrice,
    future?.price
  );

  if (!isValidNumber(vwap) || !isValidNumber(spotPrice)) {
    return {
      vwap,
      spotPrice,
      diff: null,
      diffPct: null,
      position: "Unavailable",
      positionType: "neutral",
      confirmation: "Unavailable",
      confirmationType: "neutral",
    };
  }

  const diff = Number(spotPrice) - Number(vwap);
  const diffPct = Number(vwap) > 0 ? (diff / Number(vwap)) * 100 : 0;
  const absDiffPct = Math.abs(diffPct);
  const biasText = String(bias || "").toLowerCase();

  let position = "Near VWAP";
  let positionType = "neutral";

  if (absDiffPct <= 0.15) {
    position = "Near VWAP";
    positionType = "neutral";
  } else if (diff > 0) {
    position = "Above VWAP";
    positionType = "support";
  } else {
    position = "Below VWAP";
    positionType = "resistance";
  }

  let confirmation = "No Confirmation";
  let confirmationType = "warning";

  if (biasText.includes("bull") && diff > 0 && absDiffPct > 0.15) {
    confirmation = "Bullish Confirmed";
    confirmationType = "support";
  } else if (biasText.includes("bear") && diff < 0 && absDiffPct > 0.15) {
    confirmation = "Bearish Confirmed";
    confirmationType = "support";
  } else if (biasText.includes("bull") && diff < 0) {
    confirmation = "Bullish Weak";
    confirmationType = "resistance";
  } else if (biasText.includes("bear") && diff > 0) {
    confirmation = "Bearish Weak";
    confirmationType = "resistance";
  } else if (!biasText.includes("bull") && !biasText.includes("bear")) {
    confirmation = "Sideways / Neutral";
    confirmationType = "neutral";
  }

  return {
    vwap: Number(vwap),
    spotPrice: Number(spotPrice),
    diff: Number(diff.toFixed(2)),
    diffPct: Number(diffPct.toFixed(2)),
    position,
    positionType,
    confirmation,
    confirmationType,
  };
}

function classBySign(value, pos = "pos", neg = "neg", zero = "") {
  if (!isValidNumber(value)) return zero;
  const num = Number(value);
  if (num > 0) return pos;
  if (num < 0) return neg;
  return zero;
}

function levelIncludes(list = [], strike) {
  return (list || []).includes(strike);
}

function maxOf(arr, key) {
  return Math.max(...(arr || []).map((x) => Number(x[key] || 0)), 0);
}

function getNearbyStrikeCount() {
  return 10;
}

function getNearestStrikeIndex(rows = [], targetStrike) {
  if (!rows.length) return -1;

  let bestIndex = 0;
  let bestDiff = Infinity;

  rows.forEach((row, index) => {
    const strike = Number(row?.strike || 0);
    const diff = Math.abs(strike - Number(targetStrike || 0));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function isUsableHomeCardPayload(json) {
  if (!json || typeof json !== "object") return false;
  if (json.error) return false;

  return (
    (isValidNumber(json?.spot?.ltp) && Number(json.spot.ltp) > 0) ||
    (isValidNumber(json?.future?.ltp) && Number(json.future.ltp) > 0) ||
    json?.has_data === true
  );
}

function filterNearbyStrikes(rows = [], atmStrike, sideCount = 10) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sorted = [...rows].sort(
    (a, b) => Number(a.strike || 0) - Number(b.strike || 0)
  );
  const atmIndex = getNearestStrikeIndex(sorted, atmStrike);

  if (atmIndex < 0) return sorted;

  const start = Math.max(0, atmIndex - sideCount);
  const end = Math.min(sorted.length, atmIndex + sideCount + 1);

  return sorted.slice(start, end);
}

function getDisplayATMStrike(chain = [], analytics = {}, spot = {}) {
  const analyticsATM = Number(analytics?.straddle?.atm_strike || 0);
  if (analyticsATM > 0) return analyticsATM;

  const spotLtp = Number(spot?.ltp || 0);
  if (!spotLtp || !chain.length) return 0;

  const nearest = [...chain].sort(
    (a, b) =>
      Math.abs(Number(a.strike || 0) - spotLtp) -
      Math.abs(Number(b.strike || 0) - spotLtp)
  )[0];

  return Number(nearest?.strike || 0);
}

function getBiasTone(bias) {
  const text = String(bias || "").toLowerCase();
  if (text.includes("bull")) return "bullish";
  if (text.includes("bear")) return "bearish";
  return "neutral";
}

function hasUsableSpot(payload) {
  return isValidNumber(payload?.spot?.ltp) && Number(payload.spot.ltp) > 0;
}

function hasUsableFuture(payload) {
  return isValidNumber(payload?.future?.ltp) && Number(payload.future.ltp) > 0;
}

function hasUsableVix(payload) {
  return isValidNumber(payload?.vix?.ltp) && Number(payload.vix.ltp) > 0;
}

function hasUsableBreadth(payload) {
  const ad = payload?.advanceDecline;
  if (!ad || typeof ad !== "object") return false;

  if (isValidNumber(ad.total) && Number(ad.total) > 0) return true;

  const total =
    Number(ad?.advances || 0) +
    Number(ad?.declines || 0) +
    Number(ad?.unchanged || 0);

  return total > 0;
}

function hasUsableSectors(payload) {
  return (
    Array.isArray(payload?.sectorStrength) &&
    payload.sectorStrength.some((s) => isValidNumber(s?.change_pct))
  );
}

function hasUsableOptionChain(payload) {
  return (
    Array.isArray(payload?.optionChain) &&
    payload.optionChain.length > 0 &&
    payload.optionChain.some(
      (row) =>
        isValidNumber(row?.strike) &&
        (
          isValidNumber(row?.ce_ltp) ||
          isValidNumber(row?.pe_ltp) ||
          isValidNumber(row?.ce_oi) ||
          isValidNumber(row?.pe_oi) ||
          isValidNumber(row?.ce_volume) ||
          isValidNumber(row?.pe_volume) ||
          isValidNumber(row?.ce_oich) ||
          isValidNumber(row?.pe_oich)
        )
    )
  );
}
function hasUsableAnalytics(payload) {
  const analytics = payload?.analytics;
  if (!analytics || typeof analytics !== "object") return false;

  return (
    hasUsablePcr(analytics) ||
    hasUsableMaxPain(analytics) ||
    hasUsableArray(analytics?.supports) ||
    hasUsableArray(analytics?.resistances) ||
    isValidNumber(analytics?.putWall) ||
    isValidNumber(analytics?.callWall) ||
    isValidNumber(analytics?.straddle?.atm_strike) ||
    hasUsableTradeSignalPanel(analytics?.tradeSignalPanel) ||
    hasUsableArray(analytics?.maxPainCurve) ||
    hasUsableArray(analytics?.liquidityMap)
  );
}

function hasUsableSentiment(analytics) {
  const sentiment = analytics?.sentiment;

  if (!sentiment || typeof sentiment !== "object") return false;

  if (isValidNumber(sentiment?.score)) return true;
  if (isValidNumber(sentiment?.value)) return true;
  if (isValidNumber(sentiment?.sentiment_score)) return true;

  const frameBucket =
    sentiment?.sentimentByFrame && typeof sentiment.sentimentByFrame === "object"
      ? sentiment.sentimentByFrame
      : sentiment?.timeframes && typeof sentiment.timeframes === "object"
        ? sentiment.timeframes
        : sentiment;

  if (!frameBucket || typeof frameBucket !== "object") return false;

  return Object.values(frameBucket).some((item) => {
    if (typeof item === "number") return true;
    if (item && typeof item === "object") {
      return (
        isValidNumber(item?.score) ||
        isValidNumber(item?.value) ||
        isValidNumber(item?.sentiment_score)
      );
    }
    return false;
  });
}

function hasUsablePcr(analytics) {
  return isValidNumber(analytics?.pcr) && Number(analytics.pcr) > 0;
}

function hasUsableMaxPain(analytics) {
  return isValidNumber(analytics?.maxPain) && Number(analytics.maxPain) > 0;
}

function hasUsableArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasUsableFiiDii(value) {
  if (!value || typeof value !== "object") return false;

  return (
    isValidNumber(value?.fii?.net) ||
    isValidNumber(value?.dii?.net) ||
    !!value?.flow?.bias ||
    !!value?.flow?.summary
  );
}

function mergeAnalytics(prev = {}, next = {}, nextPayload = {}) {
  const merged = {
    ...prev,
    ...next,
  };

  merged.pcr = hasUsablePcr(next) ? next.pcr : prev?.pcr ?? next?.pcr ?? null;
  merged.maxPain = hasUsableMaxPain(next)
    ? next.maxPain
    : prev?.maxPain ?? next?.maxPain ?? null;

  merged.maxPainCurve = hasUsableArray(next?.maxPainCurve)
    ? next.maxPainCurve
    : prev?.maxPainCurve ?? [];
  merged.supports = hasUsableArray(next?.supports)
    ? next.supports
    : prev?.supports ?? [];
  merged.resistances = hasUsableArray(next?.resistances)
    ? next.resistances
    : prev?.resistances ?? [];
  merged.putWall =
    isValidNumber(next?.putWall) && Number(next.putWall) > 0
      ? next.putWall
      : prev?.putWall ?? next?.putWall ?? null;
  merged.callWall =
    isValidNumber(next?.callWall) && Number(next.callWall) > 0
      ? next.callWall
      : prev?.callWall ?? next?.callWall ?? null;
  merged.gammaLevels = hasUsableArray(next?.gammaLevels)
    ? next.gammaLevels
    : prev?.gammaLevels ?? [];
  merged.gammaExposure = hasUsableArray(next?.gammaExposure)
    ? next.gammaExposure
    : prev?.gammaExposure ?? [];
  merged.liquidityMap = hasUsableArray(next?.liquidityMap)
    ? next.liquidityMap
    : prev?.liquidityMap ?? [];
  merged.sectorRotation = hasUsableArray(next?.sectorRotation)
    ? next.sectorRotation
    : prev?.sectorRotation ?? [];
  merged.tradeSignals = hasUsableArray(next?.tradeSignals)
    ? next.tradeSignals
    : prev?.tradeSignals ?? [];
  merged.optionsFlowDetector = hasUsableArray(next?.optionsFlowDetector?.events)
    ? next.optionsFlowDetector
    : prev?.optionsFlowDetector ?? next?.optionsFlowDetector ?? {};
  merged.sentiment = hasUsableSentiment(next)
    ? next.sentiment
    : prev?.sentiment ?? next?.sentiment ?? {};
  merged.breadthStats =
    hasUsableBreadth({ advanceDecline: nextPayload?.breadthStats }) ||
      hasUsableBreadth(nextPayload)
      ? nextPayload?.breadthStats ??
      prev?.breadthStats ??
      next?.breadthStats ??
      {}
      : prev?.breadthStats ?? next?.breadthStats ?? {};
  merged.straddle =
    isValidNumber(next?.straddle?.atm_strike) ||
      isValidNumber(next?.straddle?.straddle)
      ? next.straddle
      : prev?.straddle ?? next?.straddle ?? {};
  merged.strongestBuildup =
    isValidNumber(next?.strongestBuildup?.strike) ||
      isValidNumber(next?.strongestBuildup?.value)
      ? next.strongestBuildup
      : prev?.strongestBuildup ?? next?.strongestBuildup ?? {};
  merged.oiMomentum =
    isValidNumber(next?.oiMomentum?.net) || next?.oiMomentum?.label
      ? next.oiMomentum
      : prev?.oiMomentum ?? next?.oiMomentum ?? {};
  merged.callPutDominance =
    isValidNumber(next?.callPutDominance?.callOI) ||
      isValidNumber(next?.callPutDominance?.putOI)
      ? next.callPutDominance
      : prev?.callPutDominance ?? next?.callPutDominance ?? {};
  merged.smartOIFlow =
    isValidNumber(next?.smartOIFlow?.bullishPct) ||
      isValidNumber(next?.smartOIFlow?.bearishPct)
      ? next.smartOIFlow
      : prev?.smartOIFlow ?? next?.smartOIFlow ?? {};
  merged.marketRegime =
    next?.marketRegime?.label || isValidNumber(next?.marketRegime?.confidence)
      ? next.marketRegime
      : prev?.marketRegime ?? next?.marketRegime ?? {};
  merged.breakoutBreakdown =
    next?.breakoutBreakdown?.signal ||
      isValidNumber(next?.breakoutBreakdown?.breakoutLevel)
      ? next.breakoutBreakdown
      : prev?.breakoutBreakdown ?? next?.breakoutBreakdown ?? {};
  merged.intradayRangeProjection =
    isValidNumber(next?.intradayRangeProjection?.projectedMove)
      ? next.intradayRangeProjection
      : prev?.intradayRangeProjection ?? next?.intradayRangeProjection ?? {};
  merged.biasBreakdown =
    next?.biasBreakdown?.marketRegime || next?.biasBreakdown?.structure
      ? next.biasBreakdown
      : prev?.biasBreakdown ?? next?.biasBreakdown ?? {};
  merged.biasScores =
    isValidNumber(next?.biasScores?.bullish) ||
      isValidNumber(next?.biasScores?.bearish)
      ? next.biasScores
      : prev?.biasScores ?? next?.biasScores ?? {};

  merged.fiiDii = hasUsableFiiDii(next?.fiiDii)
    ? next.fiiDii
    : hasUsableFiiDii(nextPayload?.fiiDii)
      ? nextPayload.fiiDii
      : prev?.fiiDii ?? next?.fiiDii ?? nextPayload?.fiiDii ?? {};

  merged.tradeSignalPanel = hasUsableTradeSignalPanel(next?.tradeSignalPanel)
    ? {
      ...(prev?.tradeSignalPanel || {}),
      ...(next?.tradeSignalPanel || {}),
    }
    : prev?.tradeSignalPanel ?? next?.tradeSignalPanel ?? {};

  merged.gexSummary =
    isValidNumber(next?.gexSummary?.maxPositiveStrike) ||
      isValidNumber(next?.gexSummary?.maxNegativeStrike)
      ? next.gexSummary
      : prev?.gexSummary ?? next?.gexSummary ?? {};
  merged.previousDayLevels =
    next?.previousDayLevels && typeof next.previousDayLevels === "object"
      ? {
        ...(prev?.previousDayLevels || {}),
        ...(next?.previousDayLevels || {}),
      }
      : prev?.previousDayLevels ?? next?.previousDayLevels ?? {};

  merged.previousDayOpen = isValidNumber(next?.previousDayOpen)
    ? next.previousDayOpen
    : isValidNumber(next?.previousDayLevels?.open)
      ? next.previousDayLevels.open
      : prev?.previousDayOpen ??
      prev?.previousDayLevels?.open ??
      next?.previousDayOpen ??
      next?.previousDayLevels?.open ??
      null;

  merged.previousDayHigh = isValidNumber(next?.previousDayHigh)
    ? next.previousDayHigh
    : isValidNumber(next?.previousDayLevels?.high)
      ? next.previousDayLevels.high
      : prev?.previousDayHigh ??
      prev?.previousDayLevels?.high ??
      next?.previousDayHigh ??
      next?.previousDayLevels?.high ??
      null;

  merged.previousDayLow = isValidNumber(next?.previousDayLow)
    ? next.previousDayLow
    : isValidNumber(next?.previousDayLevels?.low)
      ? next.previousDayLevels.low
      : prev?.previousDayLow ??
      prev?.previousDayLevels?.low ??
      next?.previousDayLow ??
      next?.previousDayLevels?.low ??
      null;

  merged.previousDayClose = isValidNumber(next?.previousDayClose)
    ? next.previousDayClose
    : isValidNumber(next?.previousDayLevels?.close)
      ? next.previousDayLevels.close
      : prev?.previousDayClose ??
      prev?.previousDayLevels?.close ??
      next?.previousDayClose ??
      next?.previousDayLevels?.close ??
      null;

  merged.previousDayPivot = isValidNumber(next?.previousDayPivot)
    ? next.previousDayPivot
    : isValidNumber(next?.previousDayLevels?.pivot)
      ? next.previousDayLevels.pivot
      : prev?.previousDayPivot ??
      prev?.previousDayLevels?.pivot ??
      next?.previousDayPivot ??
      next?.previousDayLevels?.pivot ??
      null;

  merged.previousDayCprTop = isValidNumber(next?.previousDayCprTop)
    ? next.previousDayCprTop
    : isValidNumber(next?.previousDayLevels?.cprTop)
      ? next.previousDayLevels.cprTop
      : prev?.previousDayCprTop ??
      prev?.previousDayLevels?.cprTop ??
      next?.previousDayCprTop ??
      next?.previousDayLevels?.cprTop ??
      null;

  merged.previousDayCprBottom = isValidNumber(next?.previousDayCprBottom)
    ? next.previousDayCprBottom
    : isValidNumber(next?.previousDayLevels?.cprBottom)
      ? next.previousDayLevels.cprBottom
      : prev?.previousDayCprBottom ??
      prev?.previousDayLevels?.cprBottom ??
      next?.previousDayCprBottom ??
      next?.previousDayLevels?.cprBottom ??
      null;

  merged.previousDayR1 = isValidNumber(next?.previousDayR1)
    ? next.previousDayR1
    : isValidNumber(next?.previousDayLevels?.r1)
      ? next.previousDayLevels.r1
      : prev?.previousDayR1 ??
      prev?.previousDayLevels?.r1 ??
      next?.previousDayR1 ??
      next?.previousDayLevels?.r1 ??
      null;

  merged.previousDayS1 = isValidNumber(next?.previousDayS1)
    ? next.previousDayS1
    : isValidNumber(next?.previousDayLevels?.s1)
      ? next.previousDayLevels.s1
      : prev?.previousDayS1 ??
      prev?.previousDayLevels?.s1 ??
      next?.previousDayS1 ??
      next?.previousDayLevels?.s1 ??
      null;

  merged.previousDayR2 = isValidNumber(next?.previousDayR2)
    ? next.previousDayR2
    : isValidNumber(next?.previousDayLevels?.r2)
      ? next.previousDayLevels.r2
      : prev?.previousDayR2 ??
      prev?.previousDayLevels?.r2 ??
      next?.previousDayR2 ??
      next?.previousDayLevels?.r2 ??
      null;

  merged.previousDayS2 = isValidNumber(next?.previousDayS2)
    ? next.previousDayS2
    : isValidNumber(next?.previousDayLevels?.s2)
      ? next.previousDayLevels.s2
      : prev?.previousDayS2 ??
      prev?.previousDayLevels?.s2 ??
      next?.previousDayS2 ??
      next?.previousDayLevels?.s2 ??
      null;

  merged.previousDayTodayPosition =
    next?.previousDayTodayPosition ||
    next?.previousDayLevels?.todayPosition ||
    prev?.previousDayTodayPosition ||
    prev?.previousDayLevels?.todayPosition ||
    null;

  merged.previousDayTurningSignal =
    next?.previousDayTurningSignal ||
    next?.previousDayLevels?.turningSignal ||
    prev?.previousDayTurningSignal ||
    prev?.previousDayLevels?.turningSignal ||
    null;

  return merged;
}

function hasUsableMarketStrip(strip = []) {
  return (
    Array.isArray(strip) &&
    strip.some(
      (item) =>
        item &&
        (isValidNumber(item?.ltp) ||
          isValidNumber(item?.change) ||
          isValidNumber(item?.change_pct))
    )
  );
}

function mergeMarketStrip(prevStrip = [], nextStrip = []) {
  const prevMap = new Map((prevStrip || []).map((item) => [item?.label, item]));
  const nextMap = new Map((nextStrip || []).map((item) => [item?.label, item]));

  const labels = Array.from(
    new Set([
      ...(prevStrip || []).map((item) => item?.label),
      ...(nextStrip || []).map((item) => item?.label),
    ])
  );

  return labels.map((label) => {
    const prevItem = prevMap.get(label) || {};
    const nextItem = nextMap.get(label) || {};

    const nextHasData =
      isValidNumber(nextItem?.ltp) ||
      isValidNumber(nextItem?.change) ||
      isValidNumber(nextItem?.change_pct);

    if (nextHasData) {
      return {
        ...prevItem,
        ...nextItem,
      };
    }

    return prevItem?.label ? prevItem : nextItem;
  });
}

function mergeDashboardData(prev, next) {
  if (!prev) return next;

  return {
    ...prev,
    ...next,
    symbol: next?.symbol || prev?.symbol,
    label: next?.label || prev?.label,
    timestamp: next?.timestamp || prev?.timestamp,

    spot: hasUsableSpot(next) ? next.spot : prev.spot,
    future: hasUsableFuture(next) ? next.future : prev.future,
    vix: hasUsableVix(next) ? next.vix : prev.vix,

    advanceDecline: hasUsableBreadth(next)
      ? next.advanceDecline
      : prev.advanceDecline,

    sectorStrength: hasUsableSectors(next)
      ? next.sectorStrength
      : prev.sectorStrength,

    marketStrip: hasUsableMarketStrip(next?.marketStrip)
      ? mergeMarketStrip(prev?.marketStrip || [], next?.marketStrip || [])
      : prev?.marketStrip || [],

    optionChain: hasUsableOptionChain(next)
      ? next.optionChain
      : prev.optionChain,

    oiHeatmap:
      Array.isArray(next?.oiHeatmap) && next.oiHeatmap.length
        ? next.oiHeatmap
        : prev.oiHeatmap,

    oiChart:
      Array.isArray(next?.oiChart) && next.oiChart.length
        ? next.oiChart
        : prev.oiChart,

    analytics: hasUsableAnalytics(next)
      ? mergeAnalytics(prev?.analytics || {}, next?.analytics || {}, next)
      : prev.analytics,
  };
}

function selectBestOptionStrikes(rows = [], spotPrice = 0, bias = "Neutral") {
  const biasText = String(bias || "").toLowerCase();
  const normalizedBias = biasText.includes("bull")
    ? "Bullish"
    : biasText.includes("bear")
      ? "Bearish"
      : "Neutral";

  if (
    !rows.length ||
    !spotPrice ||
    !["Bullish", "Bearish"].includes(normalizedBias)
  ) {
    return {
      bestStrike: null,
      saferStrike: null,
      aggressiveStrike: null,
      candidates: [],
    };
  }

  const sortedRows = [...rows].sort(
    (a, b) => Number(a.strike || 0) - Number(b.strike || 0)
  );

  let step = 100;
  if (sortedRows.length >= 2) {
    const diffs = [];
    for (let i = 0; i < sortedRows.length - 1; i++) {
      const d = Math.abs(
        Number(sortedRows[i + 1].strike || 0) -
        Number(sortedRows[i].strike || 0)
      );
      if (d > 0) diffs.push(d);
    }
    if (diffs.length) step = Math.min(...diffs);
  }

  function scoreRow(row, side) {
    const strike = Number(row.strike || 0);
    const distance = Math.abs(strike - spotPrice);

    const ltp = Number(side === "CE" ? row.ce_ltp || 0 : row.pe_ltp || 0);
    const oi = Number(side === "CE" ? row.ce_oi || 0 : row.pe_oi || 0);
    const oich = Number(side === "CE" ? row.ce_oich || 0 : row.pe_oich || 0);
    const vol = Number(side === "CE" ? row.ce_volume || 0 : row.pe_volume || 0);
    const ivRaw =
      side === "CE"
        ? row.ce_iv ??
        row.ceIv ??
        row.ceIV ??
        row.ce_iv_percent ??
        row.ceGreeks?.iv ??
        row.ce?.iv ??
        row.iv
        : row.pe_iv ??
        row.peIv ??
        row.peIV ??
        row.pe_iv_percent ??
        row.peGreeks?.iv ??
        row.pe?.iv ??
        row.iv;

    const iv = isValidNumber(ivRaw) ? Number(ivRaw) : 0;
    if (ltp <= 0 || vol <= 0) return null;

    let score = 0;

    if (distance === 0) score += 30;
    else if (distance <= step) score += 22;
    else if (distance <= step * 2) score += 12;
    else score += 4;

    if (oich > 0) score += Math.min(oich / 5000, 20);
    else score -= Math.min(Math.abs(oich) / 5000, 10);

    score += Math.min(vol / 200000, 20);
    score += Math.min(oi / 100000, 15);

    if (ltp >= 80 && ltp <= 300) score += 15;
    else if (ltp > 300 && ltp <= 900) score += 10;
    else if (ltp < 40) score -= 10;

    if (iv > 0) {
      if (iv <= 18) score += 10;
      else if (iv <= 24) score += 6;
      else if (iv <= 32) score += 2;
      else score -= 8;
    }

    return {
      strike,
      side,
      ltp,
      oi,
      oiChange: oich,
      volume: vol,
      iv,
      distance,
      score: Number(score.toFixed(2)),
    };
  }

  const side = normalizedBias === "Bullish" ? "CE" : "PE";
  const scored = sortedRows
    .map((row) => scoreRow(row, side))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return {
      bestStrike: null,
      saferStrike: null,
      aggressiveStrike: null,
      candidates: [],
    };
  }

  const bestStrike = scored[0];

  let saferStrike = null;
  let aggressiveStrike = null;

  if (normalizedBias === "Bullish") {
    const itm = scored
      .filter((x) => x.strike <= spotPrice)
      .sort(
        (a, b) =>
          Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)
      );

    const otm = scored
      .filter((x) => x.strike >= spotPrice)
      .sort(
        (a, b) =>
          Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)
      );

    saferStrike = itm[0] || null;
    aggressiveStrike = otm[0] || null;
  } else {
    const itm = scored
      .filter((x) => x.strike >= spotPrice)
      .sort(
        (a, b) =>
          Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)
      );

    const otm = scored
      .filter((x) => x.strike <= spotPrice)
      .sort(
        (a, b) =>
          Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice)
      );

    saferStrike = itm[0] || null;
    aggressiveStrike = otm[0] || null;
  }

  return {
    bestStrike,
    saferStrike,
    aggressiveStrike,
    candidates: scored.slice(0, 6),
  };
}

/* =========================================================
   New Trade Quality Helpers
========================================================= */

function getIVSuitability(iv = 0) {
  const val = Number(iv || 0);

  if (!val) return { label: "N/A", tone: "neutral", score: 40 };
  if (val <= 18) return { label: "Low", tone: "support", score: 88 };
  if (val <= 26) return { label: "Moderate", tone: "neutral", score: 74 };
  if (val <= 36) return { label: "High", tone: "warning", score: 52 };
  return { label: "Extreme", tone: "resistance", score: 20 };
}

function getPremiumSuitability(premium = 0) {
  const p = Number(premium || 0);

  if (!p) return { label: "N/A", tone: "neutral", score: 35 };
  if (p >= 80 && p <= 250)
    return { label: "Ideal", tone: "support", score: 90 };
  if ((p >= 40 && p < 80) || (p > 250 && p <= 400)) {
    return { label: "Usable", tone: "neutral", score: 72 };
  }
  if ((p >= 20 && p < 40) || (p > 400 && p <= 700)) {
    return { label: "Risky", tone: "warning", score: 48 };
  }
  return { label: "Avoid", tone: "resistance", score: 18 };
}

function getStepFromChain(rows = []) {
  const strikes = [...(rows || [])]
    .map((x) => Number(x?.strike || 0))
    .filter((x) => x > 0)
    .sort((a, b) => a - b);

  if (strikes.length < 2) return 100;

  let minDiff = Infinity;
  for (let i = 1; i < strikes.length; i++) {
    const diff = strikes[i] - strikes[i - 1];
    if (diff > 0 && diff < minDiff) minDiff = diff;
  }

  return Number.isFinite(minDiff) ? minDiff : 100;
}

function getStrikeDistanceScore(selectedStrike = 0, spotPrice = 0, step = 100) {
  const strike = Number(selectedStrike || 0);
  const spot = Number(spotPrice || 0);
  if (!strike || !spot) return 35;

  const dist = Math.abs(strike - spot);

  if (dist === 0) return 86;
  if (dist <= step) return 78;
  if (dist <= step * 2) return 62;
  if (dist <= step * 3) return 44;
  return 28;
}

function getLiquidityScore(option = {}) {
  const oi = Number(option?.oi || 0);
  const vol = Number(option?.volume || 0);
  const oiChg = Number(option?.oiChange || 0);

  let score = 0;

  if (vol >= 200000) score += 40;
  else if (vol >= 100000) score += 32;
  else if (vol >= 50000) score += 24;
  else if (vol >= 10000) score += 16;
  else if (vol >= 2000) score += 10;
  else score += 4;

  if (oi >= 500000) score += 35;
  else if (oi >= 200000) score += 28;
  else if (oi >= 100000) score += 20;
  else if (oi >= 50000) score += 14;
  else score += 6;

  if (oiChg > 0) score += 18;
  else if (oiChg === 0) score += 10;
  else score += 4;

  return Math.min(score, 100);
}

function getRRScore(rr = 0) {
  const val = Number(rr || 0);

  if (!val) return 20;
  if (val >= 3) return 95;
  if (val >= 2.2) return 84;
  if (val >= 1.8) return 72;
  if (val >= 1.5) return 60;
  if (val >= 1.2) return 46;
  return 22;
}


function mapToneToMiniPillType(tone) {
  if (tone === "support") return "support";
  if (tone === "resistance") return "resistance";
  if (tone === "warning") return "warning";
  return "neutral";
}

function mapToneToCriticalPill(tone) {
  if (tone === "support") return "bullish";
  if (tone === "resistance") return "bearish";
  if (tone === "warning") return "warning";
  return "neutral";
}

function getDeltaPillType(value) {
  if (!isValidNumber(value)) return "neutral";
  const num = Number(value);

  if (num >= 0.45) return "support";
  if (num <= -0.45) return "resistance";
  return "neutral";
}

function getThetaPillType(value) {
  if (!isValidNumber(value)) return "neutral";
  const num = Number(value);

  if (num <= -120) return "resistance";
  if (num <= -60) return "warning";
  return "neutral";
}

function getVegaPillType(value) {
  if (!isValidNumber(value)) return "neutral";
  const num = Number(value);

  if (num >= 8) return "warning";
  if (num >= 4) return "neutral";
  return "support";
}

function getGreeksInterpretation(importantGreeks) {
  const atmCeDelta = Number(importantGreeks?.atm?.ce?.delta || 0);
  const atmPeDelta = Number(importantGreeks?.atm?.pe?.delta || 0);
  const atmCeTheta = Number(importantGreeks?.atm?.ce?.theta || 0);
  const atmPeTheta = Number(importantGreeks?.atm?.pe?.theta || 0);

  const atmVega = isValidNumber(importantGreeks?.atm?.ce?.vega)
    ? Number(importantGreeks?.atm?.ce?.vega || 0)
    : Number(importantGreeks?.atm?.pe?.vega || 0);

  let directionLabel = "Moderate";
  let directionType = "neutral";

  if (Math.abs(atmCeDelta) >= 0.5 || Math.abs(atmPeDelta) >= 0.5) {
    directionLabel = "Strong";
    directionType = "support";
  } else if (Math.abs(atmCeDelta) >= 0.35 || Math.abs(atmPeDelta) >= 0.35) {
    directionLabel = "Moderate";
    directionType = "warning";
  }

  const thetaRef = Math.min(atmCeTheta, atmPeTheta);
  let thetaLabel = "Low";
  let thetaType = "support";

  if (thetaRef <= -120) {
    thetaLabel = "High";
    thetaType = "resistance";
  } else if (thetaRef <= -60) {
    thetaLabel = "Medium";
    thetaType = "warning";
  }

  let vegaLabel = "Low";
  let vegaType = "support";

  if (atmVega >= 8) {
    vegaLabel = "High";
    vegaType = "warning";
  } else if (atmVega >= 4) {
    vegaLabel = "Moderate";
    vegaType = "neutral";
  }

  return {
    directionLabel,
    directionType,
    thetaLabel,
    thetaType,
    vegaLabel,
    vegaType,
  };
}

function evaluateSelectedOption({
  option,
  tradeSignalPanel,
  spotPrice,
  chainRows,
  wallSupportConfirmation,
  entryTiming,
}) {
  if (!option) {
    return {
      premium: 0,
      iv: 0,
      liquidityScore: 0,
      buyQualityScore: 0,
      finalTradeQuality: 0,
      rr: 0,
      expectedReward: 0,
      expectedRisk: 0,
      ivSuitability: { label: "N/A", tone: "neutral", score: 0 },
      premiumSuitability: { label: "N/A", tone: "neutral", score: 0 },
      decision: "No Trade",
      decisionTone: "bearish",
      noTrade: true,
      noTradeReason: "No valid strike found.",
      noTradeReasons: ["No valid strike found."],
    };
  }

  const premium = Number(option?.ltp || 0);
  const iv = Number(option?.iv || 0);
  const confidence = Number(tradeSignalPanel?.confidence || 0);
  const step = getStepFromChain(chainRows);
  const distanceScore = getStrikeDistanceScore(
    Number(option?.strike || 0),
    Number(spotPrice || 0),
    step
  );

  const ivSuitability = getIVSuitability(iv);
  const premiumSuitability = getPremiumSuitability(premium);
  const liquidityScore = getLiquidityScore(option);

  const buyQualityScore = Number(
    (
      premiumSuitability.score * 0.3 +
      ivSuitability.score * 0.2 +
      liquidityScore * 0.3 +
      distanceScore * 0.2
    ).toFixed(2)
  );

  const rewardPct =
    0.16 +
    Math.max((buyQualityScore - 50) / 200, 0) +
    (Number(option?.oiChange || 0) > 0 ? 0.06 : 0.02);

  const riskPct =
    0.12 +
    Math.max((Number(iv || 0) - 20) / 250, 0) +
    (premiumSuitability.label === "Risky" ? 0.04 : 0) +
    (premiumSuitability.label === "Avoid" ? 0.08 : 0);

  const expectedReward = Number((premium * rewardPct).toFixed(2));
  const expectedRisk = Number((premium * riskPct).toFixed(2));
  const rr =
    expectedRisk > 0 ? Number((expectedReward / expectedRisk).toFixed(2)) : 0;
  const rrScore = getRRScore(rr);

  const finalTradeQuality = Number(
    (
      buyQualityScore * 0.45 +
      rrScore * 0.25 +
      confidence * 0.2 +
      Math.min(Math.max(Number(option?.score || 0), 0), 100) * 0.1
    ).toFixed(2)
  );

  const reasons = [];

  if (
    ivSuitability.label === "Extreme" ||
    ivSuitability.label === "High" ||
    iv >= 34
  ) {
    reasons.push("IV too expensive");
  }

  if (
    String(wallSupportConfirmation?.label || "").toLowerCase().includes("weak")
  ) {
    reasons.push("Weak wall confirmation");
  }

  if (rr < 1.2) {
    reasons.push("R:R below threshold");
  }

  if (
    premiumSuitability.label === "Avoid" ||
    premiumSuitability.label === "Risky"
  ) {
    reasons.push("Premium not favorable");
  }

  if (
    !entryTiming?.label ||
    String(entryTiming.label).toLowerCase().includes("late") ||
    String(entryTiming.label).toLowerCase().includes("avoid")
  ) {
    reasons.push("Entry not confirmed");
  }

  let noTrade = false;

  if (
    premiumSuitability.label === "Avoid" ||
    ivSuitability.label === "Extreme" ||
    liquidityScore < 35 ||
    rr < 1.2 ||
    finalTradeQuality < 55 ||
    reasons.length > 0
  ) {
    noTrade = true;
  }

  const noTradeReason =
    reasons.length > 0
      ? reasons.join(" • ")
      : noTrade
        ? "Conditions not met."
        : "";

  return {
    premium,
    iv,
    liquidityScore,
    buyQualityScore,
    finalTradeQuality,
    rr,
    expectedReward,
    expectedRisk,
    ivSuitability,
    premiumSuitability,
    decision: noTrade ? "No Trade" : "Trade Allowed",
    decisionTone: noTrade ? "bearish" : "bullish",
    noTrade,
    noTradeReason,
    noTradeReasons: reasons,
  };
}
/* =========================================================
   Validation Helpers
========================================================= */

function isValidDashboardPayload(json) {
  if (!json || typeof json !== "object") return false;
  if (json.error) return false;

  return (
    !!json?.symbol ||
    hasUsableSpot(json) ||
    hasUsableFuture(json) ||
    hasUsableAnalytics(json) ||
    hasUsableOptionChain(json) ||
    hasUsableSectors(json) ||
    hasUsableBreadth(json)
  );
}
function hasAnyValidHomeDashboard(homeObj) {
  return ["NIFTY", "BANKNIFTY", "SENSEX"].some((key) =>
    isValidDashboardPayload(homeObj?.[key])
  );
}

/* =========================================================
   Small Components
========================================================= */

function HeaderStat({ label, value, subValue, valueClass = "" }) {
  return (
    <div className="header-stat">
      <div className="header-stat-label">{label}</div>
      <div className={`header-stat-value ${valueClass}`}>{value}</div>
      {subValue ? <div className="header-stat-sub">{subValue}</div> : null}
    </div>
  );
}

function KPICard({ title, value, sub }) {
  return (
    <div className="kpi-card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

function BiasBadge({ bias }) {
  const text = String(bias || "Neutral").toLowerCase();

  const cls = text.includes("bull")
    ? "badge bullish"
    : text.includes("bear")
      ? "badge bearish"
      : "badge neutral";

  return <span className={cls}>{bias}</span>;
}

function BarMeter({ value, max, label, type }) {
  const safeValue = Number(value || 0);
  const safeMax = Math.max(Number(max || 0), 1);
  const width = `${Math.min((Math.abs(safeValue) / safeMax) * 100, 100)}%`;

  return (
    <div className="bar-meter-row">
      <div className="bar-meter-label">{label}</div>
      <div className="bar-meter-track">
        <div className={`bar-meter-fill ${type}`} style={{ width }} />
      </div>
      <div className={`bar-meter-value ${classBySign(safeValue, "up", "down")}`}>
        {formatInt(safeValue)}
      </div>
    </div>
  );
}

function MiniLevelPill({ label, value, type = "neutral" }) {
  return (
    <div className={`mini-level-pill ${type}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CriticalLevelPill({ label, value, tone = "neutral" }) {
  return (
    <div className={`critical-level-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AnalyticsCard({ title, value, sub, tone = "neutral" }) {
  return (
    <div className={`analytics-card ${tone}`}>
      <div className="analytics-card-title">{title}</div>
      <div className="analytics-card-value">{value}</div>
      {sub ? <div className="analytics-card-sub">{sub}</div> : null}
    </div>
  );
}

function getStripItemByCardName(strip = [], cardName = "") {
  const name = String(cardName || "").toUpperCase();

  const labelMap = {
    NIFTY: "NIFTY 50",
    BANKNIFTY: "NIFTY BANK",
    SENSEX: "SENSEX",
  };

  const expectedLabel = labelMap[name] || name;

  return (strip || []).find(
    (item) => String(item?.label || "").toUpperCase() === expectedLabel.toUpperCase()
  ) || null;
}

function HomeCompactIndexCard({ name, data, stripItem, onOpen }) {
  const analytics = data?.analytics || {};
  if ((data?.label || name) === "SENSEX") {
    console.log("SENSEX CARD DATA", data);
    console.log("SENSEX CARD ANALYTICS", analytics);
    console.log("SENSEX PCR", analytics?.pcr, data?.pcr);
    console.log("SENSEX MAX PAIN", analytics?.maxPain, data?.maxPain);
  }
  const ad = data?.advanceDecline || {};

  const liveLtp = pickFirstUsableNumber(
    stripItem?.ltp,
    stripItem?.lastPrice,
    stripItem?.price,
    data?.spot?.ltp,
    data?.future?.ltp
  );

  const liveChange = pickFirstUsableNumber(
    stripItem?.change,
    stripItem?.netChange,
    stripItem?.ch,
    data?.spot?.change,
    data?.future?.change
  );

  const liveChangePct = pickFirstUsableNumber(
    stripItem?.change_pct,
    stripItem?.changePct,
    stripItem?.change_percent,
    stripItem?.dp,
    data?.spot?.changePct,
    data?.spot?.change_pct,
    data?.future?.changePct,
    data?.future?.change_pct
  );

  const tone = classBySign(liveChange, "up", "down");
  const pcrValue = pickFirstUsableNumber(analytics?.pcr, data?.pcr);
  const maxPainValue = pickFirstUsableNumber(analytics?.maxPain, data?.maxPain);

  const advances = toNumberOrNull(ad?.advances ?? ad?.sectorAdvances);
  const declines = toNumberOrNull(ad?.declines ?? ad?.sectorDeclines);
  const unchanged = toNumberOrNull(ad?.unchanged ?? ad?.sectorUnchanged);

  const total =
    toNumberOrNull(ad?.total) ??
    (
      Number(advances ?? 0) +
      Number(declines ?? 0) +
      Number(unchanged ?? 0)
    );

  const advDecTotal = Number(advances ?? 0) + Number(declines ?? 0);

  const advPct =
    advDecTotal > 0 && advances !== null
      ? Math.round((Number(advances) / advDecTotal) * 100)
      : null;

  const badgeBias = isValidNumber(liveChange)
    ? Number(liveChange) > 0
      ? "Bullish"
      : Number(liveChange) < 0
        ? "Bearish"
        : "Neutral"
    : analytics?.sentiment?.bias || data?.quickBias || "Neutral";

  const marketStateText =
    String(badgeBias || "").toLowerCase() === "neutral"
      ? "Sideways"
      : badgeBias || "Sideways";
  const openValue = pickFirstUsableNumber(
    stripItem?.open,
    stripItem?.dayOpen,
    stripItem?.o,
    data?.spot?.open,
    data?.spot?.dayOpen,
    data?.spot?.o
  );

  const highValue = pickFirstUsableNumber(
    stripItem?.high,
    stripItem?.dayHigh,
    stripItem?.h,
    data?.spot?.high,
    data?.spot?.dayHigh,
    data?.spot?.h
  );

  const lowValue = pickFirstUsableNumber(
    stripItem?.low,
    stripItem?.dayLow,
    stripItem?.l,
    data?.spot?.low,
    data?.spot?.dayLow,
    data?.spot?.l
  );

  const prevOpenValue = pickFirstUsableNumber(
    analytics?.previousDayLevels?.open,
    analytics?.previousDayLevels?.pdOpen,
    analytics?.previousDayLevels?.prevOpen,
    analytics?.previousDayOpen,
    analytics?.prevOpen,
    analytics?.pdOpen,
    data?.analytics?.previousDayLevels?.open,
    data?.analytics?.previousDayLevels?.pdOpen,
    data?.analytics?.previousDayLevels?.prevOpen,
    data?.analytics?.previousDayOpen,
    data?.analytics?.prevOpen,
    data?.analytics?.pdOpen
  );

  const prevHighValue = pickFirstUsableNumber(
    analytics?.previousDayLevels?.high,
    analytics?.previousDayLevels?.pdHigh,
    analytics?.previousDayLevels?.prevHigh,
    analytics?.previousDayHigh,
    analytics?.prevHigh,
    analytics?.pdHigh,
    data?.analytics?.previousDayLevels?.high,
    data?.analytics?.previousDayLevels?.pdHigh,
    data?.analytics?.previousDayLevels?.prevHigh,
    data?.analytics?.previousDayHigh,
    data?.analytics?.prevHigh,
    data?.analytics?.pdHigh
  );

  const prevLowValue = pickFirstUsableNumber(
    analytics?.previousDayLevels?.low,
    analytics?.previousDayLevels?.pdLow,
    analytics?.previousDayLevels?.prevLow,
    analytics?.previousDayLow,
    analytics?.prevLow,
    analytics?.pdLow,
    data?.analytics?.previousDayLevels?.low,
    data?.analytics?.previousDayLevels?.pdLow,
    data?.analytics?.previousDayLevels?.prevLow,
    data?.analytics?.previousDayLow,
    data?.analytics?.prevLow,
    data?.analytics?.pdLow
  );

  const prevCloseValue = pickFirstUsableNumber(
    analytics?.previousDayLevels?.close,
    analytics?.previousDayLevels?.pdClose,
    analytics?.previousDayLevels?.prevClose,
    analytics?.previousDayClose,
    analytics?.prevClose,
    analytics?.pdClose,
    data?.analytics?.previousDayLevels?.close,
    data?.analytics?.previousDayLevels?.pdClose,
    data?.analytics?.previousDayLevels?.prevClose,
    data?.analytics?.previousDayClose,
    data?.analytics?.prevClose,
    data?.analytics?.pdClose
  );
  return (
    <div className="home-compact-card old-style-card">
      <div className="home-compact-top old-style-top">
        <div className="home-compact-head-left">
          <div className="home-compact-title">{data?.label || name}</div>

          <div className="home-compact-ohl-row">
            <span className="home-compact-ohl-item">
              <small>O</small> {displayInt(openValue)}
            </span>
            <span className="home-compact-ohl-item">
              <small>H</small> {displayInt(highValue)}
            </span>
            <span className="home-compact-ohl-item">
              <small>L</small> {displayInt(lowValue)}
            </span>
          </div>
        </div>

        <div className="home-compact-head-mid home-compact-head-mid-plain">
          {isValidNumber(prevHighValue) || isValidNumber(prevLowValue) ? (
            <div className="home-prevday-inline-plain">
              <span className="home-prevday-text pdh">
                <small>PDH</small> {displayPrice(prevHighValue)}
              </span>
              <span className="home-prevday-text pdl">
                <small>PDL</small> {displayPrice(prevLowValue)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="home-compact-head-right old-style-price-block">
          <BiasBadge bias={badgeBias} />

          <div className="home-compact-price-wrap">
            <div className={`home-compact-price ${tone}`}>
              {isUsableNumber(liveLtp) ? formatPrice(liveLtp) : "-"}
            </div>

            <div className={`home-compact-change ${tone}`}>
              {isUsableNumber(liveChange)
                ? `${formatNum(liveChange)}${isUsableNumber(liveChangePct)
                  ? ` (${displayPct(liveChangePct)})`
                  : ""
                }`
                : "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="home-compact-stats old-style-stats">
        <div className="home-compact-stat">
          <span>PCR</span>
          <strong>{isValidNumber(pcrValue) ? displayNum(pcrValue) : "-"}</strong>
        </div>

        <div className="home-compact-stat">
          <span>Advance / Decline</span>
          <strong>
            {advances !== null && declines !== null
              ? `${displayInt(advances)} | ${displayInt(declines)}${advPct !== null ? ` (${advPct}%)` : ""
              }`
              : "-"}
          </strong>
        </div>

        <div className="home-compact-stat">
          <span>Max Pain</span>
          <strong>
            {isValidNumber(maxPainValue) ? formatPrice(maxPainValue) : "-"}
          </strong>
        </div>
      </div>

      <div className="home-compact-btn-row">
        <button

          className="home-compact-btn old-style-btn"
          onClick={() => onOpen("action")}
        >
          Quick View
        </button>

        <button
          className="home-compact-btn old-style-btn"
          onClick={() => onOpen("terminal")}
        >
          Open Terminal
        </button>
      </div>
    </div>
  );
}
function MarketStripItem({ label, value, change, changePct, type = "price" }) {
  const hasChange = isValidNumber(change);
  const isNumericChange = Number(change || 0);

  return (
    <div className="market-strip-item compact">
      <div className="market-strip-label">{label}</div>

      <div className="market-strip-inline">
        <span className="market-strip-value">{value}</span>

        {type === "price" && hasChange ? (
          <span
            className={`market-strip-change ${classBySign(
              isNumericChange,
              "up",
              "down"
            )}`}
          >
            {formatNum(change)} ({displayPct(changePct)})
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HomeAdvanceDeclineWidget({ ad }) {
  const advances = toNumberOrNull(ad?.advances);
  const declines = toNumberOrNull(ad?.declines);
  const unchanged = toNumberOrNull(ad?.unchanged);
  const explicitTotal = toNumberOrNull(ad?.total);

  const total =
    explicitTotal !== null
      ? explicitTotal
      : Number(advances || 0) + Number(declines || 0) + Number(unchanged || 0);

  const hasBreadth = total > 0;

  const advPct = hasBreadth && advances !== null ? (advances / total) * 100 : 0;
  const decPct = hasBreadth && declines !== null ? (declines / total) * 100 : 0;
  const unchPct = hasBreadth && unchanged !== null ? (unchanged / total) * 100 : 0;

  return (
    <div className="panel home-ad-panel">
      <div className="panel-header">
        <h3>Advance / Decline</h3>
      </div>

      <div className="ad-topline">
        <span className="ad-adv">{hasBreadth ? displayInt(advances) : "-"}</span>
        <span className="ad-sep">|</span>
        <span className="ad-dec">{hasBreadth ? displayInt(declines) : "-"}</span>
      </div>

      <div className="ad-ratio">
        Ratio: {hasBreadth ? displayNum(ad?.ratio, 2) : "-"}
      </div>

      <div className="ad-bar">
        <div className="ad-bar-adv" style={{ width: `${advPct}%` }} />
        <div className="ad-bar-unch" style={{ width: `${unchPct}%` }} />
        <div className="ad-bar-dec" style={{ width: `${decPct}%` }} />
      </div>

      <div className="ad-labels">
        <span className="ad-adv">Adv {hasBreadth ? displayInt(advances) : "-"}</span>
        <span className="ad-unch">Unch {hasBreadth ? displayInt(unchanged) : "-"}</span>
        <span className="ad-dec">Dec {hasBreadth ? displayInt(declines) : "-"}</span>
      </div>
    </div>
  );
}

function getCurrentSentimentValue(source) {
  if (!source || typeof source !== "object") {
    return { score: 0, bias: "", label: "" };
  }

  if (isValidNumber(source?.score)) {
    return {
      score: Number(source.score),
      bias: source?.bias || "",
      label: source?.label || "",
    };
  }

  if (isValidNumber(source?.value)) {
    return {
      score: Number(source.value),
      bias: source?.bias || "",
      label: source?.label || "",
    };
  }

  if (isValidNumber(source?.sentiment_score)) {
    return {
      score: Number(source.sentiment_score),
      bias: source?.bias || "",
      label: source?.label || "",
    };
  }

  const frameBucket =
    source?.sentimentByFrame && typeof source.sentimentByFrame === "object"
      ? source.sentimentByFrame
      : source?.timeframes && typeof source.timeframes === "object"
        ? source.timeframes
        : null;

  if (frameBucket) {
    const preferredKeys = [
      "60min",
      "60m",
      "15min",
      "15m",
      "5min",
      "5m",
      "Daily",
      "daily",
      "1D",
      "1d",
    ];

    for (const key of preferredKeys) {
      const item = frameBucket[key];
      if (typeof item === "number") {
        return { score: Number(item), bias: "", label: "" };
      }
      if (item && typeof item === "object") {
        const score = item?.score ?? item?.value ?? item?.sentiment_score;
        if (isValidNumber(score)) {
          return {
            score: Number(score),
            bias: item?.bias || "",
            label: item?.label || "",
          };
        }
      }
    }
  }

  return { score: 0, bias: "", label: "" };
}

function hasUsableTradeSignalPanel(panel) {
  if (!panel || typeof panel !== "object") return false;

  const bias = String(panel?.bias || "").toLowerCase();

  if (bias.includes("neutral")) {
    return (
      !!panel?.bias ||
      !!panel?.action ||
      isValidNumber(panel?.confidence)
    );
  }

  return (
    !!panel?.bias ||
    !!panel?.action ||
    isValidNumber(panel?.entry) ||
    isValidNumber(panel?.target) ||
    isValidNumber(panel?.stoploss) ||
    isValidNumber(panel?.confidence)
  );
}

function HomeMarketMoodWidget({ sentiment = {} }) {
  const current = getCurrentSentimentValue(sentiment);
  const safeScore = Math.max(0, Math.min(100, Number(current?.score || 0)));

  function getZone(score) {
    if (score <= 20) return "Extreme Fear";
    if (score <= 40) return "Fear";
    if (score <= 60) return "Neutral";
    if (score <= 80) return "Greed";
    return "Extreme Greed";
  }

  function getTone(score) {
    if (score <= 20) return "extreme-fear";
    if (score <= 40) return "fear";
    if (score <= 60) return "neutral";
    if (score <= 80) return "greed";
    return "extreme-greed";
  }

  const angle = -90 + (safeScore / 100) * 180;
  const zone = getZone(safeScore);
  const tone = getTone(safeScore);

  return (
    <div className="panel fear-greed-card compact-fear-greed-card">
      <div className="fear-greed-title-wrap">
        <h3>Fear & Greed Index</h3>
        <div className={`fear-greed-live-status ${tone}`}>
          {zone} ({safeScore})
        </div>
      </div>

      <div className="fear-greed-main compact-fear-greed-main">
        <div className="fear-greed-gauge-wrap compact-fear-greed-gauge-wrap">
          <div className="fear-greed-gauge compact-fear-greed-gauge">
            <div className="gauge-arc arc-1" />
            <div className="gauge-arc arc-2" />
            <div className="gauge-arc arc-3" />
            <div className="gauge-arc arc-4" />
            <div className="gauge-arc arc-5" />

            <div
              className="fear-greed-arrow"
              style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
            >
              <div className="fear-greed-arrow-line" />
              <div className="fear-greed-arrow-head" />
            </div>

            <div className="fear-greed-center-dot" />
            <div className="fear-greed-center-ring" />

            <div className="fear-greed-left-mark">0</div>
            <div className="fear-greed-right-mark">100</div>

            <div className="fear-greed-left-label">Extreme Fear</div>
            <div className="fear-greed-right-label">Extreme Greed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
function HomeBreadthMoodCombo({ ad, sentiment = {} }) {
  const advances = pickFirstUsableNumber(
    ad?.advances,
    ad?.advance,
    ad?.sectorAdvances,
    ad?.positive,
    ad?.gainers
  );

  const declines = pickFirstUsableNumber(
    ad?.declines,
    ad?.decline,
    ad?.sectorDeclines,
    ad?.negative,
    ad?.losers
  );

  const unchanged = pickFirstUsableNumber(
    ad?.unchanged,
    ad?.sectorUnchanged,
    ad?.neutral
  );

  const total =
    pickFirstUsableNumber(ad?.total) ??
    (Number(advances || 0) + Number(declines || 0) + Number(unchanged || 0));

  const advPct =
    total > 0 && advances !== null ? (Number(advances) / total) * 100 : 0;
  const decPct =
    total > 0 && declines !== null ? (Number(declines) / total) * 100 : 0;
  const unchPct =
    total > 0 && unchanged !== null ? (Number(unchanged) / total) * 100 : 0;

  const current = getCurrentSentimentValue(sentiment);
  const safeScore = Math.max(0, Math.min(100, Number(current?.score || 0)));
  const angle = -90 + (safeScore / 100) * 180;

  function getZone(score) {
    if (score <= 20) return "Extreme Fear";
    if (score <= 40) return "Fear";
    if (score <= 60) return "Neutral";
    if (score <= 80) return "Greed";
    return "Extreme Greed";
  }

  const zone = getZone(safeScore);

  return (
    <div className="panel home-breadth-mood-panel">
      <div className="home-breadth-mood-grid">
        <div className="home-breadth-block">
          <div className="home-breadth-title-row">
            <div className="home-breadth-title">ADVANCES/DECLINES</div>

            <div className="home-breadth-topline">
              <span className="ad-adv">
                {Number(total || 0) > 0 ? displayInt(advances) : "-"}
              </span>
              <span className="ad-sep">|</span>
              <span className="ad-dec">
                {Number(total || 0) > 0 ? displayInt(declines) : "-"}
              </span>
            </div>
          </div>

          <div className="home-breadth-subtitle">Combined Sector Stock Breadth</div>

          <div className="ad-bar home-breadth-bar">
            <div className="ad-bar-adv" style={{ width: `${advPct}%` }} />
            <div className="ad-bar-unch" style={{ width: `${unchPct}%` }} />
            <div className="ad-bar-dec" style={{ width: `${decPct}%` }} />
          </div>
        </div>

        <div className="home-mood-block">
          <div className="home-mood-title">Market Mood</div>
          <div className="home-mood-subtitle">(Fear and Greed Index)</div>

          <div className="combo-gauge-wrap">
            <div className="combo-gauge">
              <div className="gauge-arc arc-1" />
              <div className="gauge-arc arc-2" />
              <div className="gauge-arc arc-3" />
              <div className="gauge-arc arc-4" />
              <div className="gauge-arc arc-5" />

              <div
                className="fear-greed-arrow"
                style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
              >
                <div className="fear-greed-arrow-line" />
              </div>

              <div className="fear-greed-center-dot" />
            </div>
          </div>

          <div className="combo-zone-line">
            {zone} ({formatNum(safeScore)})
          </div>

          <div className="combo-extremes">
            <span className="combo-fear"></span>
            <span className="combo-greed"></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeSectorOverviewWidget({ sectors = [] }) {
  function getSectorAdvDecText(sector = {}) {
    const adv = toNumberOrNull(sector?.advances);
    const total = toNumberOrNull(sector?.stocks_count ?? sector?.total);
    const advPct = toNumberOrNull(sector?.adv_pct);

    if (adv === null || total === null) return "-";

    const finalAdvPct =
      advPct !== null
        ? advPct
        : total > 0
          ? Math.round((Number(adv) / Number(total)) * 100)
          : 0;

    return `${displayInt(adv)}/${displayInt(total)} | ${finalAdvPct}%`;
  }

  return (
    <div className="panel home-sector-panel">
      <div className="panel-header">
        <h3>Sector Overview</h3>
      </div>

      <div className="sector-overview-head-row">
        <div className="sector-overview-head-spacer" />
        <div className="sector-overview-head-spacer" />
        <div className="sector-overview-head-spacer" />
        <div className="sector-overview-head-label">Adv/Dec</div>
      </div>

      <div className="home-sector-rotation-list">
        {sectors.length ? (
          sectors.map((sector, index) => {
            const val = Number(sector?.change_pct || 0);
            const width = Math.min(Math.abs(val) * 32, 100);
            const advDecText = getSectorAdvDecText(sector);

            return (
              <div className="sector-row sector-row-advdec" key={`${sector.name}-${index}`}>
                <div className="sector-name">
                  {index + 1}. {sector.name}
                </div>

                <div className="sector-track">
                  <div
                    className={`sector-fill ${val >= 0 ? "pos" : "neg"}`}
                    style={{ width: `${width}%` }}
                  />
                </div>

                <div className="sector-value">
                  <span className={val >= 0 ? "pos" : "neg"}>
                    {val >= 0 ? "+" : ""}
                    {val.toFixed(2)}%
                  </span>
                  {" | "}
                  <span className={val >= 0 ? "pos" : "neg"}>
                    {sector?.status || (val >= 0 ? "Improving" : "Weak")}
                  </span>
                </div>

                <div className="sector-advdec">
                  <span className="sector-advdec-value">{advDecText}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state">No sector data available.</div>
        )}
      </div>
    </div>
  );
}
function FlowBadge({ label, bias }) {
  const cls = String(bias || "").toLowerCase().includes("bull")
    ? "badge bullish"
    : String(bias || "").toLowerCase().includes("bear")
      ? "badge bearish"
      : "badge neutral";

  return <span className={cls}>{label}</span>;
}

/* =========================================================
   Main Component
========================================================= */

function MaxPainBarChart({
  data = [],
  currentPain = null,
  spotPrice = null,
  title = "Max Pain Curve",
}) {
  const cleaned = (data || [])
    .map((item) => ({
      strike: Number(item?.strike || 0),
      callPain: Number(
        item?.callPain ??
        item?.cePain ??
        item?.call_pain ??
        item?.ce_pain ??
        0
      ),
      putPain: Number(
        item?.putPain ??
        item?.pePain ??
        item?.put_pain ??
        item?.pe_pain ??
        0
      ),
      totalPain: Number(item?.pain ?? item?.totalPain ?? 0),
    }))
    .filter(
      (item) =>
        item.strike > 0 &&
        (item.callPain > 0 || item.putPain > 0 || item.totalPain > 0)
    )
    .sort((a, b) => a.strike - b.strike);

  if (!cleaned.length) {
    return <div className="empty-state">No max pain chart data available.</div>;
  }

  const hasSplitPain = cleaned.some(
    (item) => item.callPain > 0 || item.putPain > 0
  );

  const maxVal = Math.max(
    ...cleaned.flatMap((item) =>
      hasSplitPain ? [item.callPain, item.putPain] : [item.totalPain]
    ),
    1
  );

  return (
    <div className="max-pain-bar-chart">
      <div className="max-pain-top-block">
        <div className="max-pain-bar-chart-legend">
          <span className="legend-item">
            <span className="legend-box legend-total" />
            Total Pain
          </span>
        </div>

        <div className="max-pain-bar-chart-meta">
          <span>
            Current Option Pain ={" "}
            <strong>{isValidNumber(currentPain) ? formatInt(currentPain) : "-"}</strong>
          </span>

          {isValidNumber(spotPrice) ? (
            <span>
              Spot Price = <strong>{formatNum(spotPrice, 2)}</strong>
            </span>
          ) : null}
        </div>
      </div>

      <div className="max-pain-bars-wrap">
        {cleaned.map((item, index) => {
          const callHeight = Math.max(
            (item.callPain / maxVal) * 100,
            item.callPain > 0 ? 2 : 0
          );
          const putHeight = Math.max(
            (item.putPain / maxVal) * 100,
            item.putPain > 0 ? 2 : 0
          );
          const totalHeight = Math.max(
            (item.totalPain / maxVal) * 100,
            item.totalPain > 0 ? 2 : 0
          );

          return (
            <div className="max-pain-strike-group" key={`${item.strike}-${index}`}>
              <div className="max-pain-bars">
                {hasSplitPain ? (
                  <>
                    <div
                      className="max-pain-bar call"
                      style={{ height: `${callHeight}%` }}
                      title={`Strike ${item.strike} | Call Pain ${formatInt(
                        item.callPain
                      )}`}
                    />
                    <div
                      className="max-pain-bar put"
                      style={{ height: `${putHeight}%` }}
                      title={`Strike ${item.strike} | Put Pain ${formatInt(
                        item.putPain
                      )}`}
                    />
                  </>
                ) : (
                  <div
                    className="max-pain-bar total"
                    style={{ height: `${totalHeight}%` }}
                    title={`Strike ${item.strike} | Total Pain ${formatInt(
                      item.totalPain
                    )}`}
                  />
                )}
              </div>

              <div className="max-pain-strike-label">{item.strike}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getEntryTiming({
  spotPrice = 0,
  entry = 0,
  target = 0,
  stoploss = 0,
  bias = "",
  breakoutBreakdown = {},
}) {
  const spot = Number(spotPrice || 0);
  const entryPrice = Number(entry || 0);
  const tgt = Number(target || 0);
  const sl = Number(stoploss || 0);
  const biasText = String(bias || "").toLowerCase();

  if (!spot || !entryPrice) {
    return {
      label: "Unavailable",
      tone: "neutral",
      detail: "Entry timing could not be evaluated.",
    };
  }

  const distancePct = Math.abs(spot - entryPrice) / entryPrice;
  const breakoutSignal = String(breakoutBreakdown?.signal || "").toLowerCase();

  if (distancePct <= 0.0025) {
    return {
      label: "Early",
      tone: "support",
      detail: "Price is still close to the suggested entry zone.",
    };
  }

  if (distancePct <= 0.006) {
    return {
      label: "Confirmed",
      tone: "neutral",
      detail: "Move has started and entry is still reasonably close.",
    };
  }

  if (
    breakoutSignal.includes("breakout") ||
    breakoutSignal.includes("breakdown")
  ) {
    return {
      label: "Late",
      tone: "warning",
      detail: "Breakout move is already stretched. Avoid chasing.",
    };
  }

  if (
    (biasText.includes("bull") && tgt && spot >= tgt) ||
    (biasText.includes("bear") && sl && spot <= sl)
  ) {
    return {
      label: "Avoid Chase",
      tone: "resistance",
      detail: "Risk-reward has weakened after the move.",
    };
  }

  return {
    label: "Confirmed",
    tone: "neutral",
    detail: "Setup is active, but avoid oversized entry.",
  };
}

function getBuyerSetupQuality({
  tradeSignalPanel = {},
  marketRegime = {},
  smartOIFlow = {},
  selectedTradeAnalysis = {},
}) {
  const bias = String(tradeSignalPanel?.bias || "").toLowerCase();
  const action = String(tradeSignalPanel?.action || "").toLowerCase();
  const regime = String(marketRegime?.label || "").toLowerCase();
  const bullishFlow = Number(smartOIFlow?.bullishPct || 0);
  const bearishFlow = Number(smartOIFlow?.bearishPct || 0);
  const rr = Number(selectedTradeAnalysis?.rr || 0);
  const premiumLabel = String(
    selectedTradeAnalysis?.premiumSuitability?.label || ""
  ).toLowerCase();

  if (!bias && !action) {
    return {
      label: "Setup Unclear",
      tone: "neutral",
      detail: "Directional setup is not strong enough yet.",
    };
  }

  if (
    (bias.includes("bull") || action.includes("buy ce")) &&
    rr >= 1.8 &&
    !premiumLabel.includes("risky") &&
    !regime.includes("range")
  ) {
    return {
      label: "Strong Breakout Buy",
      tone: "support",
      detail: "Momentum, reward-risk, and premium profile are supportive.",
    };
  }

  if (
    (bias.includes("bull") || bias.includes("bear")) &&
    rr >= 1.2 &&
    (premiumLabel.includes("usable") || premiumLabel.includes("risky"))
  ) {
    return {
      label: "Pullback Buy",
      tone: "warning",
      detail: "Setup is valid, but a better dip entry is preferable.",
    };
  }

  if (regime.includes("range")) {
    return {
      label: "Range-bound",
      tone: "warning",
      detail: "Fresh option buying is less attractive in a range session.",
    };
  }

  if (bullishFlow > bearishFlow || bearishFlow > bullishFlow) {
    return {
      label: "Directional Setup",
      tone: "neutral",
      detail: "Direction exists, but quality is moderate.",
    };
  }

  return {
    label: "Avoid Fresh Buy",
    tone: "resistance",
    detail: "Setup quality is weak for new option buying.",
  };
}


function getTrailingStopHint({
  bias = "",
  entry = 0,
  target = 0,
  stoploss = 0,
}) {
  const biasText = String(bias || "").toLowerCase();
  const entryPrice = Number(entry || 0);
  const tgt = Number(target || 0);
  const sl = Number(stoploss || 0);

  if (!entryPrice || !tgt || !sl) {
    return "Trail guidance unavailable.";
  }

  if (biasText.includes("bull")) {
    return `After target approach, trail stop above ${displayPrice(
      entryPrice
    )} and protect gains on reversal.`;
  }

  if (biasText.includes("bear")) {
    return `After target approach, trail stop below ${displayPrice(
      entryPrice
    )} and protect gains on reversal.`;
  }

  return "Use tight trail once price moves in favor.";
}


function getBuyerChecklist({
  tradeSignalPanel = {},
  selectedTradeAnalysis = {},
}) {
  const directionOk = !!tradeSignalPanel?.bias && !selectedTradeAnalysis?.noTrade;
  const premiumLabel = selectedTradeAnalysis?.premiumSuitability?.label || "N/A";
  const liquidityScore = Number(selectedTradeAnalysis?.liquidityScore || 0);
  const rr = Number(selectedTradeAnalysis?.rr || 0);

  return {
    direction: directionOk ? "Yes" : "No",
    premium:
      premiumLabel === "Ideal" || premiumLabel === "Usable"
        ? "Good"
        : premiumLabel === "Risky"
          ? "Risky"
          : "Weak",
    liquidity: liquidityScore >= 70 ? "Good" : liquidityScore >= 45 ? "Okay" : "Weak",
    rr: rr >= 1.8 ? "Good" : rr >= 1.2 ? "Okay" : "Weak",
  };
}

function getEntryDistanceInfo(spotPrice, entryPrice) {
  const spot = Number(spotPrice || 0);
  const entry = Number(entryPrice || 0);

  if (!spot || !entry) {
    return {
      points: null,
      pct: null,
      label: "Unavailable",
      tone: "neutral",
    };
  }

  const points = round2(spot - entry);
  const pct = round2((Math.abs(points) / entry) * 100);

  let label = "Near Entry";
  let tone = "support";

  if (pct > 0.6) {
    label = "Stretched";
    tone = "resistance";
  } else if (pct > 0.25) {
    label = "Moderately Away";
    tone = "warning";
  }

  return { points, pct, label, tone };
}



function getPremiumProjection(selectedTradeAnalysis = {}) {
  const premium = Number(selectedTradeAnalysis?.premium || 0);
  const reward = Number(selectedTradeAnalysis?.expectedReward || 0);
  const risk = Number(selectedTradeAnalysis?.expectedRisk || 0);

  if (!premium) {
    return {
      currentPremium: null,
      targetPremium: null,
      stopPremium: null,
      upsidePct: null,
      downsidePct: null,
    };
  }

  const targetPremium = round2(premium + reward);
  const stopPremium = round2(Math.max(premium - risk, 0));
  const upsidePct = premium > 0 ? round2((reward / premium) * 100) : null;
  const downsidePct = premium > 0 ? round2((risk / premium) * 100) : null;

  return {
    currentPremium: premium,
    targetPremium,
    stopPremium,
    upsidePct,
    downsidePct,
  };
}


function getPopupSelectedOption(optionChain = [], spotPrice = 0, bias = "") {
  const rows = Array.isArray(optionChain) ? optionChain : [];
  const spot = Number(spotPrice || 0);
  const biasText = String(bias || "").toLowerCase();

  if (!rows.length || !spot) return null;

  const sorted = [...rows]
    .map((row) => ({
      ...row,
      strikeNum: Number(row?.strike || 0),
    }))
    .filter((row) => row.strikeNum > 0)
    .sort((a, b) => a.strikeNum - b.strikeNum);

  if (!sorted.length) return null;

  let chosen = null;

  if (biasText.includes("bull")) {
    chosen =
      sorted.find(
        (row) =>
          row.strikeNum >= spot &&
          Number(row?.ce_ltp || 0) > 0
      ) ||
      sorted.find((row) => Number(row?.ce_ltp || 0) > 0);
  } else if (biasText.includes("bear")) {
    chosen =
      [...sorted]
        .reverse()
        .find(
          (row) =>
            row.strikeNum <= spot &&
            Number(row?.pe_ltp || 0) > 0
        ) ||
      [...sorted]
        .reverse()
        .find((row) => Number(row?.pe_ltp || 0) > 0);
  }

  if (!chosen) return null;

  if (biasText.includes("bull")) {
    return {
      strike: chosen.strikeNum,
      side: "CE",
      premium: Number(chosen?.ce_ltp || 0),
    };
  }

  if (biasText.includes("bear")) {
    return {
      strike: chosen.strikeNum,
      side: "PE",
      premium: Number(chosen?.pe_ltp || 0),
    };
  }

  return null;
}

function getPopupPremiumExecutionData({
  optionChain = [],
  spot = {},
  tradeSignal = {},
}) {
  const bias = String(tradeSignal?.bias || "");
  const spotPrice = Number(
    spot?.ltp || spot?.lastPrice || spot?.price || 0
  );

  const selectedOption = getPopupSelectedOption(optionChain, spotPrice, bias);
  const currentPremium = Number(selectedOption?.premium || 0);

  if (!currentPremium) {
    return {
      currentPremium: null,
      targetPremium: null,
      stopLossPremium: null,
      upsidePct: null,
      downsidePct: null,
      premiumZone: "-",
      premiumAction: "-",
      premiumTone: "neutral",
    };
  }

  const targetPremium = round2(currentPremium * 1.3);
  const stopLossPremium = round2(currentPremium * 0.75);
  const upsidePct = round2(((targetPremium - currentPremium) / currentPremium) * 100);
  const downsidePct = round2(((currentPremium - stopLossPremium) / currentPremium) * 100);

  let premiumZone = "Within Buy Zone";
  let premiumAction = "Premium OK";
  let premiumTone = "support";

  if (currentPremium > 400) {
    premiumZone = "Too Expensive";
    premiumAction = "Avoid Premium";
    premiumTone = "resistance";
  } else if (currentPremium > 250) {
    premiumZone = "Slightly Expensive";
    premiumAction = "Slightly Expensive";
    premiumTone = "warning";
  } else if (currentPremium < 40) {
    premiumZone = "Low Premium";
    premiumAction = "Risky Premium";
    premiumTone = "warning";
  }

  return {
    currentPremium,
    targetPremium,
    stopLossPremium,
    upsidePct,
    downsidePct,
    premiumZone,
    premiumAction,
    premiumTone,
  };
}
function getIVStatus(option = {}, tradeAnalysis = {}) {
  const iv = Number(
    option?.iv ??
    option?.ce_iv ??
    option?.pe_iv ??
    tradeAnalysis?.iv ??
    0
  );

  if (!iv) {
    return {
      value: null,
      label: "N/A",
      tone: "neutral",
    };
  }

  if (iv <= 18) {
    return { value: iv, label: "Cheap", tone: "support" };
  }
  if (iv <= 26) {
    return { value: iv, label: "Fair", tone: "neutral" };
  }
  if (iv <= 34) {
    return { value: iv, label: "Expensive", tone: "warning" };
  }

  return { value: iv, label: "Very Expensive", tone: "resistance" };
}

function getThetaRisk(option = {}, displayATMStrike = null) {
  const premium = Number(option?.ltp || 0);
  const strike = Number(option?.strike || 0);
  const atm = Number(displayATMStrike || 0);

  if (!premium || !strike || !atm) {
    return {
      label: "Unavailable",
      tone: "neutral",
    };
  }

  const strikeDistance = Math.abs(strike - atm);

  if (premium < 80 || strikeDistance > 100) {
    return {
      label: "High Decay",
      tone: "resistance",
    };
  }

  if (premium < 140) {
    return {
      label: "Medium Decay",
      tone: "warning",
    };
  }

  return {
    label: "Low Decay",
    tone: "support",
  };
}

function getBreakoutConfirmationStatus({
  breakoutBreakdown = {},
  entryTiming = {},
}) {
  const signal = String(breakoutBreakdown?.signal || "").toLowerCase();
  const timing = String(entryTiming?.label || "").toLowerCase();

  if (signal.includes("breakdown")) {
    return { label: "Breakdown Active", tone: "support" };
  }

  if (signal.includes("breakout")) {
    return { label: "Breakout Active", tone: "support" };
  }

  if (signal.includes("near breakdown")) {
    return { label: "Near Breakdown", tone: "warning" };
  }

  if (signal.includes("near breakout")) {
    return { label: "Near Breakout", tone: "warning" };
  }

  if (timing.includes("late") || timing.includes("avoid")) {
    return { label: "Late Confirmation", tone: "resistance" };
  }

  return { label: "Inside Range", tone: "neutral" };
}

function getChaseWarning(entryTiming = {}, tradeSignalPanel = {}) {
  const timing = String(entryTiming?.label || "").toLowerCase();
  const bias = String(tradeSignalPanel?.bias || "").toLowerCase();

  if (timing.includes("avoid")) {
    return {
      label: "Avoid Chase",
      detail: "Move already stretched. Fresh option buying is risky here.",
      tone: "resistance",
    };
  }

  if (timing.includes("late")) {
    return {
      label: "Late Entry",
      detail: "Wait for pullback or better re-entry zone.",
      tone: "warning",
    };
  }

  if (timing.includes("early")) {
    return {
      label: bias.includes("bear") || bias.includes("bull")
        ? "Fresh Setup"
        : "Watch Setup",
      detail: "Price is still near the actionable entry zone.",
      tone: "support",
    };
  }

  return {
    label: "Neutral Timing",
    detail: "Entry is acceptable, but avoid oversized positions.",
    tone: "neutral",
  };
}

function getWallSupportConfirmation({
  tradeSignalPanel = {},
  analytics = {},
  bestStrike = null,
}) {
  const bias = String(tradeSignalPanel?.bias || "").toLowerCase();
  const bestStrikeNum = Number(bestStrike?.strike || 0);
  const putWall = Number(analytics?.putWall || 0);
  const callWall = Number(analytics?.callWall || 0);

  if (!bestStrikeNum) {
    return {
      label: "Unavailable",
      nearestWall: null,
      tone: "neutral",
    };
  }

  if (bias.includes("bear")) {
    const diff = callWall ? Math.abs(callWall - bestStrikeNum) : null;
    return {
      label:
        diff !== null && diff <= 100
          ? "Call Wall Confirmed"
          : "Weak Wall Confirmation",
      nearestWall: callWall || null,
      tone:
        diff !== null && diff <= 100
          ? "support"
          : "warning",
    };
  }

  if (bias.includes("bull")) {
    const diff = putWall ? Math.abs(putWall - bestStrikeNum) : null;
    return {
      label:
        diff !== null && diff <= 100
          ? "Put Wall Confirmed"
          : "Weak Wall Confirmation",
      nearestWall: putWall || null,
      tone:
        diff !== null && diff <= 100
          ? "support"
          : "warning",
    };
  }

  return {
    label: "Neutral",
    nearestWall: null,
    tone: "neutral",
  };
}

function getMomentumStrength({
  marketRegime = {},
  smartOIFlow = {},
  breakoutBreakdown = {},
  biasScores = {},
}) {
  const regime = String(marketRegime?.label || "").toLowerCase();
  const oiBias = String(smartOIFlow?.bias || "").toLowerCase();
  const structure = String(breakoutBreakdown?.signal || "").toLowerCase();
  const bull = Number(biasScores?.bullish || 0);
  const bear = Number(biasScores?.bearish || 0);
  const scoreGap = Math.abs(bull - bear);

  if (
    (regime.includes("trend") || structure.includes("break")) &&
    scoreGap >= 2 &&
    !oiBias.includes("neutral")
  ) {
    return { label: "Strong Momentum", tone: "support" };
  }

  if (scoreGap >= 1 || structure.includes("near")) {
    return { label: "Moderate Momentum", tone: "warning" };
  }

  return { label: "Weak Momentum", tone: "resistance" };
}

function getSessionBiasProbabilities(biasScores = {}) {
  const bullish = Math.max(Number(biasScores?.bullish || 0), 0);
  const bearish = Math.max(Number(biasScores?.bearish || 0), 0);
  const neutralBase = 2;

  const total = bullish + bearish + neutralBase;

  return {
    bullish: round2((bullish / total) * 100),
    bearish: round2((bearish / total) * 100),
    neutral: round2((neutralBase / total) * 100),
  };
}

function getEntryZoneStatus({ spotPrice = 0, entryPrice = 0 }) {
  const spot = Number(spotPrice || 0);
  const entry = Number(entryPrice || 0);

  if (!spot || !entry) {
    return {
      label: "Unavailable",
      tone: "neutral",
      detail: "Entry zone could not be evaluated.",
    };
  }

  const pct = Math.abs(spot - entry) / entry;

  if (pct <= 0.0025) {
    return {
      label: "At Entry",
      tone: "support",
      detail: "Spot is sitting very close to the suggested entry.",
    };
  }

  if (pct <= 0.006) {
    return {
      label: "Near Entry",
      tone: "support",
      detail: "Entry is still acceptable for a fresh paper trade.",
    };
  }

  if (pct <= 0.012) {
    return {
      label: "Slightly Away",
      tone: "warning",
      detail: "Wait for a better pullback if possible.",
    };
  }

  return {
    label: "Too Stretched",
    tone: "resistance",
    detail: "Avoid chasing from current spot.",
  };
}

function getPremiumBuyZone(tradeAnalysis = {}) {
  const premium = Number(tradeAnalysis?.premium || 0);
  const premiumSuitability = String(
    tradeAnalysis?.premiumSuitability?.label || ""
  ).toLowerCase();

  if (!premium) {
    return {
      idealBelow: null,
      avoidAbove: null,
      label: "Unavailable",
      tone: "neutral",
    };
  }

  const idealBelow = round2(premium * 1.03);
  const avoidAbove = round2(premium * 1.12);

  let label = "Within Buy Zone";
  let tone = "support";

  if (premiumSuitability.includes("avoid")) {
    label = "Too Expensive";
    tone = "resistance";
  } else if (
    premiumSuitability.includes("risky") ||
    premiumSuitability.includes("usable")
  ) {
    label = "Slightly Expensive";
    tone = "warning";
  } else if (premiumSuitability.includes("ideal")) {
    label = "Within Buy Zone";
    tone = "support";
  }

  return {
    idealBelow,
    avoidAbove,
    label,
    tone,
  };
}
function getExitPlan(tradeAnalysis = {}, tradeSignalPanel = {}) {
  const premium = Number(tradeAnalysis?.premium || 0);
  const targetPremium = Number(tradeAnalysis?.expectedReward || 0)
    ? round2(premium + Number(tradeAnalysis.expectedReward || 0))
    : null;
  const stopPremium = Number(tradeAnalysis?.expectedRisk || 0)
    ? round2(Math.max(premium - Number(tradeAnalysis.expectedRisk || 0), 0))
    : null;

  if (!premium) {
    return {
      partialExit: null,
      fullExit: null,
      hardStop: null,
      trailRule: "Unavailable",
    };
  }

  return {
    partialExit: round2(premium * 1.15),
    fullExit: targetPremium || round2(premium * 1.30),
    hardStop: stopPremium || round2(premium * 0.88),
    trailRule: "Move SL to cost after partial exit.",
  };
}

function getHoldingAdvice(thetaRisk = {}, premiumSuitability = {}) {
  const theta = String(thetaRisk?.label || "").toLowerCase();
  const premium = String(premiumSuitability?.label || "").toLowerCase();

  if (theta.includes("high") || premium.includes("avoid")) {
    return {
      label: "Intraday Only",
      tone: "resistance",
      detail: "Time decay risk is high for carry-forward holding.",
    };
  }

  if (theta.includes("medium") || premium.includes("risky")) {
    return {
      label: "Prefer Intraday",
      tone: "warning",
      detail: "Carry only if setup remains very strong.",
    };
  }

  return {
    label: "Can Hold Carefully",
    tone: "support",
    detail: "Premium profile is relatively favorable.",
  };
}

function getDirectionConfirmation({
  tradeSignalPanel = {},
  breakoutBreakdown = {},
  marketRegime = {},
  wallSupportConfirmation = {},
  momentumStrength = {},
}) {
  const bias = String(tradeSignalPanel?.bias || "").toLowerCase();
  const structure = String(breakoutBreakdown?.signal || "").toLowerCase();
  const regime = String(marketRegime?.label || "").toLowerCase();
  const wall = String(wallSupportConfirmation?.label || "").toLowerCase();
  const momentum = String(momentumStrength?.label || "").toLowerCase();

  let score = 0;

  if (bias.includes("bull") || bias.includes("bear")) score += 1;
  if (structure.includes("break")) score += 1;
  if (!regime.includes("range")) score += 1;
  if (wall.includes("confirmed")) score += 1;
  if (momentum.includes("strong")) score += 1;

  if (score >= 4) {
    return {
      label: "Yes",
      tone: "support",
      detail: "Direction is strongly supported by multiple checks.",
    };
  }

  if (score >= 2) {
    return {
      label: "Partial",
      tone: "warning",
      detail: "Direction exists, but confirmation is incomplete.",
    };
  }

  return {
    label: "No",
    tone: "resistance",
    detail: "Direction is not properly confirmed yet.",
  };
}

function getPremiumMomentum(option = {}) {
  const oiChange = Number(option?.oiChange || 0);
  const volume = Number(option?.volume || 0);
  const score = Number(option?.score || 0);

  const volumeBurst =
    volume >= 500000 ? "Strong" : volume >= 100000 ? "Moderate" : "Weak";

  const oiSupport =
    oiChange > 0 ? "Yes" : oiChange === 0 ? "Flat" : "No";

  let label = "Weak";
  let tone = "resistance";

  if (oiChange > 0 && volume >= 100000 && score >= 60) {
    label = "Strong";
    tone = "support";
  } else if ((oiChange > 0 && volume >= 50000) || score >= 50) {
    label = "Moderate";
    tone = "warning";
  }

  return {
    label,
    tone,
    volumeBurst,
    oiSupport,
  };
}

function getSpotMoveNeeded({
  spotPrice = 0,
  targetPrice = 0,
  bias = "",
}) {
  const spot = Number(spotPrice || 0);
  const target = Number(targetPrice || 0);
  const biasText = String(bias || "").toLowerCase();

  if (!spot || !target) {
    return {
      points: null,
      difficulty: "Unavailable",
      tone: "neutral",
    };
  }

  const points = round2(Math.abs(target - spot));

  let difficulty = "Moderate";
  let tone = "warning";

  if (points <= 40) {
    difficulty = "Easy";
    tone = "support";
  } else if (points <= 90) {
    difficulty = "Moderate";
    tone = "warning";
  } else {
    difficulty = "Hard";
    tone = "resistance";
  }

  return {
    points,
    difficulty,
    tone,
    side: biasText.includes("bear") ? "Down Move Needed" : "Up Move Needed",
  };
}

function getSessionSuitability({
  marketRegime = {},
  breakoutBreakdown = {},
  momentumStrength = {},
  tradeAnalysis = {},
}) {
  const regime = String(marketRegime?.label || "").toLowerCase();
  const structure = String(breakoutBreakdown?.signal || "").toLowerCase();
  const momentum = String(momentumStrength?.label || "").toLowerCase();
  const noTrade = !!tradeAnalysis?.noTrade;

  if (noTrade) {
    return {
      label: "Avoid Session",
      tone: "resistance",
      detail: "Setup is not good enough for fresh buying.",
    };
  }

  if (
    !regime.includes("range") &&
    (structure.includes("break") || momentum.includes("strong"))
  ) {
    return {
      label: "Good for Trend Day",
      tone: "support",
      detail: "This session profile supports option buying better.",
    };
  }

  if (regime.includes("range")) {
    return {
      label: "Weak for Buyers",
      tone: "warning",
      detail: "Sideways sessions are less favorable for long option buying.",
    };
  }

  return {
    label: "Selective Only",
    tone: "neutral",
    detail: "Trade only if execution is clean.",
  };
}

function getBuyerActionBox({
  tradeAnalysis = {},
  entryZoneStatus = {},
  directionConfirmation = {},
  premiumBuyZone = {},
}) {
  if (tradeAnalysis?.noTrade) {
    return {
      action: "No Trade",
      tone: "resistance",
      reason: tradeAnalysis?.noTradeReason || "Conditions not favorable.",
      plan: "Wait for better entry, cheaper premium, or stronger confirmation.",
    };
  }

  if (
    directionConfirmation?.label === "Yes" &&
    entryZoneStatus?.label !== "Too Stretched" &&
    premiumBuyZone?.label !== "Too Expensive"
  ) {
    return {
      action: "Paper Trade Allowed",
      tone: "support",
      reason: "Direction, entry, and premium profile are acceptable.",
      plan: "Take only planned size and follow stop/exit rules.",
    };
  }

  return {
    action: "Wait",
    tone: "warning",
    reason: "Setup is present but not clean enough yet.",
    plan: "Wait for better location or stronger confirmation.",
  };
}

function getPcrInterpretation(pcr = 0, trend = "Flat") {
  const value = Number(pcr || 0);

  if (!value) {
    return {
      label: "Unavailable",
      tone: "neutral",
      side: "-",
    };
  }

  if (trend === "Rising" && value >= 1.2) {
    return {
      label: "Put Writing / Bullish Support",
      tone: "support",
      side: "PE Side Strong",
    };
  }

  if (trend === "Falling" && value <= 0.8) {
    return {
      label: "Call Writing / Bearish Pressure",
      tone: "resistance",
      side: "CE Side Strong",
    };
  }

  if (value >= 1.3) {
    return {
      label: "High PCR - Bullish Bias",
      tone: "support",
      side: "PE Side Strong",
    };
  }

  if (value <= 0.8) {
    return {
      label: "Low PCR - Bearish Bias",
      tone: "resistance",
      side: "CE Side Strong",
    };
  }

  if (trend === "Rising") {
    return {
      label: "PCR Rising",
      tone: "warning",
      side: "PE Building Up",
    };
  }

  if (trend === "Falling") {
    return {
      label: "PCR Falling",
      tone: "warning",
      side: "CE Building Up",
    };
  }

  return {
    label: "Balanced",
    tone: "neutral",
    side: "Balanced CE/PE",
  };
}

function getIndiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = {};
  parts.forEach((part) => {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  });

  return {
    weekday: String(map.weekday || ""),
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
  };
}

function isIndianMarketOpen(date = new Date()) {
  const { weekday, hour, minute } = getIndiaDateParts(date);

  if (weekday === "Sat" || weekday === "Sun") return false;

  const currentMinutes = hour * 60 + minute;
  const marketOpenMinutes = 9 * 60 + 15;
  const marketCloseMinutes = 15 * 60 + 30;

  return currentMinutes >= marketOpenMinutes && currentMinutes <= marketCloseMinutes;
}
function playSignalBeep(toneType = "loud_beep") {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    const stopAndClose = (nodes = [], endTime = 1.2) => {
      nodes.forEach((node) => {
        try {
          node.stop(ctx.currentTime + endTime);
        } catch (e) {}
      });

      setTimeout(() => {
        try {
          ctx.close();
        } catch (e) {}
      }, Math.ceil((endTime + 0.2) * 1000));
    };

    const startTone = () => {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);

      if (toneType === "soft_beep") {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(720, now);

        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        osc.connect(masterGain);
        osc.start(now);
        stopAndClose([osc], 0.45);
        return;
      }

      if (toneType === "double_beep") {
        const osc = ctx.createOscillator();
        osc.type = "square";

        masterGain.gain.setValueAtTime(0.0001, now);
        osc.frequency.setValueAtTime(820, now);

        masterGain.gain.exponentialRampToValueAtTime(0.35, now + 0.03);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        masterGain.gain.setValueAtTime(0.0001, now + 0.32);
        masterGain.gain.exponentialRampToValueAtTime(0.35, now + 0.36);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

        osc.connect(masterGain);
        osc.start(now);
        stopAndClose([osc], 0.62);
        return;
      }

      if (toneType === "triple_beep") {
        const osc = ctx.createOscillator();
        osc.type = "square";

        masterGain.gain.setValueAtTime(0.0001, now);
        osc.frequency.setValueAtTime(880, now);

        masterGain.gain.exponentialRampToValueAtTime(0.36, now + 0.03);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        masterGain.gain.setValueAtTime(0.0001, now + 0.26);
        masterGain.gain.exponentialRampToValueAtTime(0.36, now + 0.29);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        masterGain.gain.setValueAtTime(0.0001, now + 0.53);
        masterGain.gain.exponentialRampToValueAtTime(0.36, now + 0.56);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.74);

        osc.connect(masterGain);
        osc.start(now);
        stopAndClose([osc], 0.74);
        return;
      }

      if (toneType === "siren") {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";

        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.exponentialRampToValueAtTime(0.32, now + 0.04);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

        osc.frequency.setValueAtTime(620, now);
        osc.frequency.linearRampToValueAtTime(980, now + 0.35);
        osc.frequency.linearRampToValueAtTime(620, now + 0.7);
        osc.frequency.linearRampToValueAtTime(980, now + 1.05);
        osc.frequency.linearRampToValueAtTime(620, now + 1.4);

        osc.connect(masterGain);
        osc.start(now);
        stopAndClose([osc], 1.4);
        return;
      }

      if (toneType === "bell") {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();

        osc1.type = "sine";
        osc2.type = "triangle";

        osc1.frequency.setValueAtTime(1046, now);
        osc2.frequency.setValueAtTime(1318, now);

        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.exponentialRampToValueAtTime(0.3, now + 0.03);
        masterGain.gain.exponentialRampToValueAtTime(0.08, now + 0.5);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

        osc1.connect(masterGain);
        osc2.connect(masterGain);

        osc1.start(now);
        osc2.start(now);

        stopAndClose([osc1, osc2], 1.1);
        return;
      }

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();

      osc1.type = "square";
      osc2.type = "sawtooth";

      osc1.frequency.setValueAtTime(740, now);
      osc2.frequency.setValueAtTime(760, now);

      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.exponentialRampToValueAtTime(0.45, now + 0.05);
      masterGain.gain.exponentialRampToValueAtTime(0.28, now + 0.55);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);

      osc1.connect(masterGain);
      osc2.connect(masterGain);

      osc1.start(now);
      osc2.start(now);

      stopAndClose([osc1, osc2], 1.15);
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(startTone).catch(() => {});
    } else {
      startTone();
    }
  } catch (e) {
    console.error("Signal beep failed:", e);
  }
}
export default function ExcelDashboard() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("terminal-theme") || "dark"
  );

  const [view, setView] = useState("home");
  const [symbol, setSymbol] = useState("NIFTY");
  const [terminalTab, setTerminalTab] = useState("Overview");

  const [actionPopupOpen, setActionPopupOpen] = useState(false);
  const [actionPopupSymbol, setActionPopupSymbol] = useState("");
  const [actionPopupData, setActionPopupData] = useState(null);
  const [actionPopupLoading, setActionPopupLoading] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const [homeData, setHomeData] = useState({
    NIFTY: null,
    BANKNIFTY: null,
    SENSEX: null,
  });

  const [homeIndexQuotes, setHomeIndexQuotes] = useState({
    NIFTY: null,
    BANKNIFTY: null,
    SENSEX: null,
  });

  const [homeIndexAnalytics, setHomeIndexAnalytics] = useState({
    NIFTY: null,
    BANKNIFTY: null,
    SENSEX: null,
  });

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [homeLoading, setHomeLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [signalTone, setSignalTone] = useState(
  () => localStorage.getItem("signal-tone") || "loud_beep"
);



  const [pcrHistory, setPcrHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("pcr-history");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          NIFTY: Array.isArray(parsed?.NIFTY) ? parsed.NIFTY : [],
          BANKNIFTY: Array.isArray(parsed?.BANKNIFTY) ? parsed.BANKNIFTY : [],
          SENSEX: Array.isArray(parsed?.SENSEX) ? parsed.SENSEX : [],
        };
      }
    } catch (e) {
      console.error("Failed to read PCR history from localStorage:", e);
    }

    return {
      NIFTY: [],
      BANKNIFTY: [],
      SENSEX: [],
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem("pcr-history", JSON.stringify(pcrHistory));
    } catch (e) {
      console.error("Failed to save PCR history to localStorage:", e);
    }
  }, [pcrHistory]);
  const [fastMarketStrip, setFastMarketStrip] = useState([]);
  const [fastVix, setFastVix] = useState(null);
  const fastStripRefreshLockRef = useRef(false);
  const detailRefreshLockRef = useRef(false);
  const homeRefreshLockRef = useRef(false);
  const homeIndexQuotesRefreshLockRef = useRef(false);
  const homeIndexAnalyticsRefreshLockRef = useRef(false);
  const detailRequestIdRef = useRef(0);


  useEffect(() => {
    localStorage.setItem("terminal-theme", theme);
  }, [theme]);
 
  useEffect(() => {
  localStorage.setItem("signal-tone", signalTone);
}, [signalTone]);


  async function fetchOneDashboard(selectedSymbol) {
    const res = await fetch(`/api/dashboard?symbol=${selectedSymbol}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();

    if (json?.error) {
      throw new Error(json.error);
    }

    return json;

  }

  useEffect(() => {
    if (view !== "home") return;

    refreshHomeIndexQuotes();

    const id = setInterval(() => {
      if (isAfterMarketClose()) return;
      if (autoRefresh && view === "home") {
        refreshHomeIndexQuotes();
      }
    }, 60000);

    return () => clearInterval(id);
  }, [view, autoRefresh]);

  async function refreshHomeIndexAnalytics() {
    if (homeIndexAnalyticsRefreshLockRef.current) return;

    try {
      homeIndexAnalyticsRefreshLockRef.current = true;

      const json = await fetchHomeIndexAnalytics();
      const next = json?.indices || {};

      setHomeIndexAnalytics((prev) => {
        const nextState = {
          NIFTY:
            next?.NIFTY?.analytics &&
              hasUsableAnalytics({ analytics: next.NIFTY.analytics })
              ? {
                ...(prev?.NIFTY || {}),
                ...next.NIFTY,
                analytics: mergeAnalytics(
                  prev?.NIFTY?.analytics || {},
                  next.NIFTY?.analytics || {},
                  next.NIFTY || {}
                ),
              }
              : prev?.NIFTY || null,

          BANKNIFTY:
            next?.BANKNIFTY?.analytics &&
              hasUsableAnalytics({ analytics: next.BANKNIFTY.analytics })
              ? {
                ...(prev?.BANKNIFTY || {}),
                ...next.BANKNIFTY,
                analytics: mergeAnalytics(
                  prev?.BANKNIFTY?.analytics || {},
                  next.BANKNIFTY?.analytics || {},
                  next.BANKNIFTY || {}
                ),
              }
              : prev?.BANKNIFTY || null,

          SENSEX:
            next?.SENSEX?.analytics &&
              hasUsableAnalytics({ analytics: next.SENSEX.analytics })
              ? {
                ...(prev?.SENSEX || {}),
                ...next.SENSEX,
                analytics: mergeAnalytics(
                  prev?.SENSEX?.analytics || {},
                  next.SENSEX?.analytics || {},
                  next.SENSEX || {}
                ),
              }
              : prev?.SENSEX || null,
        };

        const unchanged =
          JSON.stringify(prev?.NIFTY || null) === JSON.stringify(nextState.NIFTY || null) &&
          JSON.stringify(prev?.BANKNIFTY || null) === JSON.stringify(nextState.BANKNIFTY || null) &&
          JSON.stringify(prev?.SENSEX || null) === JSON.stringify(nextState.SENSEX || null);

        return unchanged ? prev : nextState;
      });
    } catch (e) {
      console.error("refreshHomeIndexAnalytics error:", e);
    } finally {
      homeIndexAnalyticsRefreshLockRef.current = false;
    }
  }

  useEffect(() => {
    if (view !== "home") return;

    refreshHomeIndexAnalytics();

    const id = setInterval(() => {
      if (isAfterMarketClose()) return;
      if (autoRefresh && view === "home") {
        refreshHomeIndexAnalytics();
      }
    }, 60000);

    return () => clearInterval(id);
  }, [view, autoRefresh]);


  async function fetchDashboard(selectedSymbol = symbol, isRefresh = false) {
    if (detailRefreshLockRef.current) return;

    const requestId = ++detailRequestIdRef.current;
    const requestedSymbol = String(selectedSymbol || "").toUpperCase();

    try {
      detailRefreshLockRef.current = true;
      setErr("");

      const hasExistingData =
        !!data &&
        String(data?.symbol || "").toUpperCase() === requestedSymbol;

      if (!isRefresh && !hasExistingData) {
        setLoading(true);
      }

      const json = await fetchOneDashboard(selectedSymbol);
      console.log("DETAIL API RESPONSE", json);
      if (requestId !== detailRequestIdRef.current) {
        return;
      }

      if (
        String(json?.symbol || "").toUpperCase() !== requestedSymbol &&
        String(json?.label || "").toUpperCase() !== requestedSymbol
      ) {
        console.warn("Ignored mismatched dashboard response:", {
          requestedSymbol,
          responseSymbol: json?.symbol,
          responseLabel: json?.label,
        });
        return;
      }

      if (isValidDashboardPayload(json)) {
        setData((prev) => {
          const prevSymbol = String(prev?.symbol || "").toUpperCase();
          const nextSymbol = String(json?.symbol || "").toUpperCase();

          if (prevSymbol && nextSymbol && prevSymbol !== nextSymbol) {
            return json;
          }

          return prev && prevSymbol === requestedSymbol
            ? mergeDashboardData(prev, json)
            : json;
        });
      } else {
        console.warn("Ignored invalid/empty detail dashboard response:", json);
      }
    } catch (e) {
      if (requestId === detailRequestIdRef.current) {
        console.error("fetchDashboard error:", e);
        setErr(String(e.message || e));
      }
    } finally {
      if (requestId === detailRequestIdRef.current) {
        setLoading(false);
        detailRefreshLockRef.current = false;
      }
    }
  }
  async function fetchHomeSummary() {
    const res = await fetch("/api/home-dashboard", {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();

    if (json?.error) {
      throw new Error(json.error);
    }

    return json;
  }

  async function fetchHomeIndexQuotes() {
    const res = await fetch("/api/home-index-quotes", {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();

    if (json?.error) {
      throw new Error(json.error);
    }

    return json;
  }

  async function fetchHomeIndexAnalytics() {
    const res = await fetch("/api/home-index-analytics", {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();

    if (json?.error) {
      throw new Error(json.error);
    }

    return json;
  }

  async function fetchFastMarketStrip() {
    if (fastStripRefreshLockRef.current) return;

    try {
      fastStripRefreshLockRef.current = true;

      const res = await fetch("/api/home-ticker", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text()}`);
      }

      const json = await res.json();

      if (json?.error) {
        throw new Error(json.error);
      }

      if (hasUsableMarketStrip(json?.marketStrip || [])) {
        setFastMarketStrip((prev) => {
          const merged = mergeMarketStrip(prev || [], json?.marketStrip || []);
          return shallowEqualMarketItems(prev || [], merged) ? prev : merged;
        });
      }

      if (json?.vix && hasUsableVix({ vix: json.vix })) {
        setFastVix((prev) => {
          const nextVix = json.vix;
          const same =
            Number(prev?.ltp || 0) === Number(nextVix?.ltp || 0) &&
            Number(prev?.change || 0) === Number(nextVix?.change || 0) &&
            Number(prev?.change_pct || 0) === Number(nextVix?.change_pct || 0);
          return same ? prev : nextVix;
        });
      }
    } catch (e) {
      console.error("fetchFastMarketStrip error:", e);
    } finally {
      fastStripRefreshLockRef.current = false;
    }
  }


  async function refreshHomeIndexQuotes() {
    if (homeIndexQuotesRefreshLockRef.current) return;

    try {
      homeIndexQuotesRefreshLockRef.current = true;

      const json = await fetchHomeIndexQuotes();
      const next = json?.indices || {};

      setHomeIndexQuotes((prev) => {
        const nextState = {
          NIFTY: isUsableHomeCardPayload(next?.NIFTY)
            ? mergeHomeCardPreservingValues(prev?.NIFTY || {}, next.NIFTY)
            : prev?.NIFTY || null,

          BANKNIFTY: isUsableHomeCardPayload(next?.BANKNIFTY)
            ? mergeHomeCardPreservingValues(prev?.BANKNIFTY || {}, next.BANKNIFTY)
            : prev?.BANKNIFTY || null,

          SENSEX: isUsableHomeCardPayload(next?.SENSEX)
            ? mergeHomeCardPreservingValues(prev?.SENSEX || {}, next.SENSEX)
            : prev?.SENSEX || null,
        };

        const unchanged =
          JSON.stringify(prev?.NIFTY || null) === JSON.stringify(nextState.NIFTY || null) &&
          JSON.stringify(prev?.BANKNIFTY || null) === JSON.stringify(nextState.BANKNIFTY || null) &&
          JSON.stringify(prev?.SENSEX || null) === JSON.stringify(nextState.SENSEX || null);

        return unchanged ? prev : nextState;
      });
    } catch (error) {
      console.error("refreshHomeIndexQuotes failed:", error);
    } finally {
      homeIndexQuotesRefreshLockRef.current = false;
    }
  }

  async function fetchHomeDashboard(isRefresh = false) {
    if (homeRefreshLockRef.current) return;

    try {
      homeRefreshLockRef.current = true;
      setErr("");

      const hasExistingHomeData =
        hasAnyValidHomeDashboard(homeData) ||
        hasUsableMarketStrip(homeData?.NIFTY?.marketStrip) ||
        hasUsableMarketStrip(homeData?.BANKNIFTY?.marketStrip) ||
        hasUsableMarketStrip(homeData?.SENSEX?.marketStrip);

      if (!isRefresh && !hasExistingHomeData) {
        setHomeLoading(true);
      }

      const json = await fetchHomeSummary();


      const nextHomeData = {
        NIFTY: json?.indices?.NIFTY || null,
        BANKNIFTY: json?.indices?.BANKNIFTY || null,
        SENSEX: json?.indices?.SENSEX || null,
      };

      const hasValidSummary =
        hasUsableHomeSummaryPayload({
          ...nextHomeData.NIFTY,
          marketStrip: json?.marketStrip,
          vix: json?.vix,
          sectorStrength: json?.sectorStrength,
          advanceDecline: json?.advanceDecline?.NIFTY,
          analytics: {
            ...(nextHomeData?.NIFTY?.analytics || {}),
            breadthStats: json?.breadthStats,
            sentiment: json?.marketMood,
          },
        }) ||
        hasUsableHomeSummaryPayload({
          ...nextHomeData.BANKNIFTY,
          marketStrip: json?.marketStrip,
          vix: json?.vix,
          sectorStrength: json?.sectorStrength,
          advanceDecline: json?.advanceDecline?.BANKNIFTY,
          analytics: {
            ...(nextHomeData?.BANKNIFTY?.analytics || {}),
            breadthStats: json?.breadthStats,
            sentiment: json?.marketMood,
          },
        }) ||
        hasUsableHomeSummaryPayload({
          ...nextHomeData.SENSEX,
          marketStrip: json?.marketStrip,
          vix: json?.vix,
          sectorStrength: json?.sectorStrength,
          advanceDecline: json?.advanceDecline?.SENSEX,
          analytics: {
            ...(nextHomeData?.SENSEX?.analytics || {}),
            breadthStats: json?.breadthStats,
            sentiment: json?.marketMood,
          },
        }) ||
        hasUsableMarketStrip(json?.marketStrip || []);
      if (!hasValidSummary) {
        console.warn("Ignored invalid/empty home dashboard response:", json);
        return;
      }

      setHomeData((prev) => ({
        NIFTY: hasUsableHomeSummaryPayload({
          ...nextHomeData.NIFTY,
          marketStrip: json?.marketStrip,
          vix: json?.vix,
          sectorStrength: json?.sectorStrength,
          advanceDecline: json?.advanceDecline?.NIFTY,
          analytics: {
            ...(prev?.NIFTY?.analytics || {}),
            ...(nextHomeData?.NIFTY?.analytics || {}),
            breadthStats:
              json?.breadthStats ||
              nextHomeData?.NIFTY?.analytics?.breadthStats ||
              prev?.NIFTY?.analytics?.breadthStats ||
              {},
            sentiment:
              json?.marketMood ||
              nextHomeData?.NIFTY?.analytics?.sentiment ||
              prev?.NIFTY?.analytics?.sentiment ||
              {},
          },
        })
          ? mergeDashboardData(prev?.NIFTY, {
            ...nextHomeData.NIFTY,
            marketStrip: json?.marketStrip || prev?.NIFTY?.marketStrip || [],
            vix: hasUsableVix({ vix: json?.vix })
              ? json?.vix
              : prev?.NIFTY?.vix || {},
            sectorStrength: hasUsableSectors({ sectorStrength: json?.sectorStrength })
              ? json?.sectorStrength
              : prev?.NIFTY?.sectorStrength || [],
            advanceDecline: hasUsableBreadth({
              advanceDecline: json?.advanceDecline?.NIFTY,
            })
              ? json?.advanceDecline?.NIFTY
              : prev?.NIFTY?.advanceDecline || {},

            analytics: {
              ...(prev?.NIFTY?.analytics || {}),
              ...(nextHomeData?.NIFTY?.analytics || {}),
              breadthStats:
                json?.breadthStats ||
                nextHomeData?.NIFTY?.analytics?.breadthStats ||
                prev?.NIFTY?.analytics?.breadthStats ||
                {},
              sentiment:
                json?.marketMood ||
                nextHomeData?.NIFTY?.analytics?.sentiment ||
                prev?.NIFTY?.analytics?.sentiment ||
                {},
              fiiDii:
                json?.fiiDii ||
                nextHomeData?.NIFTY?.analytics?.fiiDii ||
                prev?.NIFTY?.analytics?.fiiDii ||
                {},
            },
            timestamp: json?.timestamp || prev?.NIFTY?.timestamp,
          })
          : prev?.NIFTY,

        BANKNIFTY: hasUsableHomeSummaryPayload({
          ...nextHomeData.BANKNIFTY,
          marketStrip: json?.marketStrip,
          vix: json?.vix,
          sectorStrength: json?.sectorStrength,
          advanceDecline: json?.advanceDecline?.BANKNIFTY,
          analytics: {
            ...(prev?.BANKNIFTY?.analytics || {}),
            ...(nextHomeData?.BANKNIFTY?.analytics || {}),
            breadthStats:
              json?.breadthStats ||
              nextHomeData?.BANKNIFTY?.analytics?.breadthStats ||
              prev?.BANKNIFTY?.analytics?.breadthStats ||
              {},
            sentiment:
              json?.marketMood ||
              nextHomeData?.BANKNIFTY?.analytics?.sentiment ||
              prev?.BANKNIFTY?.analytics?.sentiment ||
              {},
          },
        })
          ? mergeDashboardData(prev?.BANKNIFTY, {
            ...nextHomeData.BANKNIFTY,
            marketStrip: json?.marketStrip || prev?.BANKNIFTY?.marketStrip || [],
            vix: hasUsableVix({ vix: json?.vix })
              ? json?.vix
              : prev?.BANKNIFTY?.vix || {},
            sectorStrength: hasUsableSectors({ sectorStrength: json?.sectorStrength })
              ? json?.sectorStrength
              : prev?.BANKNIFTY?.sectorStrength || [],
            advanceDecline: hasUsableBreadth({
              advanceDecline: json?.advanceDecline?.BANKNIFTY,
            })
              ? json?.advanceDecline?.BANKNIFTY
              : prev?.BANKNIFTY?.advanceDecline || {},
            analytics: {
              ...(prev?.BANKNIFTY?.analytics || {}),
              ...(nextHomeData?.BANKNIFTY?.analytics || {}),
              breadthStats:
                json?.breadthStats ||
                nextHomeData?.BANKNIFTY?.analytics?.breadthStats ||
                prev?.BANKNIFTY?.analytics?.breadthStats ||
                {},
              sentiment:
                json?.marketMood ||
                nextHomeData?.BANKNIFTY?.analytics?.sentiment ||
                prev?.BANKNIFTY?.analytics?.sentiment ||
                {},
              fiiDii:
                json?.fiiDii ||
                nextHomeData?.BANKNIFTY?.analytics?.fiiDii ||
                prev?.BANKNIFTY?.analytics?.fiiDii ||
                {},
            },
            timestamp: json?.timestamp || prev?.BANKNIFTY?.timestamp,
          })
          : prev?.BANKNIFTY,

        SENSEX: hasUsableHomeSummaryPayload({
          ...nextHomeData.SENSEX,
          marketStrip: json?.marketStrip,
          vix: json?.vix,
          sectorStrength: json?.sectorStrength,
          advanceDecline: json?.advanceDecline?.SENSEX,
          analytics: {
            ...(prev?.SENSEX?.analytics || {}),
            ...(nextHomeData?.SENSEX?.analytics || {}),
            breadthStats:
              json?.breadthStats ||
              nextHomeData?.SENSEX?.analytics?.breadthStats ||
              prev?.SENSEX?.analytics?.breadthStats ||
              {},
            sentiment:
              json?.marketMood ||
              nextHomeData?.SENSEX?.analytics?.sentiment ||
              prev?.SENSEX?.analytics?.sentiment ||
              {},
            fiiDii:
              json?.fiiDii ||
              nextHomeData?.SENSEX?.analytics?.fiiDii ||
              prev?.SENSEX?.analytics?.fiiDii ||
              {},
          },
        })
          ? mergeDashboardData(prev?.SENSEX, {
            ...nextHomeData.SENSEX,
            marketStrip: json?.marketStrip || prev?.SENSEX?.marketStrip || [],
            vix: hasUsableVix({ vix: json?.vix })
              ? json?.vix
              : prev?.SENSEX?.vix || {},
            sectorStrength: hasUsableSectors({ sectorStrength: json?.sectorStrength })
              ? json?.sectorStrength
              : prev?.SENSEX?.sectorStrength || [],
            advanceDecline: hasUsableBreadth({
              advanceDecline: json?.advanceDecline?.SENSEX,
            })
              ? json?.advanceDecline?.SENSEX
              : prev?.SENSEX?.advanceDecline || {},
            analytics: {
              ...(prev?.SENSEX?.analytics || {}),
              ...(nextHomeData?.SENSEX?.analytics || {}),
              breadthStats:
                json?.breadthStats ||
                nextHomeData?.SENSEX?.analytics?.breadthStats ||
                prev?.SENSEX?.analytics?.breadthStats ||
                {},
              sentiment:
                json?.marketMood ||
                nextHomeData?.SENSEX?.analytics?.sentiment ||
                prev?.SENSEX?.analytics?.sentiment ||
                {},
            },
            timestamp: json?.timestamp || prev?.SENSEX?.timestamp,
          })
          : prev?.SENSEX,
      }));
    } catch (e) {
      console.error("fetchHomeDashboard error:", e);
      setErr(String(e.message || e));
    } finally {
      setHomeLoading(false);
      homeRefreshLockRef.current = false;
    }
  }

  useEffect(() => {
    fetchHomeDashboard(false);
  }, []);

  useEffect(() => {
    if (view === "detail") {
      fetchDashboard(symbol, false);
    }
  }, [symbol, view]);


  useEffect(() => {
    if (!autoRefresh || view !== "home") return;

    fetchFastMarketStrip();

    const stripIntervalId = setInterval(() => {
      if (isAfterMarketClose()) return;
      if (autoRefresh) fetchFastMarketStrip();
    }, 10000);

    return () => clearInterval(stripIntervalId);
  }, [view, autoRefresh]);
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      if (isAfterMarketClose()) return;
      if (autoRefresh) {
        if (view === "home") {
          fetchHomeDashboard(true);
        } else if (view === "detail") {
          fetchDashboard(symbol, true);
        }
      }
    }, view === "home" ? 10000 : 12000);

    return () => clearInterval(intervalId);
  }, [view, symbol, autoRefresh]);

  const activeDetailSymbol = String(symbol || "").toUpperCase();

  const safeDetailDataRef = useRef(null);

  const safeDetailData = useMemo(() => {
    if (view !== "detail") return null;
    if (!data || typeof data !== "object") {
      return safeDetailDataRef.current;
    }

    const dataSymbol = String(data?.symbol || "").toUpperCase();

    if (!dataSymbol || dataSymbol === activeDetailSymbol) {
      if (isValidDashboardPayload(data)) {
        safeDetailDataRef.current = data;
        return data;
      }
    }

    return safeDetailDataRef.current;
  }, [view, data, activeDetailSymbol]);

  const safeSpot = safeDetailData?.spot || {};
  const analytics = safeDetailData?.analytics || {};
  const chain = safeDetailData?.optionChain || [];
  const heatmap = safeDetailData?.oiHeatmap || [];
  const ad = safeDetailData?.advanceDecline || {};
  const spot = safeDetailData?.spot || {};
  const future = safeDetailData?.future || {};
  const vix = safeDetailData?.vix || {};
  const breakoutBreakdown = analytics?.breakoutBreakdown || {};
  const intradayRangeProjection = analytics?.intradayRangeProjection || {};
  const callPutDominance = analytics?.callPutDominance || {};
  const smartOIFlow = analytics?.smartOIFlow || {};
  const marketRegime = analytics?.marketRegime || {};
  const breadthStats = analytics?.breadthStats || {};
  const tradeSignalPanelRef = useRef({});

  const tradeSignalPanel = useMemo(() => {
    const nextValue = analytics?.tradeSignalPanel || {};

    if (hasUsableTradeSignalPanel(nextValue)) {
      tradeSignalPanelRef.current = nextValue;
      return nextValue;
    }

    return tradeSignalPanelRef.current || {};
  }, [analytics?.tradeSignalPanel]);
  const maxPainCurve = analytics?.maxPainCurve || [];
  const sectorRotation = analytics?.sectorRotation || [];
  const liquidityMap = analytics?.liquidityMap || [];
  const optionsFlowDetector = analytics?.optionsFlowDetector || {};
  const biasBreakdown = analytics?.biasBreakdown || {};
  const biasScores = analytics?.biasScores || {};

  const displayATMStrike = useMemo(


    () => getDisplayATMStrike(chain, analytics, spot),
    [chain, analytics, spot]
  );

  const nearbyStrikeCount = useMemo(() => getNearbyStrikeCount(), []);

  const displayChain = useMemo(
    () => filterNearbyStrikes(chain, displayATMStrike, nearbyStrikeCount),
    [chain, displayATMStrike, nearbyStrikeCount]
  );
  const mostTradedStrikes = useMemo(() => {
    const rows = Array.isArray(displayChain) ? displayChain : [];
    const atm = Number(displayATMStrike || 0);

    if (!rows.length) {
      return {
        ce: [],
        pe: [],
        interpretation: "No traded-strike data available.",
        hasData: false,
      };
    }

    const strikeStep = (() => {
      const strikes = rows
        .map((row) => Number(row?.strike || 0))
        .filter((x) => x > 0)
        .sort((a, b) => a - b);

      if (strikes.length < 2) return 50;

      let minDiff = Infinity;
      for (let i = 1; i < strikes.length; i += 1) {
        const diff = strikes[i] - strikes[i - 1];
        if (diff > 0 && diff < minDiff) minDiff = diff;
      }

      return Number.isFinite(minDiff) ? minDiff : 50;
    })();

    const maxCeVolume = Math.max(...rows.map((row) => Number(row?.ce_volume || 0)), 1);
    const maxCeOi = Math.max(...rows.map((row) => Number(row?.ce_oi || 0)), 1);
    const maxCeOiChg = Math.max(
      ...rows.map((row) => Math.max(Number(row?.ce_oich || 0), 0)),
      1
    );

    const maxPeVolume = Math.max(...rows.map((row) => Number(row?.pe_volume || 0)), 1);
    const maxPeOi = Math.max(...rows.map((row) => Number(row?.pe_oi || 0)), 1);
    const maxPeOiChg = Math.max(
      ...rows.map((row) => Math.max(Number(row?.pe_oich || 0), 0)),
      1
    );

    function getDistanceScore(strike) {
      if (!atm || !strike) return 40;

      const distance = Math.abs(Number(strike) - atm);

      if (distance === 0) return 100;
      if (distance <= strikeStep) return 90;
      if (distance <= strikeStep * 2) return 75;
      if (distance <= strikeStep * 3) return 60;
      if (distance <= strikeStep * 4) return 45;
      return 10;
    }

    function getLevelBonus(strike) {
      let bonus = 0;

      if (Number(strike) === Number(displayATMStrike)) bonus += 12;
      if (levelIncludes(analytics?.supports, strike)) bonus += 8;
      if (levelIncludes(analytics?.resistances, strike)) bonus += 8;
      if (Number(analytics?.putWall || 0) === Number(strike)) bonus += 10;
      if (Number(analytics?.callWall || 0) === Number(strike)) bonus += 10;

      return bonus;
    }

    function getDistanceLabel(strike) {
      if (!atm || !strike) return "-";
      const diff = Number(strike) - atm;
      if (diff === 0) return "ATM";
      return `${diff > 0 ? "+" : ""}${diff}`;
    }

    function getActivityLabel(oiChange, volume, strike) {
      const positiveOi = Number(oiChange || 0) > 0;
      const strongVolume = Number(volume || 0) >= 100000;
      const veryStrongVolume = Number(volume || 0) >= 300000;
      const nearAtm =
        atm > 0 && Math.abs(Number(strike || 0) - atm) <= strikeStep * 2;

      if (positiveOi && veryStrongVolume && nearAtm) return "Fresh Build-up";
      if (positiveOi && strongVolume) return "Strong OI Add";
      if (positiveOi) return "Supportive";
      if (Number(oiChange || 0) < 0) return "Unwinding";
      return "Stable Activity";
    }

    const ceRows = rows
      .filter(
        (row) =>
          row &&
          row.strike !== undefined &&
          row.strike !== null &&
          Number(row.ce_volume || 0) > 0 &&
          Number(row.ce_ltp || 0) >= 8
      )
      .map((row) => {
        const strike = Number(row.strike || 0);
        const volume = Number(row.ce_volume || 0);
        const oi = Number(row.ce_oi || 0);
        const oiChange = Number(row.ce_oich || 0);
        const ltp = Number(row.ce_ltp || 0);

        const score =
          (volume / maxCeVolume) * 45 +
          (oi / maxCeOi) * 25 +
          (Math.max(oiChange, 0) / maxCeOiChg) * 15 +
          (getDistanceScore(strike) / 100) * 15 +
          getLevelBonus(strike);

        return {
          strike,
          volume,
          oi,
          oiChange,
          ltp,
          score,
          distLabel: getDistanceLabel(strike),
          activity: getActivityLabel(oiChange, volume, strike),
          distanceAbs: Math.abs(strike - atm),
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.distanceAbs - b.distanceAbs;
      })
      .slice(0, 5);

    const peRows = rows
      .filter(
        (row) =>
          row &&
          row.strike !== undefined &&
          row.strike !== null &&
          Number(row.pe_volume || 0) > 0 &&
          Number(row.pe_ltp || 0) >= 8
      )
      .map((row) => {
        const strike = Number(row.strike || 0);
        const volume = Number(row.pe_volume || 0);
        const oi = Number(row.pe_oi || 0);
        const oiChange = Number(row.pe_oich || 0);
        const ltp = Number(row.pe_ltp || 0);

        const score =
          (volume / maxPeVolume) * 45 +
          (oi / maxPeOi) * 25 +
          (Math.max(oiChange, 0) / maxPeOiChg) * 15 +
          (getDistanceScore(strike) / 100) * 15 +
          getLevelBonus(strike);

        return {
          strike,
          volume,
          oi,
          oiChange,
          ltp,
          score,
          distLabel: getDistanceLabel(strike),
          activity: getActivityLabel(oiChange, volume, strike),
          distanceAbs: Math.abs(strike - atm),
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.distanceAbs - b.distanceAbs;
      })
      .slice(0, 5);

    let interpretation = "Sideways Momentum: CE/PE activity balanced around ATM zone";

    if (ceRows.length && !peRows.length) {
      interpretation = `Bearish Momentum: CE build-up dominant near ${ceRows[0]?.strike || "-"}`;
    } else if (!ceRows.length && peRows.length) {
      interpretation = `Bullish Momentum: PE build-up dominant near ${peRows[0]?.strike || "-"}`;
    } else if (ceRows.length && peRows.length) {
      const ceTop3 = ceRows.slice(0, 3);
      const peTop3 = peRows.slice(0, 3);

      const ceScoreSum = ceTop3.reduce(
        (sum, row) => sum + Number(row?.score || 0),
        0
      );
      const peScoreSum = peTop3.reduce(
        (sum, row) => sum + Number(row?.score || 0),
        0
      );

      const ceOiChgSum = ceTop3.reduce(
        (sum, row) => sum + Math.max(Number(row?.oiChange || 0), 0),
        0
      );
      const peOiChgSum = peTop3.reduce(
        (sum, row) => sum + Math.max(Number(row?.oiChange || 0), 0),
        0
      );

      const ceNearResistance = ceTop3.some(
        (row) =>
          levelIncludes(analytics?.resistances, row?.strike) ||
          Number(analytics?.callWall || 0) === Number(row?.strike)
      );

      const peNearSupport = peTop3.some(
        (row) =>
          levelIncludes(analytics?.supports, row?.strike) ||
          Number(analytics?.putWall || 0) === Number(row?.strike)
      );

      const ceStrength = ceScoreSum + ceOiChgSum / 100000;
      const peStrength = peScoreSum + peOiChgSum / 100000;

      if (peStrength > ceStrength * 1.08) {
        interpretation = peNearSupport
          ? `Bullish Momentum: PE support build-up stronger near ${peTop3[0]?.strike || "-"}`
          : `Bullish Momentum: PE activity stronger near ${peTop3[0]?.strike || "-"}`;
      } else if (ceStrength > peStrength * 1.08) {
        interpretation = ceNearResistance
          ? `Bearish Momentum: CE resistance build-up stronger near ${ceTop3[0]?.strike || "-"}`
          : `Bearish Momentum: CE activity stronger near ${ceTop3[0]?.strike || "-"}`;
      } else {
        interpretation = `Sideways Momentum: CE/PE activity balanced around ATM zone`;
      }
    }

    return {
      ce: ceRows,
      pe: peRows,
      interpretation,
      hasData: ceRows.length > 0 || peRows.length > 0,
    };
  }, [displayChain, displayATMStrike, analytics]);

  const displayMaxPainCurve = useMemo(
    () => filterNearbyStrikes(maxPainCurve, displayATMStrike, nearbyStrikeCount),
    [maxPainCurve, displayATMStrike, nearbyStrikeCount]
  );
  


  const displayLiquidityMap = useMemo(
    () => filterNearbyStrikes(liquidityMap, displayATMStrike, nearbyStrikeCount),
    [liquidityMap, displayATMStrike, nearbyStrikeCount]
  );

  const maxCeOich = useMemo(() => maxOf(displayChain, "ce_oich"), [displayChain]);
  const maxPeOich = useMemo(() => maxOf(displayChain, "pe_oich"), [displayChain]);

  const bestStrikesRef = useRef({
    bestStrike: null,
    saferStrike: null,
    aggressiveStrike: null,
    candidates: [],
  });

  const bestStrikes = useMemo(() => {
    const nextValue = selectBestOptionStrikes(
      displayChain,
      Number(spot?.ltp || 0),
      tradeSignalPanel?.bias || "Neutral"
    );

    if (nextValue?.bestStrike) {
      bestStrikesRef.current = nextValue;
      return nextValue;
    }

    return bestStrikesRef.current;
  }, [displayChain, spot, tradeSignalPanel]);

  const importantGreeks = useMemo(() => {
  const rows = Array.isArray(displayChain) ? displayChain : [];
  if (!rows.length) {
    return null;
  }

  const atmRow =
    rows.find((row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)) ||
    null;

  const bestStrikeValue = Number(bestStrikes?.bestStrike?.strike || 0);
  const bestSide = String(bestStrikes?.bestStrike?.side || "").toUpperCase();

  const bestRow =
    rows.find((row) => Number(row?.strike || 0) === bestStrikeValue) || null;

  return {
    atm: atmRow
      ? {
          strike: atmRow?.strike,
          ce: {
            delta: atmRow?.ce_delta,
            theta: atmRow?.ce_theta,
            vega: atmRow?.ce_vega,
          },
          pe: {
            delta: atmRow?.pe_delta,
            theta: atmRow?.pe_theta,
            vega: atmRow?.pe_vega,
          },
        }
      : null,

    best: bestRow
      ? {
          strike: bestRow?.strike,
          side: bestSide || null,
          delta:
            bestSide === "CE" ? bestRow?.ce_delta :
            bestSide === "PE" ? bestRow?.pe_delta :
            null,
          theta:
            bestSide === "CE" ? bestRow?.ce_theta :
            bestSide === "PE" ? bestRow?.pe_theta :
            null,
          vega:
            bestSide === "CE" ? bestRow?.ce_vega :
            bestSide === "PE" ? bestRow?.pe_vega :
            null,
        }
      : null,
  };
}, [displayChain, displayATMStrike, bestStrikes]);

const greeksInterpretation = useMemo(() => {
  return getGreeksInterpretation(importantGreeks);
}, [importantGreeks]);
  const entryTimingRef = useRef({
    label: "Unavailable",
    tone: "neutral",
    detail: "Entry timing could not be evaluated.",
  });

  const entryTiming = useMemo(() => {
    const nextValue = getEntryTiming({
      spotPrice: Number(spot?.ltp || 0),
      entry: tradeSignalPanel?.entry,
      target: tradeSignalPanel?.target,
      stoploss: tradeSignalPanel?.stoploss,
      bias: tradeSignalPanel?.bias,
      breakoutBreakdown,
    });

    if (nextValue?.label && nextValue?.label !== "Unavailable") {
      entryTimingRef.current = nextValue;
      return nextValue;
    }

    return entryTimingRef.current;
  }, [spot, tradeSignalPanel, breakoutBreakdown]);


  const normalizedSupports = useMemo(() => {
    const spotPrice = Number(spot?.ltp || 0);

    return [...(analytics?.supports || [])]
      .map((x) => Number(x))
      .filter((x) => x > 0 && (!spotPrice || x <= spotPrice))
      .sort((a, b) => b - a);
  }, [analytics?.supports, spot?.ltp]);

  const normalizedResistances = useMemo(() => {
    const spotPrice = Number(spot?.ltp || 0);

    return [...(analytics?.resistances || [])]
      .map((x) => Number(x))
      .filter((x) => x > 0 && (!spotPrice || x >= spotPrice))
      .sort((a, b) => a - b);
  }, [analytics?.resistances, spot?.ltp]);

  const trailingStopHint = useMemo(() => {
    return getTrailingStopHint({
      bias: tradeSignalPanel?.bias,
      entry: tradeSignalPanel?.entry,
      target: tradeSignalPanel?.target,
      stoploss: tradeSignalPanel?.stoploss,
    });
  }, [tradeSignalPanel]);

  const actionPopupAnalytics = actionPopupData?.analytics || {};
  const actionPopupTradeSignal = actionPopupAnalytics?.tradeSignalPanel || {};

  const actionPopupBiasText = String(actionPopupTradeSignal?.bias || "").toLowerCase();
  const actionPopupActionText = String(actionPopupTradeSignal?.action || "").toLowerCase();

  const actionPopupIsRangebound =
    actionPopupBiasText === "neutral" ||
    actionPopupBiasText.includes("range");

  const actionPopupShowTargetStop =
    !actionPopupIsRangebound &&
    !actionPopupActionText.includes("wait");

  const actionPopupShowEntry =
    !actionPopupIsRangebound &&
    isValidNumber(actionPopupTradeSignal?.entry);

  const actionPopupShowRR =
    !actionPopupIsRangebound;
  const actionPopupSummary = actionPopupIsRangebound
    ? "Sideways market. Avoid fresh directional entry until breakout or breakdown confirmation."
    : getBiasTone(actionPopupTradeSignal?.bias) === "bullish"
      ? "Bullish setup. Prefer CE-side continuation only near valid entry."
      : getBiasTone(actionPopupTradeSignal?.bias) === "bearish"
        ? "Bearish setup. Prefer PE-side continuation only near valid entry."
        : "Wait for clearer confirmation before taking a fresh trade.";

  const actionPopupEntryDistanceInfo = (() => {
    const spotPrice = Number(
      actionPopupData?.spot?.ltp ||
      actionPopupData?.future?.ltp ||
      0
    );

    const entryPrice = Number(actionPopupTradeSignal?.entry || 0);

    if (!spotPrice || !entryPrice) {
      return {
        points: null,
        pct: null,
        label: "Unavailable",
        tone: "neutral",
      };
    }

    const points = round2(spotPrice - entryPrice);
    const pct = round2((Math.abs(points) / entryPrice) * 100);

    let label = "Near Entry";
    let tone = "support";

    if (pct > 0.6) {
      label = "Stretched";
      tone = "resistance";
    } else if (pct > 0.25) {
      label = "Moderately Away";
      tone = "warning";
    } else if (pct <= 0.1) {
      label = "At Entry";
      tone = "support";
    }

    return { points, pct, label, tone };
  })();

  const actionPopupPremiumExecutionView = getPopupPremiumExecutionData({
    optionChain: actionPopupData?.optionChain || [],
    spot: actionPopupData?.spot || {},
    tradeSignal: actionPopupTradeSignal || {},
  });

  const actionPopupExecutionWarning = (() => {
    const warnings = [];

    const rr = Number(
      actionPopupAnalytics?.selectedTradeAnalysis?.rr ??
      actionPopupAnalytics?.rr ??
      0
    );

    const sessionLabel = String(
      actionPopupAnalytics?.sessionSuitability?.label ||
      actionPopupAnalytics?.sessionSuitability ||
      ""
    ).toLowerCase();

    const ivLabel = String(
      actionPopupAnalytics?.ivStatus?.label ||
      actionPopupAnalytics?.ivStatus ||
      ""
    ).toLowerCase();

    const wallLabel = String(
      actionPopupAnalytics?.wallSupportConfirmation?.label ||
      actionPopupAnalytics?.wallSupportConfirmation ||
      ""
    ).toLowerCase();

    if (rr > 0 && rr < 1.5) {
      warnings.push("Low R:R");
    }

    if (sessionLabel.includes("avoid") || sessionLabel.includes("weak")) {
      warnings.push("Weak Session");
    }

    if (ivLabel.includes("expensive")) {
      warnings.push("Premium Expensive");
    }

    if (wallLabel.includes("weak")) {
      warnings.push("Weak Wall");
    }

    return warnings.length ? warnings.join(" • ") : "No major execution warning";
  })();

  const actionPopupReasonText = (() => {
    if (actionPopupIsRangebound) {
      return "Sideways market. Avoid fresh directional entry until breakout or breakdown confirmation.";
    }

    const parts = [];

    if (actionPopupTradeSignal?.bias) {
      parts.push(`Bias: ${actionPopupTradeSignal.bias}`);
    }

    if (
      actionPopupEntryDistanceInfo?.label &&
      actionPopupEntryDistanceInfo.label !== "Unavailable"
    ) {
      parts.push(`Entry: ${actionPopupEntryDistanceInfo.label}`);
    }

    if (
      isValidNumber(actionPopupTradeSignal?.entry) &&
      isValidNumber(actionPopupData?.spot?.ltp || actionPopupData?.future?.ltp)
    ) {
      const spotNow = Number(
        actionPopupData?.spot?.ltp || actionPopupData?.future?.ltp || 0
      );
      const entryNow = Number(actionPopupTradeSignal.entry || 0);
      const diff = round2(spotNow - entryNow);
      parts.push(`Spot vs Entry: ${diff >= 0 ? "+" : ""}${formatNum(diff)}`);
    }

    if (isValidNumber(actionPopupTradeSignal?.confidence)) {
      parts.push(`Confidence: ${formatNum(actionPopupTradeSignal.confidence)}%`);
    }

    if (isValidNumber(actionPopupPremiumExecutionView?.currentPremium)) {
      parts.push(`Premium: ${displayPrice(actionPopupPremiumExecutionView.currentPremium)}`);
    }

    if (
      actionPopupPremiumExecutionView?.premiumZone &&
      actionPopupPremiumExecutionView.premiumZone !== "-"
    ) {
      parts.push(`Premium Zone: ${actionPopupPremiumExecutionView.premiumZone}`);
    }

    if (actionPopupShowRR) {
      const entry = Number(actionPopupTradeSignal?.entry || 0);
      const target = Number(actionPopupTradeSignal?.target || 0);
      const stoploss = Number(actionPopupTradeSignal?.stoploss || 0);
      const biasTone = getBiasTone(actionPopupTradeSignal?.bias);

      if (entry && target && stoploss) {
        const reward =
          biasTone === "bearish" ? entry - target : target - entry;

        const risk =
          biasTone === "bearish" ? stoploss - entry : entry - stoploss;

        if (reward > 0 && risk > 0) {
          parts.push(`R:R: ${formatNum(reward / risk)}`);
        }
      }
    }

    if (!parts.length) {
      return "Quick action summary.";
    }

    return `${parts.join(" | ")}.`;
  })();

  const actionPopupWarningText = (() => {
    if (actionPopupIsRangebound) {
      return "Rangebound Session • Wait for Breakout/Breakdown";
    }

    const warnings = [];

    if (
      actionPopupEntryDistanceInfo?.label === "Stretched" ||
      actionPopupEntryDistanceInfo?.label === "Moderately Away"
    ) {
      warnings.push("Avoid chasing away from entry");
    }

    if (
      String(actionPopupPremiumExecutionView?.premiumZone || "")
        .toLowerCase()
        .includes("slightly")
    ) {
      warnings.push("Premium slightly expensive");
    }

    if (
      String(actionPopupPremiumExecutionView?.premiumZone || "")
        .toLowerCase()
        .includes("expensive") ||
      String(actionPopupPremiumExecutionView?.premiumAction || "")
        .toLowerCase()
        .includes("avoid")
    ) {
      warnings.push("Premium costly for fresh buy");
    }

    if (isValidNumber(actionPopupTradeSignal?.stoploss)) {
      warnings.push(`Respect stoploss ${displayPrice(actionPopupTradeSignal.stoploss)}`);
    }

    if (
      actionPopupExecutionWarning &&
      actionPopupExecutionWarning !== "No major execution warning"
    ) {
      warnings.push(actionPopupExecutionWarning);
    }

    const uniqueWarnings = [...new Set(warnings)].filter(Boolean);

    return uniqueWarnings.length ? uniqueWarnings.join(" • ") : "";
  })();


  const actionPopupLastUpdated = (() => {
    const rawTs = actionPopupData?.timestamp;

    if (!rawTs) return null;

    const parsed = new Date(rawTs);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }

    return String(rawTs);
  })();

  // console.log("ACTION POPUP tradeSignalPanel", actionPopupTradeSignal);

  // console.log("POPUP analytics", actionPopupAnalytics);
  // console.log("POPUP tradeSignalPanel", actionPopupTradeSignal);
  // console.log("POPUP full card", actionPopupData);

  const mergedHomeCards = useMemo(() => {
    const keys = ["NIFTY", "BANKNIFTY", "SENSEX"];
    const out = {};

    keys.forEach((key) => {
      const base = homeData?.[key] || {};
      const quoteCard = homeIndexQuotes?.[key] || {};
      const analyticsCard = homeIndexAnalytics?.[key] || {};

      const mergedBaseAndQuote = mergeHomeCardPreservingValues(base, quoteCard);

      out[key] = {
        ...mergedBaseAndQuote,
        advanceDecline: hasUsableBreadth({ advanceDecline: base?.advanceDecline })
          ? base.advanceDecline
          : hasUsableBreadth({ advanceDecline: analyticsCard?.advanceDecline })
            ? analyticsCard.advanceDecline
            : hasUsableBreadth({ advanceDecline: quoteCard?.advanceDecline })
              ? quoteCard.advanceDecline
              : {},
        analytics: {
          ...mergeAnalytics(
            base?.analytics || {},
            analyticsCard?.analytics || {},
            {
              advanceDecline: hasUsableBreadth({ advanceDecline: analyticsCard?.advanceDecline })
                ? analyticsCard.advanceDecline
                : hasUsableBreadth({ advanceDecline: quoteCard?.advanceDecline })
                  ? quoteCard.advanceDecline
                  : hasUsableBreadth({ advanceDecline: base?.advanceDecline })
                    ? base.advanceDecline
                    : {},
              breadthStats:
                analyticsCard?.analytics?.breadthStats ||
                quoteCard?.analytics?.breadthStats ||
                base?.analytics?.breadthStats ||
                {},
              fiiDii:
                analyticsCard?.analytics?.fiiDii ||
                quoteCard?.analytics?.fiiDii ||
                base?.analytics?.fiiDii ||
                {},
            }
          ),
          tradeSignalPanel:
            analyticsCard?.analytics?.tradeSignalPanel ||
            quoteCard?.analytics?.tradeSignalPanel ||
            base?.analytics?.tradeSignalPanel ||
            {},
        },
        timestamp:
          quoteCard?.timestamp ||
          analyticsCard?.timestamp ||
          base?.timestamp ||
          "-",
        quickBias:
          analyticsCard?.analytics?.sentiment?.bias ||
          base?.analytics?.sentiment?.bias ||
          base?.quickBias ||
          "Neutral",
      };
    });

    return out;
  }, [homeData, homeIndexQuotes, homeIndexAnalytics]);

  const marketOverview = useMemo(() => {
    const selectedOverview = hasUsableMarketStrip(mergedHomeCards?.NIFTY?.marketStrip)
      ? mergedHomeCards.NIFTY
      : hasUsableMarketStrip(mergedHomeCards?.BANKNIFTY?.marketStrip)
        ? mergedHomeCards.BANKNIFTY
        : hasUsableMarketStrip(mergedHomeCards?.SENSEX?.marketStrip)
          ? mergedHomeCards.SENSEX
          : mergedHomeCards?.NIFTY ||
          mergedHomeCards?.BANKNIFTY ||
          mergedHomeCards?.SENSEX ||
          null;

    return selectedOverview;
  }, [mergedHomeCards]);

  const homeSectors = useMemo(() => {
    return [...(marketOverview?.sectorStrength || [])]
      .filter((item) => isValidNumber(item?.change_pct))
      .sort((a, b) => Number(b?.change_pct) - Number(a?.change_pct));
  }, [marketOverview]);

  const homeSectorAdvanceDecline = useMemo(() => {
    const sectors = Array.isArray(homeSectors) ? homeSectors : [];

    let advances = 0;
    let declines = 0;
    let unchanged = 0;

    sectors.forEach((sector) => {
      const adv = pickFirstUsableNumber(
        sector?.advances,
        sector?.advance
      );

      const total = pickFirstUsableNumber(
        sector?.stocks_count,
        sector?.total
      );

      const unch = pickFirstUsableNumber(
        sector?.unchanged,
        sector?.neutral,
        0
      );

      if (adv !== null && total !== null) {
        advances += Number(adv);
        declines += Math.max(Number(total) - Number(adv) - Number(unch || 0), 0);
        unchanged += Number(unch || 0);
      }
    });

    const total = advances + declines + unchanged;

    return {
      advances,
      declines,
      unchanged,
      total,
      ratio: declines > 0 ? Number((advances / declines).toFixed(2)) : null,
    };
  }, [homeSectors]);
  const homeAdvanceDecline = useMemo(() => {
    const primaryBreadth = getSafeAdvanceDecline(
      marketOverview?.analytics?.breadthStats
    );

    if (Number(primaryBreadth?.total || 0) > 0) {
      return primaryBreadth;
    }

    const niftyBreadth = getSafeAdvanceDecline(
      mergedHomeCards?.NIFTY?.analytics?.breadthStats
    );
    if (Number(niftyBreadth?.total || 0) > 0) {
      return niftyBreadth;
    }

    const bankNiftyBreadth = getSafeAdvanceDecline(
      mergedHomeCards?.BANKNIFTY?.analytics?.breadthStats
    );
    if (Number(bankNiftyBreadth?.total || 0) > 0) {
      return bankNiftyBreadth;
    }

    const sensexBreadth = getSafeAdvanceDecline(
      mergedHomeCards?.SENSEX?.analytics?.breadthStats
    );
    if (Number(sensexBreadth?.total || 0) > 0) {
      return sensexBreadth;
    }

    const fallbackPrimary = getSafeAdvanceDecline(marketOverview?.advanceDecline);
    if (Number(fallbackPrimary?.total || 0) > 0) {
      return fallbackPrimary;
    }

    const fallbackNifty = getSafeAdvanceDecline(mergedHomeCards?.NIFTY?.advanceDecline);
    if (Number(fallbackNifty?.total || 0) > 0) {
      return fallbackNifty;
    }

    const fallbackBankNifty = getSafeAdvanceDecline(
      mergedHomeCards?.BANKNIFTY?.advanceDecline
    );
    if (Number(fallbackBankNifty?.total || 0) > 0) {
      return fallbackBankNifty;
    }

    const fallbackSensex = getSafeAdvanceDecline(mergedHomeCards?.SENSEX?.advanceDecline);
    if (Number(fallbackSensex?.total || 0) > 0) {
      return fallbackSensex;
    }

    return {
      advances: 0,
      declines: 0,
      unchanged: 0,
      total: 0,
      ratio: null,
    };
  }, [marketOverview, mergedHomeCards]);

  const homeSentiment = useMemo(() => {
    return (
      marketOverview?.analytics?.sentiment ||
      mergedHomeCards?.NIFTY?.analytics?.sentiment ||
      mergedHomeCards?.BANKNIFTY?.analytics?.sentiment ||
      mergedHomeCards?.SENSEX?.analytics?.sentiment ||
      {}
    );
  }, [marketOverview, mergedHomeCards]);



  useEffect(() => {
    if (!actionPopupOpen || !actionPopupSymbol) return;

    setActionPopupData((prev) => {
      if (prev?.analytics?.tradeSignalPanel) return prev;
      return mergedHomeCards?.[actionPopupSymbol] || prev || null;
    });
  }, [actionPopupOpen, actionPopupSymbol, mergedHomeCards]);

  const homeMarketStrip = useMemo(() => {
    const stripSource = hasUsableMarketStrip(fastMarketStrip)
      ? fastMarketStrip
      : marketOverview?.marketStrip || [];

    const filtered = [...(stripSource || [])]
      .filter(
        (item) =>
          String(item?.label || "").toUpperCase() !== "INDIA VIX" &&
          !String(item?.label || "").toUpperCase().includes("GIFT NIFTY")
      )
      .filter(
        (item) =>
          isValidNumber(item?.ltp) ||
          isValidNumber(item?.change) ||
          isValidNumber(item?.change_pct)
      );

    const preferredOrder = [
      "NIFTY 50",
      "NIFTY BANK",
      "SENSEX",
      "NIFTY SMALLCAP 100",
      "NIFTY FIN SERVICE",
      "NIFTY MIDCAP 100",
    ];

    return filtered.sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a?.label);
      const bIndex = preferredOrder.indexOf(b?.label);

      const safeA = aIndex === -1 ? 999 : aIndex;
      const safeB = bIndex === -1 ? 999 : bIndex;

      return safeA - safeB;
    });
  }, [fastMarketStrip, marketOverview]);

  const maxAbsSectorRotation = useMemo(() => {
    return Math.max(
      ...sectorRotation.map((x) => Math.abs(Number(x?.change_pct || 0))),
      1
    );
  }, [sectorRotation]);

  const themeClass = `terminal ${theme === "light" ? "light" : "dark"}${view === "home" ? " home-view" : ""}`;

  const tradeBiasTone = getBiasTone(tradeSignalPanel?.bias);
  const bullishBiasScore = Number(biasScores?.bullish || 0);
  const bearishBiasScore = Number(biasScores?.bearish || 0);

  const homeNow = new Date();
  const homeDate = homeNow.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const homeTime = homeNow.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const niftyStripItem = useMemo(
    () => getStripItemByCardName(homeMarketStrip, "NIFTY"),
    [homeMarketStrip]
  );

  const bankNiftyStripItem = useMemo(
    () => getStripItemByCardName(homeMarketStrip, "BANKNIFTY"),
    [homeMarketStrip]
  );

  const sensexStripItem = useMemo(
    () => getStripItemByCardName(homeMarketStrip, "SENSEX"),
    [homeMarketStrip]
  );
  const currentPcrHistory = pcrHistory?.[symbol] || [];

  const vwapDecisionData = useMemo(() => {
    return getVwapDecisionData({
      analytics,
      spot,
      future,
      safeDetailData,
      bias: tradeSignalPanel?.bias,
    });
  }, [analytics, spot, future, safeDetailData, tradeSignalPanel]);

  const entryDistanceInfo = useMemo(() => {
    return getEntryDistanceInfo(
      spot?.ltp,
      tradeSignalPanel?.entry
    );
  }, [spot, tradeSignalPanel]);


  const breakoutStatus = useMemo(() => {
    return getBreakoutConfirmationStatus({
      breakoutBreakdown,
      entryTiming,
    });
  }, [breakoutBreakdown, entryTiming]);

  const chaseWarning = useMemo(() => {
    return getChaseWarning(entryTiming, tradeSignalPanel);
  }, [entryTiming, tradeSignalPanel]);

  const wallSupportConfirmation = useMemo(() => {
    return getWallSupportConfirmation({
      tradeSignalPanel,
      analytics,
      bestStrike: bestStrikes?.bestStrike,
    });
  }, [tradeSignalPanel, analytics, bestStrikes]);

  const selectedTradeAnalysisRef = useRef(null);

  const selectedTradeAnalysis = useMemo(() => {
    const nextValue = evaluateSelectedOption({
      option: bestStrikes?.bestStrike || null,
      tradeSignalPanel,
      spotPrice: Number(spot?.ltp || 0),
      chainRows: displayChain,
      wallSupportConfirmation,
      entryTiming,
    });

    const isUsable =
      nextValue &&
      (
        Number(nextValue?.premium || 0) > 0 ||
        Number(nextValue?.liquidityScore || 0) > 0 ||
        Number(nextValue?.rr || 0) > 0 ||
        (nextValue?.decision && nextValue?.decision !== "No Trade")
      );

    if (isUsable) {
      selectedTradeAnalysisRef.current = nextValue;
      return nextValue;
    }

    return (
      selectedTradeAnalysisRef.current || {
        premium: 0,
        iv: 0,
        liquidityScore: 0,
        buyQualityScore: 0,
        finalTradeQuality: 0,
        rr: 0,
        expectedReward: 0,
        expectedRisk: 0,
        ivSuitability: { label: "N/A", tone: "neutral", score: 0 },
        premiumSuitability: { label: "N/A", tone: "neutral", score: 0 },
        decision: "No Trade",
        decisionTone: "bearish",
        noTrade: true,
        noTradeReason: "Waiting for valid option data.",
        noTradeReasons: ["Waiting for valid option data."],
      }
    );
  }, [
    bestStrikes,
    tradeSignalPanel,
    spot,
    displayChain,
    wallSupportConfirmation,
    entryTiming,
  ]);
  const buyerChecklist = useMemo(() => {
    return getBuyerChecklist({
      tradeSignalPanel,
      selectedTradeAnalysis,
    });
  }, [tradeSignalPanel, selectedTradeAnalysis]);

  const premiumProjection = useMemo(() => {
    return getPremiumProjection(selectedTradeAnalysis);
  }, [selectedTradeAnalysis]);

  const ivStatus = useMemo(() => {
    return getIVStatus(bestStrikes?.bestStrike, selectedTradeAnalysis);
  }, [bestStrikes, selectedTradeAnalysis]);

  const thetaRisk = useMemo(() => {
    return getThetaRisk(bestStrikes?.bestStrike, displayATMStrike);
  }, [bestStrikes, displayATMStrike]);


  const buyerSetupQuality = useMemo(() => {
    return getBuyerSetupQuality({
      tradeSignalPanel,
      marketRegime,
      smartOIFlow,
      selectedTradeAnalysis,
    });
  }, [tradeSignalPanel, marketRegime, smartOIFlow, selectedTradeAnalysis]);

  const momentumStrength = useMemo(() => {
    return getMomentumStrength({
      marketRegime,
      smartOIFlow,
      breakoutBreakdown,
      biasScores,
    });
  }, [marketRegime, smartOIFlow, breakoutBreakdown, biasScores]);

  const entryZoneStatus = useMemo(() => {
    return getEntryZoneStatus({
      spotPrice: spot?.ltp,
      entryPrice: tradeSignalPanel?.entry,
    });
  }, [spot, tradeSignalPanel]);

  const premiumBuyZone = useMemo(() => {
    return getPremiumBuyZone(selectedTradeAnalysis);
  }, [selectedTradeAnalysis]);
  const premiumExecutionView = useMemo(() => {
    const currentPremium = Number(selectedTradeAnalysis?.premium || 0);
    const targetPremium = Number(premiumProjection?.targetPremium || 0);
    const stopPremium = Number(premiumProjection?.stopPremium || 0);
    const upsidePct = Number(premiumProjection?.upsidePct || 0);
    const downsidePct = Number(premiumProjection?.downsidePct || 0);

    let premiumAction = "Wait";
    let premiumTone = "neutral";

    if (
      !selectedTradeAnalysis?.noTrade &&
      currentPremium > 0 &&
      premiumBuyZone?.label === "Within Buy Zone"
    ) {
      premiumAction = "Premium OK";
      premiumTone = "support";
    } else if (
      currentPremium > 0 &&
      premiumBuyZone?.label === "Slightly Expensive"
    ) {
      premiumAction = "Slightly Expensive";
      premiumTone = "warning";
    } else if (
      currentPremium > 0 &&
      premiumBuyZone?.label === "Too Expensive"
    ) {
      premiumAction = "Avoid Premium";
      premiumTone = "resistance";
    }

    return {
      currentPremium,
      targetPremium,
      stopPremium,
      upsidePct,
      downsidePct,
      premiumAction,
      premiumTone,
    };
  }, [selectedTradeAnalysis, premiumProjection, premiumBuyZone]);
  const exitPlan = useMemo(() => {
    return getExitPlan(selectedTradeAnalysis, tradeSignalPanel);
  }, [selectedTradeAnalysis, tradeSignalPanel]);

  const holdingAdvice = useMemo(() => {
    return getHoldingAdvice(
      thetaRisk,
      selectedTradeAnalysis?.premiumSuitability
    );
  }, [thetaRisk, selectedTradeAnalysis]);

  const directionConfirmation = useMemo(() => {
    return getDirectionConfirmation({
      tradeSignalPanel,
      breakoutBreakdown,
      marketRegime,
      wallSupportConfirmation,
      momentumStrength,
    });
  }, [
    tradeSignalPanel,
    breakoutBreakdown,
    marketRegime,
    wallSupportConfirmation,
    momentumStrength,
  ]);

  const premiumMomentum = useMemo(() => {
    return getPremiumMomentum(bestStrikes?.bestStrike || {});
  }, [bestStrikes]);

  const spotMoveNeeded = useMemo(() => {
    return getSpotMoveNeeded({
      spotPrice: spot?.ltp,
      targetPrice: tradeSignalPanel?.target,
      bias: tradeSignalPanel?.bias,
    });
  }, [spot, tradeSignalPanel]);

  const sessionSuitabilityRef = useRef({
    label: "Selective Only",
    tone: "neutral",
    detail: "Trade only if execution is clean.",
  });

  const sessionSuitability = useMemo(() => {
    const nextValue = getSessionSuitability({
      marketRegime,
      breakoutBreakdown,
      momentumStrength,
      tradeAnalysis: selectedTradeAnalysis,
    });

    if (nextValue?.label && nextValue?.label !== "Unavailable") {
      sessionSuitabilityRef.current = nextValue;
      return nextValue;
    }

    return sessionSuitabilityRef.current;
  }, [marketRegime, breakoutBreakdown, momentumStrength, selectedTradeAnalysis]);
  const buyerActionBoxRef = useRef(null);

  const overviewBiasText = tradeSignalPanel?.bias || "-";

  const overviewMarketTypeText =
    marketRegime?.label ||
    marketRegime?.regime ||
    "-";

  const overviewPrimaryType =
    overviewMarketTypeText && overviewMarketTypeText !== "-"
      ? overviewMarketTypeText
      : overviewBiasText;

  const overviewIsNeutralState =
    String(tradeSignalPanel?.bias || "").toLowerCase().includes("neutral") ||
    String(tradeSignalPanel?.bias || "").toLowerCase().includes("sideways") ||
    String(tradeSignalPanel?.bias || "").toLowerCase().includes("range") ||
    String(buyerActionBoxRef.current?.action || "").toLowerCase().includes("wait") ||
    !!selectedTradeAnalysis?.noTrade;

  const showOverviewEntry =
    isValidNumber(tradeSignalPanel?.entry);

  const showOverviewTarget =
    !overviewIsNeutralState &&
    isValidNumber(tradeSignalPanel?.target) &&
    displayPrice(tradeSignalPanel?.target) !== "-";

  const showOverviewStoploss =
    !overviewIsNeutralState &&
    isValidNumber(tradeSignalPanel?.stoploss) &&
    displayPrice(tradeSignalPanel?.stoploss) !== "-";

  const showOverviewBestStrike =
    !overviewIsNeutralState &&
    !!bestStrikes?.bestStrike?.strike;

  const showOverviewPremium =
    !overviewIsNeutralState &&
    isValidNumber(selectedTradeAnalysis?.premium) &&
    Number(selectedTradeAnalysis?.premium) > 0;

  const showOverviewIvStatus =
    !overviewIsNeutralState &&
    ivStatus?.label &&
    ivStatus?.label !== "-" &&
    ivStatus?.label !== "N/A";

  const showOverviewLiquidity =
    !overviewIsNeutralState &&
    isValidNumber(selectedTradeAnalysis?.liquidityScore) &&
    Number(selectedTradeAnalysis?.liquidityScore) > 0 &&
    Number(selectedTradeAnalysis?.liquidityScore) !== 100;

  const showOverviewRR =
    !overviewIsNeutralState &&
    isValidNumber(selectedTradeAnalysis?.rr) &&
    Number(selectedTradeAnalysis?.rr) > 0;

  const showOverviewTradeQuality =
    !overviewIsNeutralState &&
    isValidNumber(selectedTradeAnalysis?.finalTradeQuality) &&
    Number(selectedTradeAnalysis?.finalTradeQuality) > 0;

  const showOverviewConfidence =
    isValidNumber(tradeSignalPanel?.confidence);

  const buyerActionBox = useMemo(() => {
    const nextValue = getBuyerActionBox({
      tradeAnalysis: selectedTradeAnalysis,
      entryZoneStatus,
      directionConfirmation,
      premiumBuyZone,
    });

    if (nextValue?.action) {
      buyerActionBoxRef.current = nextValue;
      return nextValue;
    }

    return (
      buyerActionBoxRef.current || {
        action: "Wait",
        tone: "warning",
        reason: "Waiting for stable setup data.",
        plan: "Wait for better location or stronger confirmation.",
      }
    );
  }, [selectedTradeAnalysis, entryZoneStatus, directionConfirmation, premiumBuyZone]);
    const autoSignalPopupLastKeyRef = useRef("");

const shouldAutoOpenSignalPopup = useMemo(() => {
  const hasDirectionalBias =
    String(tradeSignalPanel?.bias || "").toLowerCase().includes("bull") ||
    String(tradeSignalPanel?.bias || "").toLowerCase().includes("bear");

  const hasEntry =
    tradeSignalPanel?.entry !== null &&
    tradeSignalPanel?.entry !== undefined &&
    String(tradeSignalPanel?.entry).trim() !== "";

  const directionOk =
    directionConfirmation?.label === "Yes" ||
    directionConfirmation?.label === "Partial";

  const entryOk =
    entryZoneStatus?.label === "At Entry" ||
    entryZoneStatus?.label === "Near Entry";

  console.log(
    "AUTO POPUP CONDITIONS",
    "hasDirectionalBias:", hasDirectionalBias,
    "| hasEntry:", hasEntry,
    "| directionOk:", directionOk,
    "| entryOk:", entryOk,
    "| bias:", tradeSignalPanel?.bias,
    "| entry:", tradeSignalPanel?.entry,
    "| directionLabel:", directionConfirmation?.label,
    "| entryZoneLabel:", entryZoneStatus?.label
  );

  return (
  hasDirectionalBias &&
  hasEntry &&
  directionOk &&
  entryZoneStatus?.label === "At Entry"
);
}, [
  directionConfirmation?.label,
  entryZoneStatus?.label,
  tradeSignalPanel?.bias,
  tradeSignalPanel?.entry,
]);
useEffect(() => {
  autoSignalPopupLastKeyRef.current = "";
}, [symbol]);

useEffect(() => {
  if (!actionPopupOpen) return;
  console.log("POPUP STATE OPEN", {
    actionPopupOpen,
    actionPopupSymbol,
    actionPopupData,
  });
}, [actionPopupOpen, actionPopupSymbol, actionPopupData]);
useEffect(() => {
  if (view !== "detail") return;
  if (!shouldAutoOpenSignalPopup) return;
  if (actionPopupOpen) return;

  console.log("AUTO POPUP CHECK PASSED", {
    buyerAction: buyerActionBox?.action,
    directionConfirmation: directionConfirmation?.label,
    entryZoneStatus: entryZoneStatus?.label,
    premiumBuyZone: premiumBuyZone?.label,
    noTrade: selectedTradeAnalysis?.noTrade,
    bias: tradeSignalPanel?.bias,
    entry: tradeSignalPanel?.entry,
    symbol,
    safeDetailData,
  });

  const nextSignalKey = [
    symbol || "",
    tradeSignalPanel?.bias || "",
    tradeSignalPanel?.entry || "",
    bestStrikes?.bestStrike?.side || "",
    bestStrikes?.bestStrike?.strike || "",
    selectedTradeAnalysis?.premium || "",
  ].join("|");

  if (!nextSignalKey) return;
  if (autoSignalPopupLastKeyRef.current === nextSignalKey) return;

  autoSignalPopupLastKeyRef.current = nextSignalKey;

  const popupPayload = {
    ...(safeDetailData || {}),
    analytics: {
      ...((safeDetailData || {}).analytics || {}),
    },
  };

  setActionPopupSymbol(symbol);
  setActionPopupData(popupPayload);

  console.log("AUTO POPUP OPENING NOW");

playSignalBeep();
playSignalBeep(signalTone);
setActionPopupOpen(true);
}, [
  view,
  symbol,
  safeDetailData,
  shouldAutoOpenSignalPopup,
  buyerActionBox?.action,
  directionConfirmation?.label,
  entryZoneStatus?.label,
  premiumBuyZone?.label,
  selectedTradeAnalysis,
  tradeSignalPanel,
  bestStrikes,
  actionPopupOpen,
  signalTone,

]);
  const overviewRiskWarnings = useMemo(() => {
    const warnings = [];

    if (selectedTradeAnalysis?.noTradeReason) {
      warnings.push(selectedTradeAnalysis.noTradeReason);
    }

    if (
      String(chaseWarning?.label || "").toLowerCase().includes("avoid") ||
      String(chaseWarning?.label || "").toLowerCase().includes("late")
    ) {
      warnings.push(chaseWarning.label);
    }

    if (
      String(ivStatus?.label || "").toLowerCase().includes("expensive")
    ) {
      warnings.push(`IV ${ivStatus.label}`);
    }

    if (
      String(thetaRisk?.label || "").toLowerCase().includes("high")
    ) {
      warnings.push(`Theta ${thetaRisk.label}`);
    }

    if (
      Number(selectedTradeAnalysis?.rr || 0) > 0 &&
      Number(selectedTradeAnalysis?.rr || 0) < 1.5
    ) {
      warnings.push("Low R:R");
    }

    if (
      String(sessionSuitability?.label || "").toLowerCase().includes("avoid") ||
      String(sessionSuitability?.label || "").toLowerCase().includes("weak")
    ) {
      warnings.push(sessionSuitability.label);
    }

    if (
      String(directionConfirmation?.label || "").toLowerCase() === "no"
    ) {
      warnings.push("Direction Not Confirmed");
    }

    return [...new Set(warnings)].slice(0, 4);
  }, [
    selectedTradeAnalysis,
    chaseWarning,
    ivStatus,
    thetaRisk,
    sessionSuitability,
    directionConfirmation,
  ]);

  const overviewReasonText = useMemo(() => {
    if (selectedTradeAnalysis?.noTrade) {
      return (
        selectedTradeAnalysis?.noTradeReason ||
        buyerActionBox?.reason ||
        "No clean setup available."
      );
    }

    const parts = [];

    if (tradeSignalPanel?.bias) parts.push(`Bias: ${tradeSignalPanel.bias}`);
    if (breakoutBreakdown?.signal) parts.push(`Structure: ${breakoutBreakdown.signal}`);
    if (momentumStrength?.label) parts.push(`Momentum: ${momentumStrength.label}`);
    if (wallSupportConfirmation?.label) parts.push(`Wall: ${wallSupportConfirmation.label}`);
    if (entryZoneStatus?.label) parts.push(`Entry: ${entryZoneStatus.label}`);

    return parts.length
      ? parts.join(" | ")
      : buyerActionBox?.reason || "Setup under evaluation.";
  }, [
    selectedTradeAnalysis,
    buyerActionBox,
    tradeSignalPanel,
    breakoutBreakdown,
    momentumStrength,
    wallSupportConfirmation,
    entryZoneStatus,
  ]);

  const sessionBiasProbabilities = useMemo(() => {
    return getSessionBiasProbabilities(biasScores);
  }, [biasScores]);

  const previousDayLevels = analytics?.previousDayLevels || {};

  const previousDayOpenValue = pickFirstUsableNumber(
    analytics?.previousDayOpen,
    previousDayLevels?.open
  );

  const previousDayHighValue = pickFirstUsableNumber(
    analytics?.previousDayHigh,
    previousDayLevels?.high
  );

  const previousDayLowValue = pickFirstUsableNumber(
    analytics?.previousDayLow,
    previousDayLevels?.low
  );

  const previousDayCloseValue = pickFirstUsableNumber(
    analytics?.previousDayClose,
    previousDayLevels?.close
  );

  const previousDayPivotValue = pickFirstUsableNumber(
    analytics?.previousDayPivot,
    previousDayLevels?.pivot
  );

  const previousDayCprTopValue = pickFirstUsableNumber(
    analytics?.previousDayCprTop,
    previousDayLevels?.cprTop
  );

  const previousDayCprBottomValue = pickFirstUsableNumber(
    analytics?.previousDayCprBottom,
    previousDayLevels?.cprBottom
  );

  const previousDayR1Value = pickFirstUsableNumber(
    analytics?.previousDayR1,
    previousDayLevels?.r1
  );

  const previousDayS1Value = pickFirstUsableNumber(
    analytics?.previousDayS1,
    previousDayLevels?.s1
  );

  const previousDayR2Value = pickFirstUsableNumber(
    analytics?.previousDayR2,
    previousDayLevels?.r2
  );

  const previousDayS2Value = pickFirstUsableNumber(
    analytics?.previousDayS2,
    previousDayLevels?.s2
  );

  const previousDayTodayPosition =
    previousDayLevels?.todayPosition ||
    analytics?.previousDayTodayPosition ||
    "-";

  const previousDayTurningSignal =
    previousDayLevels?.turningSignal ||
    analytics?.previousDayTurningSignal ||
    "-";

  const previousDayCprRangeText =
    isValidNumber(previousDayCprBottomValue) && isValidNumber(previousDayCprTopValue)
      ? `${displayPrice(previousDayCprBottomValue)} - ${displayPrice(previousDayCprTopValue)}`
      : "-";

  useEffect(() => {
    if (view !== "detail") return;
    if (!isValidNumber(analytics?.pcr)) return;

    const intervalMs = 5 * 60 * 1000;
    const now = Date.now();
    const bucketTs = Math.floor(now / intervalMs) * intervalMs;

    setPcrHistory((prev) => {
      const prevRows = Array.isArray(prev?.[symbol]) ? prev[symbol] : [];
      const lastRow = prevRows[prevRows.length - 1];

      if (lastRow && Number(lastRow.bucketTs) === bucketTs) {
        return prev;
      }

      const currentPcr = Number(analytics?.pcr);
      const prevPcr = lastRow?.pcr ?? null;

      const change =
        prevPcr !== null ? Number((currentPcr - prevPcr).toFixed(2)) : null;

      const trend =
        change === null
          ? "Start"
          : change > 0
            ? "Rising"
            : change < 0
              ? "Falling"
              : "Flat";

      let side = "NEUTRAL";
      if (currentPcr >= 1.0) side = "PUT SIDE";
      else if (currentPcr < 1.0) side = "CALL SIDE";

      const interpretation = getPcrInterpretation(currentPcr, trend);

      const nextRow = {
        ts: now,
        bucketTs,
        time: new Date(now).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        pcr: currentPcr,
        change,
        trend,
        side,
        interpretation: interpretation.label,
        tone: interpretation.tone,
      };

      return {
        ...prev,
        [symbol]: [...prevRows, nextRow].slice(-20),
      };
    });
  }, [view, symbol, analytics?.pcr]);

  function openTerminal(selectedSymbol, defaultTab = "Overview") {
    setSymbol(selectedSymbol);
    setTerminalTab(defaultTab);
    setView("detail");
  }

  async function openActionPopup(selectedSymbol) {
    setActionPopupSymbol(selectedSymbol);
    setActionPopupOpen(true);
    console.log("MANUAL POPUP OPENING NOW");
    setActionPopupLoading(true);

    const fallbackCard = mergedHomeCards?.[selectedSymbol] || null;
    setActionPopupData(fallbackCard);

    try {
      const fullData = await fetchOneDashboard(selectedSymbol);

      setActionPopupData((prev) => ({
        ...(prev || {}),
        ...(fullData || {}),
        analytics: {
          ...(prev?.analytics || {}),
          ...(fullData?.analytics || {}),
        },
      }));
    } catch (e) {
      console.error("openActionPopup error:", e);
    } finally {
      setActionPopupLoading(false);
    }
  }

  function closeActionPopup() {
    setActionPopupOpen(false);
    setActionPopupSymbol("");
    setActionPopupData(null);
    setActionPopupLoading(false);
  }

  function goHome() {
    setView("home");
  }

  return (
    <div className={themeClass}>
      <div className="page-wrap">
        <div className="terminal-shell">
          <header className="topbar">
            <div className="topbar-left">
              <div className="brand-block">
                <div className="brand-title">Index & Futures Analysis Dashboard</div>
                <div className="brand-subtitle">

                </div>
              </div>
            </div>

            <div className="topbar-center">
              {view === "detail" ? (
                <div className="topbar-mini-stat">
                  <span className="topbar-mini-label">{safeDetailData?.label || symbol}</span>
                  <div className="topbar-mini-vix-row">
                    <span className={`topbar-mini-value ${classBySign(safeSpot?.change, "up", "down")}`}>
                      {displayPrice(safeSpot?.ltp)}
                    </span>

                    <span
                      className={`topbar-mini-change ${classBySign(
                        safeSpot?.change,
                        "up",
                        "down"
                      )}`}
                    >
                      {isValidNumber(safeSpot?.change)
                        ? `${formatNum(safeSpot.change)} (${displayPct(safeSpot?.change_pct)})`
                        : "-"}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="topbar-mini-stat">
                <span className="topbar-mini-label">Date</span>
                <span className="topbar-mini-value">{homeDate}</span>
              </div>

              <div className="topbar-mini-stat">
                <span className="topbar-mini-label">Time</span>
                <span className="topbar-mini-value">{homeTime}</span>
              </div>

              <div className="topbar-mini-stat topbar-mini-vix">
                <span className="topbar-mini-label">India VIX</span>

                <div className="topbar-mini-vix-row">
                  <span className="topbar-mini-value">
                    {displayPrice(
                      fastVix?.ltp ??
                      homeData?.NIFTY?.vix?.ltp ??
                      homeData?.BANKNIFTY?.vix?.ltp ??
                      homeData?.SENSEX?.vix?.ltp
                    )}
                  </span>

                  <span

                    className={`topbar-mini-change ${classBySign(
                      fastVix?.change ??
                      homeData?.NIFTY?.vix?.change ??
                      homeData?.BANKNIFTY?.vix?.change ??
                      homeData?.SENSEX?.vix?.change,
                      "up",
                      "down"
                    )}`}
                  >
                    {isValidNumber(
                      fastVix?.change ??
                      homeData?.NIFTY?.vix?.change ??
                      homeData?.BANKNIFTY?.vix?.change ??
                      homeData?.SENSEX?.vix?.change
                    )
                      ? `${formatNum(
                        fastVix?.change ??
                        homeData?.NIFTY?.vix?.change ??
                        homeData?.BANKNIFTY?.vix?.change ??
                        homeData?.SENSEX?.vix?.change
                      )} (${displayPct(
                        fastVix?.change_pct ??
                        homeData?.NIFTY?.vix?.change_pct ??
                        homeData?.BANKNIFTY?.vix?.change_pct ??
                        homeData?.SENSEX?.vix?.change_pct
                      )})`
                      : "-"}
                  </span>
                </div>
              </div>
            </div>

            <div className="topbar-right">
              <button
                className="control-btn"
                onClick={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
              >
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </button>
              <select
  className="control-btn"
  value={signalTone}
  onChange={(e) => setSignalTone(e.target.value)}
>
  <option value="loud_beep">Loud Beep</option>
  <option value="soft_beep">Soft Beep</option>
  <option value="double_beep">Double Beep</option>
  <option value="triple_beep">Triple Beep</option>
  <option value="siren">Siren</option>
  <option value="bell">Bell</option>
</select>
              <button
                className={`control-btn ${autoRefresh ? "on" : ""}`}
                onClick={() => setAutoRefresh((prev) => !prev)}

              >
                Auto Refresh: {autoRefresh ? "ON" : "OFF"}
              </button>

              <button
                className="control-btn"
                onClick={async () => {
                  setManualRefreshing(true);

                  try {
                    if (view === "home") {
                      await Promise.all([
                        fetchFastMarketStrip(),
                        refreshHomeIndexQuotes(),
                        refreshHomeIndexAnalytics(),
                        fetchHomeDashboard(true),
                      ]);
                    } else {
                      await fetchDashboard(symbol, true);
                    }

                  } finally {
                    setTimeout(() => setManualRefreshing(false), 500);
                  }
                }}
              >
                {manualRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </header>

          {err ? <div className="status-box error">{err}</div> : null}
          {manualRefreshing ? (
            <div className="status-box info">Manual refresh in progress...</div>
          ) : null}

          {view === "home" ? (
            <>
              {homeLoading &&
                !hasAnyValidHomeDashboard(homeData) &&
                !hasUsableMarketStrip(homeData?.NIFTY?.marketStrip) &&
                !hasUsableMarketStrip(homeData?.BANKNIFTY?.marketStrip) &&
                !hasUsableMarketStrip(homeData?.SENSEX?.marketStrip) ? (
                <div className="status-box info">Loading dashboard summary...</div>
              ) : null}

              {homeMarketStrip.length ? (
                <section className="market-strip market-strip-home-row">
                  {homeMarketStrip.map((item, index) => (
                    <MarketStripItem
                      key={`${item?.label}-${index}`}
                      label={item?.label}
                      value={displayPrice(item?.ltp)}
                      change={item?.change}
                      changePct={item?.change_pct}
                      type="price"
                    />
                  ))}
                </section>
              ) : null}

              <section className="home-top-insight-grid home-top-insight-grid-compact">
                <HomeBreadthMoodCombo
                  ad={homeSectorAdvanceDecline}
                  sentiment={homeSentiment}
                />

                <div className="home-top-sector">
                  <HomeSectorOverviewWidget sectors={homeSectors} />
                </div>
              </section>

              <section className="home-hero home-hero-compact">
                <div className="home-hero-left">
                  <h2>Indices Overview</h2>
                  <p>{/* Select an Indices to View. */}</p>
                </div>
              </section>

              <section className="home-compact-grid home-compact-grid-tight">
                <HomeCompactIndexCard
                  name="NIFTY"
                  data={mergedHomeCards.NIFTY}
                  stripItem={niftyStripItem}
                  onOpen={(type) =>
                    type === "action"
                      ? openActionPopup("NIFTY")
                      : openTerminal("NIFTY", "Overview")
                  }
                />

                <HomeCompactIndexCard
                  name="BANKNIFTY"
                  data={mergedHomeCards.BANKNIFTY}
                  stripItem={bankNiftyStripItem}
                  onOpen={(type) =>
                    type === "action"
                      ? openActionPopup("BANKNIFTY")
                      : openTerminal("BANKNIFTY", "Overview")
                  }
                />

                <HomeCompactIndexCard
                  name="SENSEX"
                  data={mergedHomeCards.SENSEX}
                  stripItem={sensexStripItem}
                  onOpen={(type) =>
                    type === "action"
                      ? openActionPopup("SENSEX")
                      : openTerminal("SENSEX", "Overview")
                  }
                />
              </section>

            </>
          ) : (
            <>
              <div className="detail-toolbar">
                <div className="detail-toolbar-left">
                  <button className="control-btn" onClick={goHome}>
                    ← Back to Dashboard
                  </button>

                  <div className="symbol-switch">
                    {["NIFTY", "BANKNIFTY", "SENSEX"].map((item) => (
                      <button
                        key={item}
                        className={`switch-btn ${symbol === item ? "active" : ""}`}
                        onClick={() => {
                          setSymbol(item);
                          setTerminalTab("Overview");
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!data && loading ? (
                <div className="status-box info">Loading terminal data...</div>
              ) : null}

              {safeDetailData ? (
                <>
                  <section className="terminal-tabs">
                    {["Overview", "Options"].map((tab) => (
                      <button
                        key={tab}
                        className={`terminal-tab-btn ${terminalTab === tab ? "active" : ""}`}
                        onClick={() => setTerminalTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </section>

                  <section className="grid">
                    <div className="panel">
                      <div className="panel-header">
                        <h3>Key Trading Levels</h3>
                      </div>

                      <div className="levels-grid key-levels-grid">
                        <MiniLevelPill
                          label="Spot Price"
                          value={displayPrice(spot?.ltp)}
                          type="neutral"
                        />

                        <MiniLevelPill
                          label="Futures Price"
                          value={displayPrice(future?.ltp)}
                          type="neutral"
                        />

                        <MiniLevelPill
                          label="VWAP"
                          value={displayPrice(getSafeVwap(analytics, spot, future, safeDetailData))}
                          type="neutral"
                        />

                        <MiniLevelPill
                          label="Support 1"
                          value={
                            isValidNumber(normalizedSupports?.[0])
                              ? displayPrice(normalizedSupports[0])
                              : "-"
                          }
                          type="support"
                        />

                        <MiniLevelPill
                          label="Support 2"
                          value={
                            isValidNumber(normalizedSupports?.[1])
                              ? displayPrice(normalizedSupports[1])
                              : "-"
                          }
                          type="support"
                        />

                        <MiniLevelPill
                          label="Support 3"
                          value={
                            isValidNumber(normalizedSupports?.[2])
                              ? displayPrice(normalizedSupports[2])
                              : "-"
                          }
                          type="support"
                        />

                        <MiniLevelPill
                          label="Resistance 1"
                          value={
                            isValidNumber(normalizedResistances?.[0])
                              ? displayPrice(normalizedResistances[0])
                              : "-"
                          }
                          type="resistance"
                        />

                        <MiniLevelPill
                          label="Resistance 2"
                          value={
                            isValidNumber(normalizedResistances?.[1])
                              ? displayPrice(normalizedResistances[1])
                              : "-"
                          }
                          type="resistance"
                        />

                        <MiniLevelPill
                          label="Resistance 3"
                          value={
                            isValidNumber(normalizedResistances?.[2])
                              ? displayPrice(normalizedResistances[2])
                              : "-"
                          }
                          type="resistance"
                        />
                      </div>
                    </div>
                  </section>

                  {terminalTab === "Overview" && (
                    <section className="grid">
                      <div className="panel">
                        <div className="panel-header">
                          <h3>Previous Day Levels</h3>
                        </div>

                        <div className="levels-grid key-levels-grid">
                          <MiniLevelPill
                            label="PD Open"
                            value={displayPrice(previousDayOpenValue)}
                            type="neutral"
                          />

                          <MiniLevelPill
                            label="PD High"
                            value={displayPrice(previousDayHighValue)}
                            type="resistance"
                          />

                          <MiniLevelPill
                            label="PD Low"
                            value={displayPrice(previousDayLowValue)}
                            type="support"
                          />

                          <MiniLevelPill
                            label="PD Close"
                            value={displayPrice(previousDayCloseValue)}
                            type="neutral"
                          />

                          <MiniLevelPill
                            label="Pivot"
                            value={displayPrice(previousDayPivotValue)}
                            type="warning"
                          />

                          <MiniLevelPill
                            label="CPR"
                            value={previousDayCprRangeText}
                            type="neutral"
                          />

                          <MiniLevelPill
                            label="R1 / S1"
                            value={
                              isValidNumber(previousDayR1Value) || isValidNumber(previousDayS1Value)
                                ? `${displayPrice(previousDayR1Value)} / ${displayPrice(previousDayS1Value)}`
                                : "-"
                            }
                            type="neutral"
                          />

                          <MiniLevelPill
                            label="R2 / S2"
                            value={
                              isValidNumber(previousDayR2Value) || isValidNumber(previousDayS2Value)
                                ? `${displayPrice(previousDayR2Value)} / ${displayPrice(previousDayS2Value)}`
                                : "-"
                            }
                            type="neutral"
                          />

                          <MiniLevelPill
                            label="Today Position"
                            value={previousDayTodayPosition || "-"}
                            type={
                              String(previousDayTodayPosition || "").toLowerCase().includes("above previous day high")
                                ? "support"
                                : String(previousDayTodayPosition || "").toLowerCase().includes("below previous day low")
                                  ? "resistance"
                                  : String(previousDayTodayPosition || "").toLowerCase().includes("above previous close")
                                    ? "support"
                                    : String(previousDayTodayPosition || "").toLowerCase().includes("below previous close")
                                      ? "resistance"
                                      : "neutral"
                            }
                          />

                          <MiniLevelPill
                            label="Turning Signal"
                            value={previousDayTurningSignal || "-"}
                            type={
                              String(previousDayTurningSignal || "").toLowerCase().includes("breakout")
                                ? "support"
                                : String(previousDayTurningSignal || "").toLowerCase().includes("breakdown")
                                  ? "resistance"
                                  : String(previousDayTurningSignal || "").toLowerCase().includes("bounce")
                                    ? "support"
                                    : String(previousDayTurningSignal || "").toLowerCase().includes("rejection")
                                      ? "resistance"
                                      : "neutral"
                            }
                          />
                        </div>
                      </div>
                    </section>
                  )}

                  <section className="grid">
                    <div className="panel">
                      <div className="panel-header">
                        <h3>Decision Filters</h3>
                      </div>

                      {(() => {
                        const bias = String(tradeSignalPanel?.bias || "").toLowerCase();

                        const regimeRaw =
                          marketRegime?.label ||
                          marketRegime?.regime ||
                          marketRegime ||
                          "";

                        const regime = String(regimeRaw).toLowerCase();

                        const confidence = Number(tradeSignalPanel?.confidence || 0);
                        const spotPrice = Number(spot?.ltp || 0);

                        const support1 = Number(normalizedSupports?.[0] || 0);
                        const resistance1 = Number(normalizedResistances?.[0] || 0);

                        const pcr = Number(analytics?.pcr || 0);

                        const adv = Number(
                          breadthStats?.advances ??
                          breadthStats?.advance ??
                          0
                        );

                        const dec = Number(
                          breadthStats?.declines ??
                          breadthStats?.decline ??
                          0
                        );

                        const marketType =
                          regime.includes("volatile")
                            ? "Volatile"
                            : regime.includes("up") || regime.includes("bull")
                              ? "Trending Up"
                              : regime.includes("down") || regime.includes("bear")
                                ? "Trending Down"
                                : bias.includes("bull")
                                  ? "Trending Up"
                                  : bias.includes("bear")
                                    ? "Trending Down"
                                    : "Sideways";

                        const directionalBias = bias.includes("bull") || bias.includes("bear");

                        const tradeStatus =
                          confidence >= 70 && directionalBias
                            ? "Trade Allowed"
                            : confidence >= 50 || marketType === "Sideways"
                              ? "Wait"
                              : "No Trade";

                        const nearSupport =
                          support1 > 0 &&
                          spotPrice > 0 &&
                          Math.abs(spotPrice - support1) / spotPrice <= 0.0035;

                        const nearResistance =
                          resistance1 > 0 &&
                          spotPrice > 0 &&
                          Math.abs(spotPrice - resistance1) / spotPrice <= 0.0035;

                        const entryQuality =
                          nearSupport && bias.includes("bull")
                            ? "Near Support"
                            : nearResistance && bias.includes("bear")
                              ? "Near Resistance"
                              : confidence >= 75
                                ? "Good Entry"
                                : confidence >= 60
                                  ? "Late Entry"
                                  : directionalBias
                                    ? "Chasing"
                                    : "-";

                        const premiumQuality =
                          pcr >= 1.4
                            ? "Very Expensive"
                            : pcr >= 1.15
                              ? "Expensive"
                              : pcr <= 0.7
                                ? "Cheap"
                                : "Fair";

                        const breadthInterpretation =
                          adv > dec * 1.2
                            ? "Breadth Supportive"
                            : dec > adv * 1.2
                              ? "Breadth Weak"
                              : "Breadth Mixed";

                        return (
                          <div className="levels-grid">
                            <MiniLevelPill
                              label="Trade Status"
                              value={tradeStatus}
                              type={
                                tradeStatus === "Trade Allowed"
                                  ? "support"
                                  : tradeStatus === "No Trade"
                                    ? "resistance"
                                    : "neutral"
                              }
                            />

                            <MiniLevelPill
                              label="Market Type"
                              value={marketType}
                              type={
                                marketType === "Trending Up"
                                  ? "support"
                                  : marketType === "Trending Down"
                                    ? "resistance"
                                    : "neutral"
                              }
                            />

                            <MiniLevelPill
                              label="Entry Quality"
                              value={entryQuality}
                              type={
                                entryQuality === "Good Entry" ||
                                  entryQuality === "Near Support" ||
                                  entryQuality === "Near Resistance"
                                  ? "support"
                                  : entryQuality === "Chasing"
                                    ? "resistance"
                                    : "neutral"
                              }
                            />

                            <MiniLevelPill
                              label="Premium Quality"
                              value={premiumQuality}
                              type={
                                premiumQuality === "Cheap"
                                  ? "support"
                                  : premiumQuality === "Very Expensive" ||
                                    premiumQuality === "Expensive"
                                    ? "resistance"
                                    : "neutral"
                              }
                            />

                            <MiniLevelPill
                              label="PCR"
                              value={isValidNumber(analytics?.pcr) ? formatNum(analytics?.pcr) : "-"}
                              type={
                                Number(analytics?.pcr || 0) >= 1.2
                                  ? "support"
                                  : Number(analytics?.pcr || 0) > 0 && Number(analytics?.pcr || 0) <= 0.8
                                    ? "resistance"
                                    : "neutral"
                              }
                            />

                            <MiniLevelPill
                              label="Breadth Interpretation"
                              value={breadthInterpretation}
                              type={
                                breadthInterpretation === "Breadth Supportive"
                                  ? "support"
                                  : breadthInterpretation === "Breadth Weak"
                                    ? "resistance"
                                    : "neutral"
                              }
                            />

                            <MiniLevelPill
                              label="VWAP Position"
                              value={vwapDecisionData?.position || "-"}
                              type={vwapDecisionData?.positionType || "neutral"}
                            />

                            <MiniLevelPill
                              label="Spot - VWAP"
                              value={
                                isValidNumber(vwapDecisionData?.diff)
                                  ? `${vwapDecisionData.diff >= 0 ? "+" : ""}${formatNum(vwapDecisionData.diff)}`
                                  : "-"
                              }
                              type={
                                Number(vwapDecisionData?.diff || 0) > 0
                                  ? "support"
                                  : Number(vwapDecisionData?.diff || 0) < 0
                                    ? "resistance"
                                    : "neutral"
                              }
                            />

                            <MiniLevelPill
                              label="VWAP Confirmation"
                              value={vwapDecisionData?.confirmation || "-"}
                              type={vwapDecisionData?.confirmationType || "neutral"}
                            />


                          </div>
                        );
                      })()}
                    </div>
                  </section>
                  {terminalTab === "Overview" && currentPcrHistory.length ? (
                    <section className="grid">
                      <div className="panel">
                        <div className="panel-header">
                          <h3>PCR Recording (5 Min)</h3>
                        </div>

                        <div className="pcr-history-table-wrap">
                          <table className="pcr-history-table">
                            <thead>
                              <tr>
                                <th>Time</th>
                                <th>PCR</th>
                                <th>Change</th>
                                <th>Trend</th>
                                <th>Side</th>
                                <th>Interpretation</th>
                              </tr>
                            </thead>

                            <tbody>
                              {currentPcrHistory.slice(-20).reverse().map((item, index) => (
                                <tr key={`${item.time}-${index}`}>
                                  <td>{item.time}</td>

                                  <td>
                                    <strong>{formatNum(item.pcr)}</strong>
                                  </td>

                                  <td
                                    className={
                                      item.change > 0
                                        ? "up"
                                        : item.change < 0
                                          ? "down"
                                          : ""
                                    }
                                  >
                                    {item.change === null
                                      ? "-"
                                      : `${item.change >= 0 ? "+" : ""}${formatNum(item.change)}`}
                                  </td>

                                  <td
                                    className={
                                      item.trend === "Rising"
                                        ? "up"
                                        : item.trend === "Falling"
                                          ? "down"
                                          : ""
                                    }
                                  >
                                    {item.trend}
                                  </td>

                                  <td
                                    className={
                                      item.side === "PUT SIDE"
                                        ? "up"
                                        : item.side === "CALL SIDE"
                                          ? "down"
                                          : ""
                                    }
                                  >
                                    {item.side || "-"}
                                  </td>

                                  <td>{item.interpretation || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </section>
                  ) : null}
                  {terminalTab === "Overview" && (
                    <>


                      {/* <section className="grid">
      <div className="panel">
        <div className="panel-header">
          <h3>Trade Signal Summary</h3>
        </div>
        
        <div className="levels-grid">
          <MiniLevelPill
            label="Bias"
            value={tradeSignalPanel?.bias || "-"}
            type={
              tradeBiasTone === "bullish"
                ? "support"
                : tradeBiasTone === "bearish"
                ? "resistance"
                : "neutral"
            }
          />

          <MiniLevelPill
            label="Action"
            value={tradeSignalPanel?.action || "-"}
            type={
              tradeBiasTone === "bullish"
                ? "support"
                : tradeBiasTone === "bearish"
                ? "resistance"
                : "neutral"
            }
          />

          <MiniLevelPill
            label="Entry"
            value={displayPrice(tradeSignalPanel?.entry)}
            type="warning"
          />

          <MiniLevelPill
            label="Target"
            value={displayPrice(tradeSignalPanel?.target)}
            type="support"
          />

          <MiniLevelPill
            label="Stoploss"
            value={displayPrice(tradeSignalPanel?.stoploss)}
            type="resistance"
          />

          <MiniLevelPill
            label="Confidence"
            value={
              isValidNumber(tradeSignalPanel?.confidence)
                ? `${formatNum(tradeSignalPanel?.confidence)}%`
                : "-"
            }
            type="warning"
          />
        </div>
      </div>
    </section>
      */}


 <section className="grid">
  <div className="panel">
    <div className="panel-header">
      <h3>Entry Readiness Box</h3>
    </div>

    <div className="levels-grid">
      <MiniLevelPill
        label="Direction"
        value={directionConfirmation?.label || "-"}
        type={mapToneToMiniPillType(directionConfirmation?.tone)}
      />

      <MiniLevelPill
        label="Entry Zone"
        value={entryZoneStatus?.label || "-"}
        type={mapToneToMiniPillType(entryZoneStatus?.tone)}
      />

      <MiniLevelPill
        label="Premium Zone"
        value={premiumBuyZone?.label || "-"}
        type={mapToneToMiniPillType(premiumBuyZone?.tone)}
      />

      <MiniLevelPill
        label="Momentum"
        value={momentumStrength?.label || "-"}
        type={mapToneToMiniPillType(momentumStrength?.tone)}
      />

      <MiniLevelPill
        label="Session"
        value={sessionSuitability?.label || "-"}
        type={mapToneToMiniPillType(sessionSuitability?.tone)}
      />

      <MiniLevelPill
        label="Final Action"
        value={buyerActionBox?.action || "-"}
        type={
          buyerActionBox?.tone === "support"
            ? "support"
            : buyerActionBox?.tone === "resistance"
            ? "resistance"
            : "warning"
        }
      />

      <MiniLevelPill
        label="Reason"
        value={buyerActionBox?.reason || "-"}
        type="neutral"
      />

      <MiniLevelPill
        label="Plan"
        value={buyerActionBox?.plan || "-"}
        type="neutral"
      />
    </div>
  </div>
</section>

                      <section className="grid">
                        <div className="panel">
                          <div className="panel-header">
                            <h3>Premium Fit</h3>
                          </div>

                          <div className="levels-grid">
                            <MiniLevelPill
                              label="Selected Premium"
                              value={displayPrice(selectedTradeAnalysis?.premium)}
                              type="neutral"
                            />

                            <MiniLevelPill
                              label="Target Premium"
                              value={displayPrice(premiumProjection?.targetPremium)}
                              type="support"
                            />

                            <MiniLevelPill
                              label="Stop Premium"
                              value={displayPrice(premiumProjection?.stopPremium)}
                              type="resistance"
                            />

                            <MiniLevelPill
                              label="Premium Status"
                              value={selectedTradeAnalysis?.premiumSuitability?.label || "-"}
                              type={mapToneToMiniPillType(selectedTradeAnalysis?.premiumSuitability?.tone)}
                            />

                            <MiniLevelPill
                              label="IV"
                              value={
                                isValidNumber(ivStatus?.value)
                                  ? `${formatNum(ivStatus.value)}`
                                  : "-"
                              }
                              type={mapToneToMiniPillType(ivStatus?.tone)}
                            />

                            <MiniLevelPill
                              label="IV Status"
                              value={ivStatus?.label || "-"}
                              type={mapToneToMiniPillType(ivStatus?.tone)}
                            />

                            <MiniLevelPill
                              label="Theta Risk"
                              value={thetaRisk?.label || "-"}
                              type={mapToneToMiniPillType(thetaRisk?.tone)}
                            />

                            <MiniLevelPill
                              label="Liquidity"
                              value={
                                isValidNumber(selectedTradeAnalysis?.liquidityScore)
                                  ? `${formatInt(selectedTradeAnalysis?.liquidityScore)} / 100`
                                  : "-"
                              }
                              type={
                                Number(selectedTradeAnalysis?.liquidityScore || 0) >= 70
                                  ? "support"
                                  : Number(selectedTradeAnalysis?.liquidityScore || 0) >= 45
                                    ? "neutral"
                                    : "resistance"
                              }
                            />

                            <MiniLevelPill
                              label="Buy Quality"
                              value={
                                isValidNumber(selectedTradeAnalysis?.buyQualityScore)
                                  ? `${formatNum(selectedTradeAnalysis?.buyQualityScore)} / 100`
                                  : "-"
                              }
                              type={
                                Number(selectedTradeAnalysis?.buyQualityScore || 0) >= 70
                                  ? "support"
                                  : Number(selectedTradeAnalysis?.buyQualityScore || 0) >= 55
                                    ? "neutral"
                                    : "resistance"
                              }
                            />

                            <MiniLevelPill
                              label="Decision"
                              value={selectedTradeAnalysis?.decision || "-"}
                              type={
                                selectedTradeAnalysis?.decision === "Trade Allowed"
                                  ? "support"
                                  : "resistance"
                              }
                            />
                          </div>
                        </div>
                      </section>

<section className="grid">
  <div className="panel">
    <div className="panel-header">
      <h3>ATM Premium Comparison</h3>
    </div>

    <div className="levels-grid">
      <MiniLevelPill
        label="ATM Strike"
        value={displayPrice(displayATMStrike)}
        type="neutral"
      />

      <MiniLevelPill
        label="ATM CE Premium"
        value={displayPrice(
          displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          )?.ce_ltp
        )}
        type="neutral"
      />

      <MiniLevelPill
        label="ATM PE Premium"
        value={displayPrice(
          displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          )?.pe_ltp
        )}
        type="neutral"
      />

      <MiniLevelPill
        label="CE Premium Fit"
        value={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const cePremium = Number(atmRow?.ce_ltp || 0);

          if (!cePremium) return "-";
          if (cePremium >= 80 && cePremium <= 250) return "Ideal";
          if ((cePremium >= 40 && cePremium < 80) || (cePremium > 250 && cePremium <= 400)) return "Usable";
          if ((cePremium >= 20 && cePremium < 40) || (cePremium > 400 && cePremium <= 700)) return "Risky";
          return "Avoid";
        })()}
        type={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const cePremium = Number(atmRow?.ce_ltp || 0);

          if (!cePremium) return "neutral";
          if (cePremium >= 80 && cePremium <= 250) return "support";
          if ((cePremium >= 40 && cePremium < 80) || (cePremium > 250 && cePremium <= 400)) return "neutral";
          if ((cePremium >= 20 && cePremium < 40) || (cePremium > 400 && cePremium <= 700)) return "warning";
          return "resistance";
        })()}
      />

      <MiniLevelPill
        label="PE Premium Fit"
        value={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const pePremium = Number(atmRow?.pe_ltp || 0);

          if (!pePremium) return "-";
          if (pePremium >= 80 && pePremium <= 250) return "Ideal";
          if ((pePremium >= 40 && pePremium < 80) || (pePremium > 250 && pePremium <= 400)) return "Usable";
          if ((pePremium >= 20 && pePremium < 40) || (pePremium > 400 && pePremium <= 700)) return "Risky";
          return "Avoid";
        })()}
        type={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const pePremium = Number(atmRow?.pe_ltp || 0);

          if (!pePremium) return "neutral";
          if (pePremium >= 80 && pePremium <= 250) return "support";
          if ((pePremium >= 40 && pePremium < 80) || (pePremium > 250 && pePremium <= 400)) return "neutral";
          if ((pePremium >= 20 && pePremium < 40) || (pePremium > 400 && pePremium <= 700)) return "warning";
          return "resistance";
        })()}
      />

      <MiniLevelPill
        label="Cheaper Side"
        value={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const cePremium = Number(atmRow?.ce_ltp || 0);
          const pePremium = Number(atmRow?.pe_ltp || 0);

          if (!cePremium && !pePremium) return "-";
          if (cePremium && pePremium) {
            if (cePremium < pePremium) return "CE Cheaper";
            if (pePremium < cePremium) return "PE Cheaper";
            return "Equal";
          }
          return cePremium ? "CE Only" : "PE Only";
        })()}
        type="neutral"
      />

      <MiniLevelPill
        label="Tradable Side"
        value={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const cePremium = Number(atmRow?.ce_ltp || 0);
          const pePremium = Number(atmRow?.pe_ltp || 0);

          const ceGood = cePremium >= 80 && cePremium <= 250;
          const peGood = pePremium >= 80 && pePremium <= 250;

          if (ceGood && peGood) return "Both Good";
          if (ceGood) return "CE Better";
          if (peGood) return "PE Better";

          if (
            (cePremium >= 40 && cePremium <= 400) &&
            !(pePremium >= 40 && pePremium <= 400)
          ) {
            return "CE Usable";
          }

          if (
            (pePremium >= 40 && pePremium <= 400) &&
            !(cePremium >= 40 && cePremium <= 400)
          ) {
            return "PE Usable";
          }

          return "Wait";
        })()}
        type={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const cePremium = Number(atmRow?.ce_ltp || 0);
          const pePremium = Number(atmRow?.pe_ltp || 0);

          const ceGood = cePremium >= 80 && cePremium <= 250;
          const peGood = pePremium >= 80 && pePremium <= 250;

          if (ceGood || peGood) return "support";
          if (
            (cePremium >= 40 && cePremium <= 400) ||
            (pePremium >= 40 && pePremium <= 400)
          ) {
            return "warning";
          }
          return "resistance";
        })()}
      />

      <MiniLevelPill
        label="Premium Gap"
        value={(() => {
          const atmRow = displayChain.find(
            (row) => Number(row?.strike || 0) === Number(displayATMStrike || 0)
          );
          const cePremium = Number(atmRow?.ce_ltp || 0);
          const pePremium = Number(atmRow?.pe_ltp || 0);

          if (!cePremium || !pePremium) return "-";
          return displayPrice(Math.abs(cePremium - pePremium));
        })()}
        type="neutral"
      />
    </div>
  </div>
</section>

                      <section className="grid">
                        <div className="panel">
                          <div className="panel-header">
                            <h3>Premium Buy Zone</h3>
                          </div>

                          <div className="levels-grid">
                            <MiniLevelPill
                              label="Current Premium"
                              value={displayPrice(selectedTradeAnalysis?.premium)}
                              type="neutral"
                            />

                            <MiniLevelPill
                              label="Ideal Buy Below"
                              value={displayPrice(premiumBuyZone?.idealBelow)}
                              type="support"
                            />

                            <MiniLevelPill
                              label="Avoid Above"
                              value={displayPrice(premiumBuyZone?.avoidAbove)}
                              type="resistance"
                            />

                            <MiniLevelPill
                              label="Premium Zone Status"
                              value={premiumBuyZone?.label || "-"}
                              type={mapToneToMiniPillType(premiumBuyZone?.tone)}
                            />

                            <MiniLevelPill
                              label="Holding Advice"
                              value={holdingAdvice?.label || "-"}
                              type={mapToneToMiniPillType(holdingAdvice?.tone)}
                            />

                            <MiniLevelPill
                              label="Session Suitability"
                              value={sessionSuitability?.label || "-"}
                              type={mapToneToMiniPillType(sessionSuitability?.tone)}
                            />
                          </div>
                        </div>
                      </section>
<section className="grid">
  <div className="panel">
    <div className="panel-header">
      <h3>Risk Meter</h3>
    </div>

    <div className="levels-grid">
      <MiniLevelPill
        label="IV Risk"
        value={ivStatus?.label || "-"}
        type={mapToneToMiniPillType(ivStatus?.tone)}
      />

      <MiniLevelPill
        label="Theta Risk"
        value={thetaRisk?.label || "-"}
        type={mapToneToMiniPillType(thetaRisk?.tone)}
      />

      <MiniLevelPill
        label="Chase Risk"
        value={chaseWarning?.label || "-"}
        type={mapToneToMiniPillType(chaseWarning?.tone)}
      />

      <MiniLevelPill
        label="Entry Risk"
        value={entryZoneStatus?.label || "-"}
        type={mapToneToMiniPillType(entryZoneStatus?.tone)}
      />

      <MiniLevelPill
        label="R:R Quality"
        value={
          isValidNumber(selectedTradeAnalysis?.rr)
            ? `${formatNum(selectedTradeAnalysis.rr)}`
            : "-"
        }
        type={
          Number(selectedTradeAnalysis?.rr || 0) >= 1.8
            ? "support"
            : Number(selectedTradeAnalysis?.rr || 0) >= 1.2
            ? "warning"
            : "resistance"
        }
      />

      <MiniLevelPill
        label="Liquidity Risk"
        value={
          isValidNumber(selectedTradeAnalysis?.liquidityScore)
            ? `${formatInt(selectedTradeAnalysis.liquidityScore)} / 100`
            : "-"
        }
        type={
          Number(selectedTradeAnalysis?.liquidityScore || 0) >= 70
            ? "support"
            : Number(selectedTradeAnalysis?.liquidityScore || 0) >= 45
            ? "warning"
            : "resistance"
        }
      />

      <MiniLevelPill
        label="Trade Quality"
        value={
          isValidNumber(selectedTradeAnalysis?.finalTradeQuality)
            ? `${formatNum(selectedTradeAnalysis.finalTradeQuality)} / 100`
            : "-"
        }
        type={
          Number(selectedTradeAnalysis?.finalTradeQuality || 0) >= 70
            ? "support"
            : Number(selectedTradeAnalysis?.finalTradeQuality || 0) >= 55
            ? "warning"
            : "resistance"
        }
      />

      <MiniLevelPill
        label="Final Risk"
        value={(() => {
          const riskFlags = [
            String(ivStatus?.tone || ""),
            String(thetaRisk?.tone || ""),
            String(chaseWarning?.tone || ""),
            String(entryZoneStatus?.tone || ""),
          ];

          const highRiskCount = riskFlags.filter((x) => x === "resistance").length;
          const medRiskCount = riskFlags.filter((x) => x === "warning").length;
          const rr = Number(selectedTradeAnalysis?.rr || 0);
          const quality = Number(selectedTradeAnalysis?.finalTradeQuality || 0);

          if (highRiskCount >= 2 || rr < 1.2 || quality < 55) return "High";
          if (highRiskCount >= 1 || medRiskCount >= 2 || rr < 1.8 || quality < 70) return "Medium";
          return "Low";
        })()}
        type={(() => {
          const riskFlags = [
            String(ivStatus?.tone || ""),
            String(thetaRisk?.tone || ""),
            String(chaseWarning?.tone || ""),
            String(entryZoneStatus?.tone || ""),
          ];

          const highRiskCount = riskFlags.filter((x) => x === "resistance").length;
          const medRiskCount = riskFlags.filter((x) => x === "warning").length;
          const rr = Number(selectedTradeAnalysis?.rr || 0);
          const quality = Number(selectedTradeAnalysis?.finalTradeQuality || 0);

          if (highRiskCount >= 2 || rr < 1.2 || quality < 55) return "resistance";
          if (highRiskCount >= 1 || medRiskCount >= 2 || rr < 1.8 || quality < 70) return "warning";
          return "support";
        })()}
      />
    </div>
  </div>
</section>

                      <section className="grid">
                        <div className="panel">
                          <div className="panel-header">
                            <h3>Execution Check</h3>
                          </div>

                          <div className="levels-grid">
                            <MiniLevelPill
                              label="Spot - Entry"
                              value={
                                isValidNumber(entryDistanceInfo?.points)
                                  ? `${entryDistanceInfo.points >= 0 ? "+" : ""}${formatNum(entryDistanceInfo.points)}`
                                  : "-"
                              }
                              type={mapToneToMiniPillType(entryDistanceInfo?.tone)}
                            />

                            <MiniLevelPill
                              label="Entry Distance %"
                              value={
                                isValidNumber(entryDistanceInfo?.pct)
                                  ? `${formatNum(entryDistanceInfo.pct)}%`
                                  : "-"
                              }
                              type={mapToneToMiniPillType(entryDistanceInfo?.tone)}
                            />

                            <MiniLevelPill
                              label="Breakout Status"
                              value={breakoutStatus?.label || "-"}
                              type={mapToneToMiniPillType(breakoutStatus?.tone)}
                            />

                            <MiniLevelPill
                              label="Momentum"
                              value={momentumStrength?.label || "-"}
                              type={mapToneToMiniPillType(momentumStrength?.tone)}
                            />

                            <MiniLevelPill
                              label="Chase Warning"
                              value={chaseWarning?.label || "-"}
                              type={mapToneToMiniPillType(chaseWarning?.tone)}
                            />

                            <MiniLevelPill
                              label="Nearest Wall"
                              value={displayPrice(wallSupportConfirmation?.nearestWall)}
                              type={mapToneToMiniPillType(wallSupportConfirmation?.tone)}
                            />
                          </div>


                        </div>
                      </section>
                       <section className="grid">
  <div className="panel">
    <div className="panel-header">
      <h3>Breakout Trigger Levels</h3>
    </div>

    <div className="levels-grid">
      <MiniLevelPill
        label="Bullish Trigger"
        value={
          isValidNumber(normalizedResistances?.[0])
            ? displayPrice(normalizedResistances[0])
            : displayPrice(breakoutBreakdown?.breakoutLevel)
        }
        type="support"
      />

      <MiniLevelPill
        label="Bearish Trigger"
        value={
          isValidNumber(normalizedSupports?.[0])
            ? displayPrice(normalizedSupports[0])
            : displayPrice(breakoutBreakdown?.breakdownLevel)
        }
        type="resistance"
      />

      <MiniLevelPill
        label="Current Spot"
        value={displayPrice(spot?.ltp)}
        type="neutral"
      />

      <MiniLevelPill
        label="Signal"
        value={breakoutBreakdown?.signal || "-"}
        type={
          String(breakoutBreakdown?.signal || "").toLowerCase().includes("breakout")
            ? "support"
            : String(breakoutBreakdown?.signal || "").toLowerCase().includes("breakdown")
            ? "resistance"
            : String(breakoutBreakdown?.signal || "").toLowerCase().includes("near")
            ? "warning"
            : "neutral"
        }
      />

      <MiniLevelPill
        label="Breakout Room"
        value={(() => {
          const trigger = pickFirstUsableNumber(
            normalizedResistances?.[0],
            breakoutBreakdown?.breakoutLevel
          );
          const current = pickFirstUsableNumber(spot?.ltp);

          if (!isValidNumber(trigger) || !isValidNumber(current)) return "-";
          return `${formatNum(Number(trigger) - Number(current))} pts`;
        })()}
        type="support"
      />

      <MiniLevelPill
        label="Breakdown Room"
        value={(() => {
          const trigger = pickFirstUsableNumber(
            normalizedSupports?.[0],
            breakoutBreakdown?.breakdownLevel
          );
          const current = pickFirstUsableNumber(spot?.ltp);

          if (!isValidNumber(trigger) || !isValidNumber(current)) return "-";
          return `${formatNum(Number(current) - Number(trigger))} pts`;
        })()}
        type="resistance"
      />

      <MiniLevelPill
        label="Trade Zone"
        value={(() => {
          const bull = pickFirstUsableNumber(
            normalizedResistances?.[0],
            breakoutBreakdown?.breakoutLevel
          );
          const bear = pickFirstUsableNumber(
            normalizedSupports?.[0],
            breakoutBreakdown?.breakdownLevel
          );
          const current = pickFirstUsableNumber(spot?.ltp);

          if (!isValidNumber(bull) || !isValidNumber(bear) || !isValidNumber(current)) {
            return "-";
          }

          if (Number(current) > Number(bull)) return "Above Bull Trigger";
          if (Number(current) < Number(bear)) return "Below Bear Trigger";
          return "Inside No-Trade Zone";
        })()}
        type={(() => {
          const bull = pickFirstUsableNumber(
            normalizedResistances?.[0],
            breakoutBreakdown?.breakoutLevel
          );
          const bear = pickFirstUsableNumber(
            normalizedSupports?.[0],
            breakoutBreakdown?.breakdownLevel
          );
          const current = pickFirstUsableNumber(spot?.ltp);

          if (!isValidNumber(bull) || !isValidNumber(bear) || !isValidNumber(current)) {
            return "neutral";
          }

          if (Number(current) > Number(bull)) return "support";
          if (Number(current) < Number(bear)) return "resistance";
          return "warning";
        })()}
      />

      <MiniLevelPill
        label="Execution View"
        value={(() => {
          const signalText = String(breakoutBreakdown?.signal || "").toLowerCase();

          if (signalText.includes("breakout")) return "Bullish Breakout Active";
          if (signalText.includes("breakdown")) return "Bearish Breakdown Active";
          if (signalText.includes("near breakout")) return "Near Breakout";
          if (signalText.includes("near breakdown")) return "Near Breakdown";
          return "Wait for Trigger";
        })()}
        type={(() => {
          const signalText = String(breakoutBreakdown?.signal || "").toLowerCase();

          if (signalText.includes("breakout")) return "support";
          if (signalText.includes("breakdown")) return "resistance";
          if (signalText.includes("near")) return "warning";
          return "neutral";
        })()}
      />
    </div>
  </div>
</section>
                      {selectedTradeAnalysis?.noTradeReasons?.length ? (
                        <section className="grid">
                          <div className="panel">
                            <div className="panel-header">
                              <h3>Avoid Trade Checklist</h3>
                            </div>

                            <div className="levels-grid">
                              <MiniLevelPill
                                label="IV"
                                value={ivStatus?.label || "-"}
                                type={mapToneToMiniPillType(ivStatus?.tone)}
                              />

                              <MiniLevelPill
                                label="Wall"
                                value={wallSupportConfirmation?.label || "-"}
                                type={mapToneToMiniPillType(wallSupportConfirmation?.tone)}
                              />

                              <MiniLevelPill
                                label="R:R"
                                value={buyerChecklist?.rr || "-"}
                                type={
                                  buyerChecklist?.rr === "Good"
                                    ? "support"
                                    : buyerChecklist?.rr === "Okay"
                                      ? "neutral"
                                      : "resistance"
                                }
                              />

                              <MiniLevelPill
                                label="Entry"
                                value={entryZoneStatus?.label || "-"}
                                type={mapToneToMiniPillType(entryZoneStatus?.tone)}
                              />
                            </div>
                          </div>
                        </section>
                      ) : null}



                      <section className="panel">
                        <div className="panel-header">
                          <h3>Premium Momentum</h3>
                        </div>

                        <div className="levels-grid">
                          <MiniLevelPill
                            label="Momentum"
                            value={premiumMomentum?.label || "-"}
                            type={mapToneToMiniPillType(premiumMomentum?.tone)}
                          />
                          <MiniLevelPill
                            label="Volume Burst"
                            value={premiumMomentum?.volumeBurst || "-"}
                            type={
                              premiumMomentum?.volumeBurst === "Strong"
                                ? "support"
                                : premiumMomentum?.volumeBurst === "Moderate"
                                  ? "warning"
                                  : "resistance"
                            }
                          />
                          <MiniLevelPill
                            label="OI Support"
                            value={premiumMomentum?.oiSupport || "-"}
                            type={
                              premiumMomentum?.oiSupport === "Yes"
                                ? "support"
                                : premiumMomentum?.oiSupport === "Flat"
                                  ? "warning"
                                  : "resistance"
                            }
                          />
                          <MiniLevelPill
                            label="Spot Move Needed"
                            value={
                              isValidNumber(spotMoveNeeded?.points)
                                ? `${formatNum(spotMoveNeeded.points)} pts`
                                : "-"
                            }
                            type={mapToneToMiniPillType(spotMoveNeeded?.tone)}
                          />
                          <MiniLevelPill
                            label="Session Fit"
                            value={sessionSuitability?.label || "-"}
                            type={mapToneToMiniPillType(sessionSuitability?.tone)}
                          />
                        </div>
                      </section>
 {importantGreeks && (
  <section className="panel">
    <div className="panel-header">
      <h3>IMPORTANT GREEKS</h3>
    </div>

    <div className="levels-grid">
      <MiniLevelPill
        label="ATM Strike"
        value={displayPrice(importantGreeks?.atm?.strike)}
        type="neutral"
      />

      <MiniLevelPill
        label="ATM Delta"
        value={`CE ${displayNum(importantGreeks?.atm?.ce?.delta)} | PE ${displayNum(importantGreeks?.atm?.pe?.delta)}`}
        type={
          getDeltaPillType(importantGreeks?.atm?.ce?.delta) === "support"
            ? "support"
            : getDeltaPillType(importantGreeks?.atm?.pe?.delta) === "resistance"
            ? "resistance"
            : "neutral"
        }
      />

      <MiniLevelPill
        label="ATM Theta"
        value={`CE ${displayNum(importantGreeks?.atm?.ce?.theta)} | PE ${displayNum(importantGreeks?.atm?.pe?.theta)}`}
        type={
          getThetaPillType(importantGreeks?.atm?.ce?.theta) === "resistance" ||
          getThetaPillType(importantGreeks?.atm?.pe?.theta) === "resistance"
            ? "resistance"
            : getThetaPillType(importantGreeks?.atm?.ce?.theta) === "warning" ||
              getThetaPillType(importantGreeks?.atm?.pe?.theta) === "warning"
            ? "warning"
            : "neutral"
        }
      />

      <MiniLevelPill
        label="ATM Vega"
        value={
          isValidNumber(importantGreeks?.atm?.ce?.vega)
            ? displayNum(importantGreeks?.atm?.ce?.vega)
            : displayNum(importantGreeks?.atm?.pe?.vega)
        }
        type={getVegaPillType(
          isValidNumber(importantGreeks?.atm?.ce?.vega)
            ? importantGreeks?.atm?.ce?.vega
            : importantGreeks?.atm?.pe?.vega
        )}
      />

      <MiniLevelPill
        label="Best Strike"
        value={
          importantGreeks?.best?.strike && importantGreeks?.best?.side
            ? `${displayPrice(importantGreeks.best.strike)} ${importantGreeks.best.side}`
            : "-"
        }
        type="neutral"
      />

      <MiniLevelPill
        label="Best Delta"
        value={displayNum(importantGreeks?.best?.delta)}
        type={getDeltaPillType(importantGreeks?.best?.delta)}
      />

      <MiniLevelPill
        label="Best Theta"
        value={displayNum(importantGreeks?.best?.theta)}
        type={getThetaPillType(importantGreeks?.best?.theta)}
      />

      <MiniLevelPill
        label="Best Vega"
        value={displayNum(importantGreeks?.best?.vega)}
        type={getVegaPillType(importantGreeks?.best?.vega)}
      />

      <MiniLevelPill
        label="Direction"
        value={greeksInterpretation?.directionLabel || "-"}
        type={greeksInterpretation?.directionType || "neutral"}
      />

      <MiniLevelPill
        label="Theta Risk"
        value={greeksInterpretation?.thetaLabel || "-"}
        type={greeksInterpretation?.thetaType || "neutral"}
      />

      <MiniLevelPill
        label="IV Sensitivity"
        value={greeksInterpretation?.vegaLabel || "-"}
        type={greeksInterpretation?.vegaType || "neutral"}
      />
    </div>
  </section>
)}

<section className="panel">
  <div className="panel-header">
    <h3>OI Shift Near ATM</h3>
  </div>

  <div className="levels-grid">
    <MiniLevelPill
      label="ATM Strike"
      value={displayPrice(displayATMStrike)}
      type="neutral"
    />

    <MiniLevelPill
      label="CE OI Chg Sum"
      value={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "-";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const total = nearby.reduce(
          (sum, row) => sum + Number(row?.ce_oich || 0),
          0
        );

        return displayInt(total);
      })()}
      type={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "neutral";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const total = nearby.reduce(
          (sum, row) => sum + Number(row?.ce_oich || 0),
          0
        );

        return total > 0 ? "resistance" : total < 0 ? "support" : "neutral";
      })()}
    />

    <MiniLevelPill
      label="PE OI Chg Sum"
      value={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "-";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const total = nearby.reduce(
          (sum, row) => sum + Number(row?.pe_oich || 0),
          0
        );

        return displayInt(total);
      })()}
      type={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "neutral";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const total = nearby.reduce(
          (sum, row) => sum + Number(row?.pe_oich || 0),
          0
        );

        return total > 0 ? "support" : total < 0 ? "resistance" : "neutral";
      })()}
    />

    <MiniLevelPill
      label="Net OI Bias"
      value={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "-";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const ceTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.ce_oich || 0),
          0
        );

        const peTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.pe_oich || 0),
          0
        );

        if (peTotal > ceTotal * 1.1) return "PE Build-up";
        if (ceTotal > peTotal * 1.1) return "CE Build-up";
        return "Balanced";
      })()}
      type={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "neutral";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const ceTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.ce_oich || 0),
          0
        );

        const peTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.pe_oich || 0),
          0
        );

        if (peTotal > ceTotal * 1.1) return "support";
        if (ceTotal > peTotal * 1.1) return "resistance";
        return "neutral";
      })()}
    />

    <MiniLevelPill
      label="Writing Side"
      value={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "-";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const cePositive = nearby.reduce(
          (sum, row) => sum + Math.max(Number(row?.ce_oich || 0), 0),
          0
        );

        const pePositive = nearby.reduce(
          (sum, row) => sum + Math.max(Number(row?.pe_oich || 0), 0),
          0
        );

        if (pePositive > cePositive * 1.1) return "PE Writers Strong";
        if (cePositive > pePositive * 1.1) return "CE Writers Strong";
        return "Mixed Writing";
      })()}
      type={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "neutral";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const cePositive = nearby.reduce(
          (sum, row) => sum + Math.max(Number(row?.ce_oich || 0), 0),
          0
        );

        const pePositive = nearby.reduce(
          (sum, row) => sum + Math.max(Number(row?.pe_oich || 0), 0),
          0
        );

        if (pePositive > cePositive * 1.1) return "support";
        if (cePositive > pePositive * 1.1) return "resistance";
        return "neutral";
      })()}
    />

    <MiniLevelPill
      label="Interpretation"
      value={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "-";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const ceTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.ce_oich || 0),
          0
        );

        const peTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.pe_oich || 0),
          0
        );

        if (peTotal > ceTotal * 1.15) return "Support Building";
        if (ceTotal > peTotal * 1.15) return "Resistance Building";
        return "No Clear Shift";
      })()}
      type={(() => {
        const rows = Array.isArray(displayChain) ? displayChain : [];
        if (!rows.length) return "neutral";

        const atm = Number(displayATMStrike || 0);
        const nearby = rows.filter(
          (row) => Math.abs(Number(row?.strike || 0) - atm) <= 100
        );

        const ceTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.ce_oich || 0),
          0
        );

        const peTotal = nearby.reduce(
          (sum, row) => sum + Number(row?.pe_oich || 0),
          0
        );

        if (peTotal > ceTotal * 1.15) return "support";
        if (ceTotal > peTotal * 1.15) return "resistance";
        return "neutral";
      })()}
    />
  </div>
</section>
                      <section className="panel">
                        <div className="panel-header">
                          <h3>Most Traded Strikes (CE & PE)</h3>
                        </div>

                        {mostTradedStrikes.hasData ? (
                          <>
                            <div className="signal-detail" style={{ marginBottom: "12px" }}>
                              {mostTradedStrikes.interpretation}
                            </div>

                            <div className="option-table-wrap" style={{ marginBottom: "16px" }}>
                              <table className="option-table">
                                <thead>
                                  <tr>
                                    <th colSpan={7}>Top 5 CE Active Strikes</th>
                                  </tr>
                                  <tr>
                                    <th>Strike</th>
                                    <th>Dist</th>
                                    <th>Volume</th>
                                    <th>OI</th>
                                    <th>OI Chg</th>
                                    <th>LTP</th>
                                    <th>Activity</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mostTradedStrikes.ce.length ? (
                                    mostTradedStrikes.ce.map((row, index) => (
                                      <tr key={`ce-most-traded-${row.strike}-${index}`}>
                                        <td><strong>{row.strike}</strong></td>
                                        <td>{row.distLabel || "-"}</td>
                                        <td>{displayInt(row.volume)}</td>
                                        <td>{displayInt(row.oi)}</td>
                                        <td className={classBySign(row.oiChange, "up", "down")}>
                                          {displayInt(row.oiChange)}
                                        </td>
                                        <td>{displayPrice(row.ltp)}</td>
                                        <td>{row.activity || "-"}</td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan="7" className="empty-state">
                                        No CE traded-strike data available.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>

                            <div className="option-table-wrap">
                              <table className="option-table">
                                <thead>
                                  <tr>
                                    <th colSpan={7}>Top 5 PE Active Strikes</th>
                                  </tr>
                                  <tr>
                                    <th>Strike</th>
                                    <th>Dist</th>
                                    <th>Volume</th>
                                    <th>OI</th>
                                    <th>OI Chg</th>
                                    <th>LTP</th>
                                    <th>Activity</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mostTradedStrikes.pe.length ? (
                                    mostTradedStrikes.pe.map((row, index) => (
                                      <tr key={`pe-most-traded-${row.strike}-${index}`}>
                                        <td><strong>{row.strike}</strong></td>
                                        <td>{row.distLabel || "-"}</td>
                                        <td>{displayInt(row.volume)}</td>
                                        <td>{displayInt(row.oi)}</td>
                                        <td className={classBySign(row.oiChange, "up", "down")}>
                                          {displayInt(row.oiChange)}
                                        </td>
                                        <td>{displayPrice(row.ltp)}</td>
                                        <td>{row.activity || "-"}</td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan="7" className="empty-state">
                                        No PE traded-strike data available.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <div className="empty-state">No traded-strike data available.</div>
                        )}
                      </section>

                      <section className="grid">
                        <div className="panel">
                          <div className="panel-header">
                            <h3>
                              Live Option Chain
                              {displayATMStrike ? ` (Near ATM ${displayATMStrike})` : ""}
                            </h3>
                          </div>

                          <div className="option-table-wrap">
                            <table className="option-table">
                              <thead>
                                <tr>
                                  <th>CE LTP</th>
                                  <th>CE OI</th>
                                  <th>CE OI Chg</th>
                                  <th>CE Vol</th>
                                  <th>Strike</th>
                                  <th>PE Vol</th>
                                  <th>PE OI Chg</th>
                                  <th>PE OI</th>
                                  <th>PE LTP</th>
                                  <th>Tags</th>
                                </tr>
                              </thead>

                              <tbody>
                                {displayChain.length ? (
                                  displayChain.map((row, index) => {
                                    
                                    const isATM = Number(row.strike) === Number(displayATMStrike);
                                    const isSupport = levelIncludes(analytics.supports, row.strike);
                                    const isResistance = levelIncludes(analytics.resistances, row.strike);
                                    const isPutWall = analytics.putWall === row.strike;
                                    const isCallWall = analytics.callWall === row.strike;

                                    const tags = [];
                                    if (isATM) tags.push("ATM");
                                    if (isSupport) tags.push("Support");
                                    if (isResistance) tags.push("Resistance");
                                    if (isPutWall) tags.push("Put Wall");
                                    if (isCallWall) tags.push("Call Wall");
                                    if (analytics?.strongestBuildup?.strike === row.strike) {
                                      tags.push("Strongest Build-up");
                                    }

                                    const rowClassName = [
                                      isATM ? "atm-row" : "",
                                      isSupport ? "support-row" : "",
                                      isResistance ? "resistance-row" : "",
                                      isPutWall ? "put-wall-row" : "",
                                      isCallWall ? "call-wall-row" : "",
                                    ]
                                      .join(" ")
                                      .trim();

                                    return (
                                      <tr
                                        key={`row-${row.strike}-${index}`}
                                        className={rowClassName}
                                      >
                                        <td>{displayPrice(row.ce_ltp)}</td>
                                        <td>{displayInt(row.ce_oi)}</td>
                                        <td className={classBySign(row.ce_oich, "up", "down")}>
                                          {displayInt(row.ce_oich)}
                                        </td>
                                        <td>{displayInt(row.ce_volume)}</td>
                                        <td className="strike-col">
                                          <strong>{row.strike}</strong>
                                        </td>
                                        <td>{displayInt(row.pe_volume)}</td>
                                        <td className={classBySign(row.pe_oich, "up", "down")}>
                                          {displayInt(row.pe_oich)}
                                        </td>
                                        <td>{displayInt(row.pe_oi)}</td>
                                        <td>{displayPrice(row.pe_ltp)}</td>
                                        <td>
                                          <div className="tag-wrap">
                                            {tags.map((tag, tagIndex) => {
                                              const tagClass =
                                                tag === "ATM"
                                                  ? "atm"
                                                  : tag === "Support"
                                                    ? "support"
                                                    : tag === "Resistance"
                                                      ? "resistance"
                                                      : tag === "Put Wall"
                                                        ? "putwall"
                                                        : tag === "Call Wall"
                                                          ? "callwall"
                                                          : "build";

                                              return (
                                                <span
                                                  key={`${row.strike}-${tag}-${tagIndex}`}
                                                  className={`table-tag ${tagClass}`}
                                                >
                                                  {tag}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan="10" className="empty-state">
                                      No option chain data available.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </section>

                      <section className="panel">
                        <div className="panel-header">
                          <h3>Exit Plan</h3>
                        </div>

                        <div className="levels-grid">
                          <MiniLevelPill
                            label="Partial Exit"
                            value={displayPrice(exitPlan?.partialExit)}
                            type="support"
                          />
                          <MiniLevelPill
                            label="Full Exit"
                            value={displayPrice(exitPlan?.fullExit)}
                            type="support"
                          />
                          <MiniLevelPill
                            label="Hard Stop"
                            value={displayPrice(exitPlan?.hardStop)}
                            type="resistance"
                          />
                          <MiniLevelPill
                            label="Trail Rule"
                            value={exitPlan?.trailRule || "-"}
                            type="neutral"
                          />
                          <MiniLevelPill
                            label="Hold / Exit"
                            value={holdingAdvice?.label || "-"}
                            type={mapToneToMiniPillType(holdingAdvice?.tone)}
                          />
                        </div>
                      </section>

                      {/* <section className="grid">
          <div className="panel">
            <div className="panel-header">
              <h3>Max Pain Curve</h3>
            </div>

            <MaxPainBarChart
              data={displayMaxPainCurve}
              currentPain={analytics?.maxPain}
              spotPrice={spot?.ltp}
              title="Max Pain Curve"
            />
          </div>
        </section> */}
                    </>
                  )}
                </>
              ) : (
                <div className="status-box info">Unable to load terminal data.</div>
              )}
            </>
          )}
        </div>

        {actionPopupOpen ? (
          <div className="action-popup-overlay" onClick={closeActionPopup}>
            <div
              className="action-popup-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="action-popup-header">
                <div className="action-popup-title-wrap">
                  <h3>{actionPopupData?.label || actionPopupSymbol}</h3>
                  <div className="action-popup-summary">{actionPopupSummary}</div>
                  {actionPopupLastUpdated ? (
                    <div className="action-popup-updated">
                      Last updated: {actionPopupLastUpdated}
                    </div>
                  ) : null}
                </div>

                <button className="action-popup-close" onClick={closeActionPopup}>
                  Close
                </button>
              </div>

              {actionPopupLoading ? (
                <div className="status-box info">Loading action data...</div>
              ) : null}

              <div className="action-popup-grid">
                <div className="action-popup-item">
                  <span className="action-popup-label">Action</span>
                  <strong
                    className={`action-popup-value ${String(actionPopupTradeSignal?.action || "").toLowerCase().includes("buy ce")
                        ? "up"
                        : String(actionPopupTradeSignal?.action || "").toLowerCase().includes("buy pe")
                          ? "down"
                          : String(actionPopupTradeSignal?.action || "").toLowerCase().includes("wait")
                            ? "warn"
                            : actionPopupIsRangebound
                              ? "down"
                              : ""
                      }`}
                  >
                    {actionPopupTradeSignal?.action || "-"}
                  </strong>
                </div>

                {actionPopupShowEntry ? (
                  <div className="action-popup-item">
                    <span className="action-popup-label">Entry</span>
                    <strong className="action-popup-value">
                      {displayPrice(actionPopupTradeSignal?.entry)}
                    </strong>
                  </div>
                ) : null}

                {actionPopupShowTargetStop ? (
                  <>
                    <div className="action-popup-item">
                      <span className="action-popup-label">Target</span>
                      <strong className="action-popup-value up">
                        {displayPrice(actionPopupTradeSignal?.target)}
                      </strong>
                    </div>

                    <div className="action-popup-item">
                      <span className="action-popup-label">Stoploss</span>
                      <strong className="action-popup-value down">
                        {displayPrice(actionPopupTradeSignal?.stoploss)}
                      </strong>
                    </div>
                  </>
                ) : null}

                {actionPopupShowRR ? (
                  <div className="action-popup-item">
                    <span className="action-popup-label">R:R</span>
                    <strong
                      className={`action-popup-value ${(() => {
                        const entry = Number(actionPopupTradeSignal?.entry || 0);
                        const target = Number(actionPopupTradeSignal?.target || 0);
                        const stoploss = Number(actionPopupTradeSignal?.stoploss || 0);
                        const biasTone = getBiasTone(actionPopupTradeSignal?.bias);

                        if (!entry || !target || !stoploss) return "";

                        const reward =
                          biasTone === "bearish"
                            ? entry - target
                            : target - entry;

                        const risk =
                          biasTone === "bearish"
                            ? stoploss - entry
                            : entry - stoploss;

                        if (reward <= 0 || risk <= 0) return "";

                        const rr = reward / risk;
                        return rr >= 1.8 ? "up" : rr >= 1.2 ? "warn" : "down";
                      })()}`}
                    >
                      {(() => {
                        const entry = Number(actionPopupTradeSignal?.entry || 0);
                        const target = Number(actionPopupTradeSignal?.target || 0);
                        const stoploss = Number(actionPopupTradeSignal?.stoploss || 0);
                        const biasTone = getBiasTone(actionPopupTradeSignal?.bias);

                        if (!entry || !target || !stoploss) return "-";

                        const reward =
                          biasTone === "bearish"
                            ? entry - target
                            : target - entry;

                        const risk =
                          biasTone === "bearish"
                            ? stoploss - entry
                            : entry - stoploss;

                        if (reward <= 0 || risk <= 0) return "-";

                        return formatNum(reward / risk);
                      })()}
                    </strong>
                  </div>
                ) : null}

                <div className="action-popup-item">
                  <span className="action-popup-label">Trade Status</span>
                  <strong
                    className={`action-popup-value ${actionPopupIsRangebound
                        ? "down"
                        : Number(actionPopupTradeSignal?.confidence || 0) >= 70 &&
                          (getBiasTone(actionPopupTradeSignal?.bias) === "bullish" ||
                            getBiasTone(actionPopupTradeSignal?.bias) === "bearish")
                          ? "up"
                          : Number(actionPopupTradeSignal?.confidence || 0) >= 50
                            ? "warn"
                            : "down"
                      }`}
                  >
                    {actionPopupIsRangebound
                      ? "Wait"
                      : Number(actionPopupTradeSignal?.confidence || 0) >= 70 &&
                        (getBiasTone(actionPopupTradeSignal?.bias) === "bullish" ||
                          getBiasTone(actionPopupTradeSignal?.bias) === "bearish")
                        ? "Trade Allowed"
                        : Number(actionPopupTradeSignal?.confidence || 0) >= 50
                          ? "Wait"
                          : "No Trade"}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Confidence</span>
                  <strong
                    className={`action-popup-value ${Number(actionPopupTradeSignal?.confidence || 0) >= 70
                        ? "up"
                        : Number(actionPopupTradeSignal?.confidence || 0) >= 50
                          ? "warn"
                          : "down"
                      }`}
                  >
                    {isValidNumber(actionPopupTradeSignal?.confidence)
                      ? `${formatNum(actionPopupTradeSignal?.confidence)}%`
                      : "-"}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Market Type</span>
                  <strong
                    className={`action-popup-value ${actionPopupIsRangebound
                        ? "down"
                        : String(actionPopupAnalytics?.marketRegime?.label || "")
                          .toLowerCase()
                          .includes("volatile")
                          ? "range"
                          : getBiasTone(actionPopupTradeSignal?.bias) === "bullish"
                            ? "up"
                            : getBiasTone(actionPopupTradeSignal?.bias) === "bearish"
                              ? "down"
                              : "down"
                      }`}
                  >
                    {actionPopupIsRangebound
                      ? "Sideways"
                      : String(actionPopupAnalytics?.marketRegime?.label || "")
                        .toLowerCase()
                        .includes("volatile")
                        ? "Volatile"
                        : getBiasTone(actionPopupTradeSignal?.bias) === "bullish"
                          ? "Trending Up"
                          : getBiasTone(actionPopupTradeSignal?.bias) === "bearish"
                            ? "Trending Down"
                            : "Sideways"}
                  </strong>
                </div>
                <div className="action-popup-item">
                  <span className="action-popup-label">Spot - Entry</span>
                  <strong
                    className={`action-popup-value ${actionPopupEntryDistanceInfo?.tone === "support"
                        ? "up"
                        : actionPopupEntryDistanceInfo?.tone === "resistance"
                          ? "down"
                          : actionPopupEntryDistanceInfo?.tone === "warning"
                            ? "warn"
                            : ""
                      }`}
                  >
                    {isValidNumber(actionPopupEntryDistanceInfo?.points)
                      ? `${actionPopupEntryDistanceInfo.points >= 0 ? "+" : ""}${formatNum(actionPopupEntryDistanceInfo.points)}`
                      : "-"}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Entry Distance %</span>
                  <strong
                    className={`action-popup-value ${actionPopupEntryDistanceInfo?.tone === "support"
                        ? "up"
                        : actionPopupEntryDistanceInfo?.tone === "resistance"
                          ? "down"
                          : actionPopupEntryDistanceInfo?.tone === "warning"
                            ? "warn"
                            : ""
                      }`}
                  >
                    {isValidNumber(actionPopupEntryDistanceInfo?.pct)
                      ? `${formatNum(actionPopupEntryDistanceInfo.pct)}%`
                      : "-"}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Entry Status</span>
                  <strong
                    className={`action-popup-value ${actionPopupEntryDistanceInfo?.tone === "support"
                        ? "up"
                        : actionPopupEntryDistanceInfo?.tone === "resistance"
                          ? "down"
                          : actionPopupEntryDistanceInfo?.tone === "warning"
                            ? "warn"
                            : ""
                      }`}
                  >
                    {actionPopupEntryDistanceInfo?.label || "-"}
                  </strong>
                </div>
                <div className="action-popup-item">
                  <span className="action-popup-label">Current Premium</span>
                  <strong className="action-popup-value">
                    {isValidNumber(actionPopupPremiumExecutionView?.currentPremium)
                      ? `${displayPrice(actionPopupPremiumExecutionView.currentPremium)}`
                      : "-"}
                  </strong>
                </div>
                <div className="action-popup-item">
                  <span className="action-popup-label">Stop Loss Premium</span>
                  <strong className="action-popup-value down">
                    {displayPrice(actionPopupPremiumExecutionView?.stopLossPremium)}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Premium Upside %</span>
                  <strong className="action-popup-value up">
                    {isValidNumber(actionPopupPremiumExecutionView?.upsidePct)
                      ? `${formatNum(actionPopupPremiumExecutionView.upsidePct)}%`
                      : "-"}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Premium Risk %</span>
                  <strong className="action-popup-value down">
                    {isValidNumber(actionPopupPremiumExecutionView?.downsidePct)
                      ? `${formatNum(actionPopupPremiumExecutionView.downsidePct)}%`
                      : "-"}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Premium Zone</span>
                  <strong
                    className={`action-popup-value ${actionPopupPremiumExecutionView?.premiumTone === "support"
                        ? "up"
                        : actionPopupPremiumExecutionView?.premiumTone === "resistance"
                          ? "down"
                          : actionPopupPremiumExecutionView?.premiumTone === "warning"
                            ? "warn"
                            : ""
                      }`}
                  >
                    {actionPopupPremiumExecutionView?.premiumZone || "-"}
                  </strong>
                </div>

                <div className="action-popup-item">
                  <span className="action-popup-label">Premium Action</span>
                  <strong
                    className={`action-popup-value ${actionPopupPremiumExecutionView?.premiumTone === "support"
                        ? "up"
                        : actionPopupPremiumExecutionView?.premiumTone === "resistance"
                          ? "down"
                          : actionPopupPremiumExecutionView?.premiumTone === "warning"
                            ? "warn"
                            : ""
                      }`}
                  >
                    {actionPopupPremiumExecutionView?.premiumAction || "-"}
                  </strong>
                </div>
              </div>

              <>
                <div className="action-popup-reason">
                  <div className="action-popup-reason-title">Reason</div>
                  <div className="action-popup-reason-text">
                    {actionPopupTradeSignal?.reason || actionPopupReasonText}
                  </div>
                </div>

                {actionPopupWarningText ? (
                  <div className="action-popup-reason">
                    <div className="action-popup-reason-title">Execution Warning</div>
                    <div className="action-popup-reason-text">
                      {actionPopupWarningText}
                    </div>
                  </div>
                ) : null}
              </>

            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}