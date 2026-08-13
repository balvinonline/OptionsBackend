import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

trap_func = """function getLiquiditySweepTrap(fiveMinuteCandles, side, analytics, spot) {
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
"""

if "function getLiquiditySweepTrap" not in content:
    # Insert right before function getIvRankQuality
    content = content.replace("function getIvRankQuality", trap_func + "\nfunction getIvRankQuality")

# Now inject it into buildBuyerSetup
if "const trapDetector = getLiquiditySweepTrap" not in content:
    content = content.replace(
        "const fifteenMinuteHistory = getTimeframeHistoryBlock(timeframeHistory, \"15\");",
        "const fifteenMinuteHistory = getTimeframeHistoryBlock(timeframeHistory, \"15\");\n  const trapDetector = getLiquiditySweepTrap(fiveMinuteHistory, activeOption?.side, analytics, spot);"
    )

if "trapDetector," not in content:
    content = content.replace("fiiFlow,", "fiiFlow,\n    trapDetector,")

# Now inject it into the UI checks
ui_fii = "{ label: \"FII Trend\", status: whySetup.fiiFlow?.label || \"Collect\", tone: whySetup.fiiFlow?.tone || \"warning\", note: whySetup.fiiFlow?.detail || \"Checks if FIIs are trading against you.\" },"
ui_trap = "{ label: \"Hunt Trap\", status: whySetup.trapDetector?.label || \"Collect\", tone: whySetup.trapDetector?.tone || \"warning\", note: whySetup.trapDetector?.detail || \"Checks if big players are hunting stop losses.\" },"

if "FII Trend" not in content:
    content = content.replace(
        "{ label: \"OI / PCR\",",
        ui_fii + "\n        { label: \"OI / PCR\","
    )

if "Hunt Trap" not in content:
    content = content.replace(
        "{ label: \"S/R Trap\",",
        ui_trap + "\n        { label: \"S/R Trap\","
    )

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Patched Stop Loss Hunt and FII UI.")
