const fs = require('fs');
const http = require('http');

http.get('http://127.0.0.1:5000/api/fyers/history?symbol=NIFTY&resolution=5', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const candles = json.candles;
    
    // Simulate normalizeHistoryCandles
    const normalized = candles.map(row => {
      let rawTime = row.ts;
      let stamp = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
      return { ts: stamp, open: row.open, close: row.close };
    });

    // Simulate chartDataMap
    const chartDataMap = new Map();
    let lastTime = 0;
    normalized.forEach((row, i) => {
      let time = Math.floor(Number(row.ts) / 1000) + 19800; 
      if (!time || isNaN(time)) time = 1781495100 + (i * 300);
      if (time <= lastTime) time = lastTime + 300;
      lastTime = time;
      chartDataMap.set(time, { time, close: row.close, ts: row.ts });
    });

    const chartData = Array.from(chartDataMap.values()).sort((a, b) => a.time - b.time);
    console.log("Chart Data length:", chartData.length);
    console.log("First 3:", chartData.slice(0, 3));
    console.log("Last 3:", chartData.slice(-3));
    
    // Simulate calculateSignals
    const markers = [];
    for (let i = 50; i < chartData.length; i++) {
        markers.push({
            time: chartData[i].time || Math.floor(Number(chartData[i].ts) / 1000) + 19800,
            close: chartData[i].close
        });
    }
    console.log("Markers length:", markers.length);
    console.log("Unique marker times:", new Set(markers.map(m => m.time)).size);
  });
});
