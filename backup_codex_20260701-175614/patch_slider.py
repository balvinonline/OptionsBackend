import re

jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the end of `fast-action-grid` with the slider
# Look for the exact sequence
pattern = r'(\}\)\}\s*</div>)'

if re.search(pattern, content):
    slider_ui = r"""\1
        <div className="global-why-cards" style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "8px 0", marginTop: "16px" }}>
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
        </div>"""
    content = re.sub(pattern, slider_ui, content, count=1)
else:
    print("WARNING: could not find end of fast-action-grid")

with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Applied patch")
