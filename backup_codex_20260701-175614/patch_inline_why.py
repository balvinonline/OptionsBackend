import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace start of fast-action-card
card_start_old = """              return (
                <div className={`fast-action-card ${tone}`} key={`fast-${row.symbol}`}>"""

card_start_new = """              const whyCards = [
                { label: "Writers", status: writerShift.label || "Collecting", tone: writerShift.tone || "warning", note: writerShift.tone === "success" ? "OI flow supports this side." : writerShift.tone === "error" ? "OI flow is against this side." : "OI flow is not clear yet." },
                { label: "VWAP", status: setup?.vwapState?.label || "Collecting", tone: setup?.vwapState?.tone || "warning", note: setup?.vwapState?.aligned ? "Price is on the right side of VWAP." : "VWAP is not supporting." },
                { label: "Big Stocks", status: setup?.heavyweightCheck?.label || "Collect", tone: setup?.heavyweightCheck?.tone || "warning", note: setup?.heavyweightCheck?.passed === false ? "Index heavyweights are not helping." : "Heavyweights are helping the move." },
                { label: "Entry Score", status: `${setup?.professionalGate?.entryScore ?? 0}/8`, tone: (setup?.professionalGate?.entryScore ?? 0) >= 6 ? "success" : "warning", note: "Entry timing conditions like 5m, volume, spread and trigger." },
                { label: "Writers Shift", status: writerShift.label || "Collecting", tone: writerShift.tone || "warning", note: writerShift.note || "Waiting for OI change." },
                { label: "Strike OI Shift", status: optionTrack.oiShiftLabel || "Collecting", tone: optionTrack.oiShiftTone || "warning", note: optionTrack.oiShiftNote || "Waiting for strike OI." },
                { label: "Key OI Level", status: setup?.smartMoney?.label || "Collect", tone: setup?.smartMoney?.tone || "warning", note: setup?.smartMoney?.tone === "error" ? "Important OI level is blocking the trade." : "Important OI level is not blocking badly." },
                { label: "Premium Move", status: setup?.premiumMomentum?.label || "Collect", tone: setup?.premiumMomentum?.tone || "warning", note: "Option premium should move with spot." },
                { label: "FII Trend", status: setup?.fiiFlow?.label || "Collect", tone: setup?.fiiFlow?.tone || "warning", note: setup?.fiiFlow?.detail || "Checks if FIIs are trading against you." }
              ];

              return (
                <div className="fast-action-wrapper" key={`fast-${row.symbol}`} style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  <div className={`fast-action-card ${tone}`}>"""

content = content.replace(card_start_old, card_start_new)

# 2. Remove why-details-grid
details_grid_pattern = r"""\s*\{\s*displayOption\s*\?\s*\(\s*<div\s+className="why-details-grid".*?</div>\s*\)\s*:\s*null\s*\}\s*"""
content = re.sub(details_grid_pattern, "\n\n", content, flags=re.DOTALL)

# 3. Replace end of fast-action-card
card_end_old = """                      Chain
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>"""

card_end_new = """                      Chain
                    </Button>
                  </div>
                </div>

                <div className="fast-why-cards" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                  {whyCards.map(item => (
                    <div className={`why-check ${item.tone}`} key={item.label} style={{ minWidth: "220px", flexShrink: 0, padding: "8px", margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "bold", color: "inherit", opacity: 0.8 }}>{item.label}</span>
                        <Tag color={item.tone} style={{ margin: 0, padding: "0 6px", fontSize: "10px", lineHeight: "18px" }}>{item.status}</Tag>
                      </div>
                      <p style={{ fontSize: "10px", marginTop: "6px", marginBottom: 0, opacity: 0.9 }}>{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>"""

content = content.replace(card_end_old, card_end_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied")
