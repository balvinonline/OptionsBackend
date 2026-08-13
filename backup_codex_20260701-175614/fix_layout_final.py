import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

slider_ui = """
                <div className="global-why-cards" style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "8px 0", marginTop: "16px" }}>
                  {dashboardBuyerSetups.flatMap(row => {
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
                </div>"""

# Insert slider at the end of the trade-signals view grid
target = """                  collapsed={Boolean(collapsedSections.desk)}
                  onCollapse={() => toggleDashboardSection("desk")}
                />"""

if target in content:
    content = content.replace(target, target + slider_ui)
    print("Injected slider successfully.")
else:
    print("Could not find target for slider insertion.")

# Adjust dashboard-header width padding if needed
header_target = """          <div className="dashboard-header" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-color)",
            padding: "16px 20px","""

header_replacement = """          <div className="dashboard-header" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-color)",
            padding: "16px 8px",
            width: "100%",
            maxWidth: "100%","""

if header_target in content:
    content = content.replace(header_target, header_replacement)
    print("Adjusted header width successfully.")

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)
