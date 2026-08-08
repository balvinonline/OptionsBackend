// Technical Indicators Engine

export function calculateVWAP(candles) {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  return candles.map((candle) => {
    const high = Number(candle.high) || 0;
    const low = Number(candle.low) || 0;
    const close = Number(candle.close) || 0;
    const volume = Number(candle.volume) || 0;
    
    const typicalPrice = (high + low + close) / 3;
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
    
    const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
    
    return {
      time: candle.time || candle.ts,
      value: vwap
    };
  });
}

export function calculateEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = null;
  
  return candles.map((candle, i) => {
    const close = Number(candle.close) || 0;
    if (i === 0) {
      ema = close;
    } else {
      ema = close * k + ema * (1 - k);
    }
    return {
      time: candle.time || candle.ts,
      value: ema
    };
  });
}

export function calculateSMA(candles, period) {
  let sum = 0;
  return candles.map((candle, i) => {
    const close = Number(candle.close) || 0;
    sum += close;
    if (i >= period) {
      sum -= Number(candles[i - period].close) || 0;
    }
    const value = i >= period - 1 ? sum / period : null;
    return {
      time: candle.time || candle.ts,
      value: value
    };
  });
}

// Support & Resistance Engine
export function calculateSupportResistance(candles, leftBars = 15, rightBars = 15) {
  const levels = [];
  const lastClose = Number(candles[candles.length - 1]?.close) || null;
  
  // Detect Swing Highs and Lows (Fractals)
  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const currentHigh = Number(candles[i].high) || 0;
    const currentLow = Number(candles[i].low) || 0;
    
    let isSwingHigh = true;
    let isSwingLow = true;
    
    for (let j = 1; j <= leftBars; j++) {
      if ((Number(candles[i - j].high) || 0) > currentHigh) isSwingHigh = false;
      if ((Number(candles[i - j].low) || 0) < currentLow) isSwingLow = false;
    }
    
    for (let j = 1; j <= rightBars; j++) {
      if ((Number(candles[i + j].high) || 0) > currentHigh) isSwingHigh = false;
      if ((Number(candles[i + j].low) || 0) < currentLow) isSwingLow = false;
    }
    
    if (isSwingHigh) levels.push({ price: currentHigh, type: "Resistance", index: i, time: candles[i].time || candles[i].ts });
    if (isSwingLow) levels.push({ price: currentLow, type: "Support", index: i, time: candles[i].time || candles[i].ts });
  }

  // Confluence Engine: Group nearby levels into zones to find the strongest ones
  const threshold = (Number(candles[candles.length - 1]?.close) || 20000) * 0.001; // 0.1% tolerance
  const zones = [];

  levels.forEach(level => {
    const existingZone = zones.find(z => Math.abs(z.price - level.price) < threshold);
    if (existingZone) {
      existingZone.strength += 1;
      existingZone.price = (existingZone.price * (existingZone.strength - 1) + level.price) / existingZone.strength;
    } else {
      zones.push({ ...level, strength: 1 });
    }
  });

  // A level is support or resistance based on the current price, not only its
  // original swing type. Once price crosses old resistance, it becomes support.
  return zones
    .map((zone) => ({
      ...zone,
      type: lastClose && Number(zone.price) <= lastClose ? "Support" : "Resistance",
      distance: lastClose ? Math.abs(Number(zone.price) - lastClose) : 0,
    }))
    .sort((a, b) => a.distance - b.distance || b.strength - a.strength)
    .slice(0, 10);
}

// Signal & Market Structure Engine
export function calculateSignals(candles, emaData, vwapData) {
  const markers = [];
  
  if (!candles || candles.length < 50) return markers;

  for (let i = 50; i < candles.length; i++) {
    const candle = candles[i];
    const prevCandle = candles[i - 1];
    
    const ema = emaData[i]?.value;
    const prevEma = emaData[i - 1]?.value;
    
    const vwap = vwapData[i]?.value;
    
    if (!ema || !vwap) continue;
    
    // Simple EMA 20 crossing Price strategy filtered by VWAP
    const isBullishCross = prevCandle.close <= prevEma && candle.close > ema;
    const isBearishCross = prevCandle.close >= prevEma && candle.close < ema;
    
    if (isBullishCross && candle.close > vwap) {
      markers.push({
        time: candle.time || Math.floor(Number(candle.ts) / 1000) + 19800,
        position: 'belowBar',
        color: '#22c55e',
        shape: 'arrowUp',
        text: 'LONG',
      });
    } else if (isBearishCross && candle.close < vwap) {
      markers.push({
        time: candle.time || Math.floor(Number(candle.ts) / 1000) + 19800,
        position: 'aboveBar',
        color: '#ef4444',
        shape: 'arrowDown',
        text: 'SHORT',
      });
    }
  }
  
  return markers;
}
