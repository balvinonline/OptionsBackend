import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

absorp_func = """function getVolumeAbsorptionTrap(fiveMinuteCandles, side) {
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
"""

if "function getVolumeAbsorptionTrap" not in content:
    content = content.replace("function getLiquiditySweepTrap", absorp_func + "\nfunction getLiquiditySweepTrap")

if "const volumeAbsorption =" not in content:
    content = content.replace(
        "const trapDetector = getLiquiditySweepTrap(fiveMinuteHistory, activeOption?.side, analytics, spot);",
        "const trapDetector = getLiquiditySweepTrap(fiveMinuteHistory, activeOption?.side, analytics, spot);\n  const volumeAbsorption = getVolumeAbsorptionTrap(fiveMinuteHistory, activeOption?.side);"
    )

if "volumeAbsorption," not in content:
    content = content.replace("trapDetector,", "trapDetector,\n    volumeAbsorption,")

ui_absorp = "{ label: \"Smart Vol\", status: whySetup.volumeAbsorption?.label || \"Collect\", tone: whySetup.volumeAbsorption?.tone || \"warning\", note: whySetup.volumeAbsorption?.detail || \"Checks if Smart Money is absorbing volume.\" },"

if "Smart Vol" not in content:
    content = content.replace(
        "{ label: \"Volume\", status: whySetup.volumeBreakout",
        ui_absorp + "\n        { label: \"Volume\", status: whySetup.volumeBreakout"
    )

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Patched Smart Volume Absorption UI.")
