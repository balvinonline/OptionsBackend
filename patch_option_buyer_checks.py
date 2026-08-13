import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update function signature
old_sig = """function buildProfessionalTradeGate({
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
}) {"""

new_sig = """function buildProfessionalTradeGate({
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
  fiiFlow,
  trapDetector,
  greekQuality,
  maxPainShift,
}) {"""
content = content.replace(old_sig, new_sig)

# 2. Add to setupChecks
setup_checks_str = """  const setupChecks = [
    { key: "fii", label: "FII/DII", passed: fiiFlow?.passed !== false, tone: fiiFlow?.tone || "warning", detail: fiiFlow?.label || "Collect" },
    { key: "greeks", label: "Greeks", passed: greekQuality?.passed !== false, tone: greekQuality?.tone || "warning", detail: greekQuality?.label || "Collect" },
    { key: "maxPain", label: "Max Pain", passed: maxPainShift?.passed !== false, tone: maxPainShift?.tone || "warning", detail: maxPainShift?.label || "Collect" },"""
content = content.replace("  const setupChecks = [", setup_checks_str)

# 3. Add to entryChecks
entry_checks_str = """  const entryChecks = [
    { key: "trap", label: "Trap Sweep", passed: trapDetector?.passed !== false, tone: trapDetector?.tone || "warning", detail: trapDetector?.label || "No Trap" },"""
content = content.replace("  const entryChecks = [", entry_checks_str)

# 4. Add to hardBlocks
hard_blocks_old = """  const hardBlocks = [
    !setupSide ? "No option side" : "",
    !vwapState?.aligned ? "VWAP conflict" : "",
    (isNum(rr) && Number(rr) < 1.5) ? "R:R below 1:1.5" : "",
    freshness.tone === "error" ? "Stale candle data" : "",
    expiryCheck?.tone === "error" ? "Expiry-day theta risk" : "",
    spreadCheck?.tone === "error" ? "Wide bid/ask spread" : "",
    sessionQuality?.passed === false ? "Session blocked" : "",
    trigger?.invalidated ? "Setup invalidated" : "","""
hard_blocks_new = hard_blocks_old + """
    fiiFlow?.tone === "error" ? "FII writing against side" : "",
    trapDetector?.tone === "error" ? "Stop-loss hunt active" : "","""
content = content.replace(hard_blocks_old, hard_blocks_new)

# 5. Update function call
call_old = """    dataFreshness: timeframeFreshness,
    premiumMomentum,
    trigger,
    sessionQuality,
  });
  const noTradeGate ="""
call_new = """    dataFreshness: timeframeFreshness,
    premiumMomentum,
    trigger,
    sessionQuality,
    fiiFlow,
    trapDetector,
    greekQuality,
    maxPainShift,
  });
  const noTradeGate ="""
content = content.replace(call_old, call_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("ProfessionalDashboard.jsx patched successfully.")
