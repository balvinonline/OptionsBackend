with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

old_fii_func = """function getFiiFlowBias(fiiDii) {
  const longOi = asNum(fiiDii?.fii?.indexOptions?.long, 0);
  const shortOi = asNum(fiiDii?.fii?.indexOptions?.short, 0);
  const total = longOi + shortOi;
  
  if (total === 0) return { passed: true, label: "FII Neutral", detail: "FII Index Flow Neutral", tone: "neutral", bias: 0 };
  
  const ratio = longOi / total;
  if (ratio > 0.6) return { passed: true, label: `FII Bull (${(ratio*100).toFixed(0)}%)`, detail: "FII Index Flow heavily Long", tone: "success", bias: 1 };
  if (ratio < 0.4) return { passed: false, label: `FII Bear (${(ratio*100).toFixed(0)}%)`, detail: "FII Index Flow heavily Short", tone: "error", bias: -1 };
  return { passed: true, label: "FII Mixed", detail: "FII Index Flow Mixed", tone: "neutral", bias: 0 };
}"""

new_fii_func = """function getFiiFlowBias(fiiDii, side) {
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
}"""

if old_fii_func in content:
    content = content.replace(old_fii_func, new_fii_func)
else:
    print("Could not find old_fii_func!")

# Also replace the call site
old_call = "const fiiFlow = getFiiFlowBias(fiiDii);"
new_call = "const fiiFlow = getFiiFlowBias(fiiDii, activeOption?.side);"

if old_call in content:
    content = content.replace(old_call, new_call)
else:
    print("Could not find old_call site!")

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated ProfessionalDashboard.jsx!")
