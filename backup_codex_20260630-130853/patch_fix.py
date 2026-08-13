import re

jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove the incorrectly injected global-why-cards at line 4209
bad_injection_pattern = r'(\s*<div className="global-why-cards".*?>[\s\S]*?</div>)'
# But wait, it's safer to just find the exact block and replace it with nothing.
# Let's search for the exact text block
bad_block = """        <div className="global-why-cards" style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "8px 0", marginTop: "16px" }}>
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

if bad_block in content:
    content = content.replace("\n" + bad_block, "")
else:
    print("WARNING: Could not find bad block to remove")

# 2. Inject it at the correct place!
# The correct place is inside OptionBuyerDesk:
#            );
#          })}
#        </div>
#      </div>
#      <Modal
correct_pattern = r'(            \);\s*\}\)\}\s*</div>\s*</div>)'

if re.search(correct_pattern, content):
    replacement = r"""            );
          })}
        </div>
        <div className="global-why-cards" style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "8px 0", marginTop: "16px" }}>
          {setups.flatMap(row => {
            const symbolLabel = row.label.split(" ")[0];
            const setup = row.signal || {};
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
      </div>"""
    content = re.sub(correct_pattern, replacement, content, count=1)
else:
    print("WARNING: Could not find correct pattern for OptionBuyerDesk")

with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Applied fix")
