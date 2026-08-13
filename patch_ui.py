import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update the tags
decision_logic = """const decisionText = setup?.noTradeGate?.blocked ? "AVOID" : readiness?.tone === "success" ? "READY" : setup?.priceOverride?.active ? "SCALP" : "WAIT";
              const displayDecisionText = decisionText === "READY" || decisionText === "SCALP" ? "TAKE ENTRY" : decisionText;
              const tagStyles = {
                AVOID: { background: "#ff4d4f", color: "#fff", fontWeight: "bold", border: "none" },
                WAIT: { background: "#faad14", color: "#000", fontWeight: "bold", border: "none" },
                READY: { background: "#52c41a", color: "#fff", fontWeight: "bold", border: "none" },
                SCALP: { background: "#52c41a", color: "#fff", fontWeight: "bold", border: "none" }
              };
              const decisionStyle = tagStyles[decisionText] || {};"""

content = content.replace(
    'const decisionText = setup?.noTradeGate?.blocked ? "AVOID" : readiness?.tone === "success" ? "READY" : setup?.priceOverride?.active ? "SCALP" : "WAIT";',
    decision_logic
)
content = content.replace(
    '<Tag color={decisionTone}>{decisionText}</Tag>',
    '<Tag style={decisionStyle}>{displayDecisionText}</Tag>'
)


# 2. Hide dashboard-topbar for charts
topbar_start = '<div className="dashboard-topbar">'
topbar_end = """              </div>
            </Space>
          </div>"""
replacement_end = """              </div>
            </Space>
          </div>
          ) : null}"""
content = content.replace(topbar_start, '{view !== "charts" ? (\n          <div className="dashboard-topbar">')
content = content.replace(topbar_end, replacement_end)


# 3. Modify DualChartPage signature
sig_old = 'function DualChartPage({ cards = {}, setups = [], stripByLabel = {}, selectedSymbol = "NIFTY", onSymbolChange, themeMode = "light", autoRefresh = true }) {'
sig_new = 'function DualChartPage({ cards = {}, setups = [], stripByLabel = {}, selectedSymbol = "NIFTY", onSymbolChange, themeMode = "light", autoRefresh = true, setView, sidebarVisible, setSidebarVisible }) {'
content = content.replace(sig_old, sig_new)


# 4. Inject buttons into DualChartPage
buttons = """<Tooltip title="Show or hide sidebar">
              <Switch checked={sidebarVisible} onChange={setSidebarVisible} checkedChildren="Menu" unCheckedChildren="Hide" />
            </Tooltip>
            <Button icon={<HomeOutlined />} onClick={() => setView?.("home")}>
              Dashboard
            </Button>
            <div className="chart-index-select">"""
content = content.replace('<div className="chart-index-select">', buttons)


# 5. Pass props to DualChartPage call
call_old = """              <DualChartPage
                cards={homeCards}
                setups={buyerSetups}
                stripByLabel={stripByLabel}
                selectedSymbol={symbol}
                onSymbolChange={setSymbol}
                themeMode={themeMode}
                autoRefresh={autoRefresh}
              />"""
call_new = """              <DualChartPage
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
              />"""
content = content.replace(call_old, call_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Patched UI changes successfully.")
