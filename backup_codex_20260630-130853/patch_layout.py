import re

jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Restore CommandOverviewPanel in trade-signals view
trade_signals_pattern = r'(\{view === "trade-signals" \? \(\s*<Spin spinning=\{showHomeSpinner\}>\s*<div className="grid gap-4">)'
if re.search(trade_signals_pattern, content):
    replacement = r'\1\n                {!focusMode && (\n                  <CommandOverviewPanel\n                    setups={dashboardBuyerSetups}\n                    mood={marketMood}\n                    cards={homeCards}\n                    pcrHistory={pcrHistory}\n                    advanceDecline={advanceDecline}\n                    foBreadth={foBreadth}\n                    selectedSymbol={dashboardSelectedSymbol}\n                    collapsed={Boolean(collapsedSections.cmd)}\n                    onCollapse={() => toggleDashboardSection("cmd")}\n                    onOpenPcr={() => setPcrHistoryModal(true)}\n                  />\n                )}'
    content = re.sub(trade_signals_pattern, replacement, content, count=1)
else:
    print("WARNING: Could not find trade-signals block to inject CommandOverviewPanel")

# 2. Extract Why cards from OptionBuyerDesk loop
extract_pattern = r'(const whyCards = \[[\s\S]*?\];[\s\S]*?<div className="fast-why-cards".*?>[\s\S]*?</div>)'
content = re.sub(extract_pattern, "", content)

# Inject the logic to build `allWhyCards` and render them at the bottom of the grid
fast_mode_pattern = r'(\{deskDensity === "FAST" \? \(\s*<div className="fast-action-grid">)'
if re.search(fast_mode_pattern, content):
    all_why_cards_logic = """{deskDensity === "FAST" ? (
          <>
          <div className="fast-action-grid">"""
    content = re.sub(fast_mode_pattern, all_why_cards_logic, content, count=1)
else:
    print("WARNING: Could not find fast_mode_pattern")

grid_end_pattern = r'(</div>\s*\)\s*:\s*deskDensity === "SIMPLE")'
if re.search(grid_end_pattern, content):
    slider_ui = """</div>
          <div className="global-why-cards" style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "8px 0", marginTop: "8px" }}>
            {rows.flatMap(row => {
              const symbolLabel = row.label.split(" ")[0];
              const setup = row.setup || {};
              const writerShift = setup?.optionFlowDetector?.writerShift || {};
              
              return [
                { label: `${symbolLabel} Writers`, status: writerShift.label || "Collecting", tone: writerShift.tone || "warning", note: writerShift.tone === "success" ? "OI flow supports this side." : writerShift.tone === "error" ? "OI flow is against this side." : "OI flow is not clear yet." },
                { label: `${symbolLabel} VWAP`, status: setup?.vwapState?.label || "Collecting", tone: setup?.vwapState?.tone || "warning", note: setup?.vwapState?.aligned ? "Price is on the right side of VWAP." : "VWAP is not supporting." },
                { label: `${symbolLabel} Big Stocks`, status: setup?.heavyweightCheck?.label || "Collect", tone: setup?.heavyweightCheck?.tone || "warning", note: setup?.heavyweightCheck?.passed === false ? "Index heavyweights are not helping." : "Heavyweights are helping the move." }
              ];
            }).map((item, idx) => (
              <div className={`why-fast-card ${item.tone || 'warning'}`} key={idx} style={{ minWidth: "160px", flexShrink: 0, margin: 0 }}>
                <span>{item.label}</span>
                <b>{item.status}</b>
                <small>{item.note}</small>
              </div>
            ))}
          </div>
          </>
        ) : deskDensity === "SIMPLE" """
    content = re.sub(grid_end_pattern, slider_ui, content, count=1)
else:
    print("WARNING: Could not find grid_end_pattern")

# 3. Prevent rendering the detail panel fallback on trade-signals view
detail_fallback_pattern = r'(:\s*\(\s*<div className="grid gap-4">\s*<Card className="pro-card" styles=\{\{ body: \{ padding: 14 \} \}\}>)'
if re.search(detail_fallback_pattern, content):
    replacement = r': view === "trade-signals" ? null \1'
    content = re.sub(detail_fallback_pattern, replacement, content, count=1)
else:
    print("WARNING: Could not find detail_fallback_pattern")

with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Applied patch")
