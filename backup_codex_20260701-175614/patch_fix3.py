import re

jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Close the open fragment tag.
# Right now, we have:
#        {deskDensity === "FAST" ? (
#          <>
#          <div className="fast-action-grid">
#            {rows.map((row) => {
#               ...
#            })}
#        </div>
#        ) : null}
#
# We need to inject the `global-why-cards` right after `</div>` and before `) : null}`, AND close the fragment.

pattern = r'(\s*\)\s*:\s*null\s*\})'

if re.search(pattern, content):
    replacement = r"""
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
        </div>
        </>\1"""
    # Wait, the `) : null}` is for `deskDensity === "FAST" ?`.
    # Let me make sure I'm replacing the right one! There might be multiple `) : null}`.
    # Let's search for the exact block around the end of `fast-action-grid`:
    pass

# Better to use string replacement:
exact_block = """            );
          })}
        </div>
        ) : null}
        <div className="index-decision-grid">"""

fixed_block = """            );
          })}
        </div>
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
        </div>
        </>
        ) : null}
        <div className="index-decision-grid">"""

if exact_block in content:
    content = content.replace(exact_block, fixed_block)
else:
    print("WARNING: Could not find exact block to fix syntax")

with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Applied fix 3")
