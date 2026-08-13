import re

jsx_file = "src/ProfessionalDashboard.jsx"
with open(jsx_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove the bad global-why-cards at the end of index-decision-grid and remove the wrong </>
bad_end_block = """                  <Button size="small" type="primary" icon={<DashboardOutlined />} onClick={(event) => openDetail(event, "Signal")}>Terminal</Button>
                </div>
              </div>
            );
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
        </>"""

good_end_block = """                  <Button size="small" type="primary" icon={<DashboardOutlined />} onClick={(event) => openDetail(event, "Signal")}>Terminal</Button>
                </div>
              </div>
            );
          })}
        </div>"""

if bad_end_block in content:
    content = content.replace(bad_end_block, good_end_block)
else:
    print("WARNING: Could not find bad_end_block")

# 2. Inject the global-why-cards at the correct place!
# The correct place is at the end of fast-action-grid, BEFORE the `) : null}`.
# Wait! In the previous replace_file_content, I replaced:
#                  </div>
#              );
#            })}
#        </div>
#        ) : null}
#        <div className="index-decision-grid">
# Wait, let's see if that was ACTUALLY the end of fast-action-grid!
# In `patch_fix2.py`, I fixed the end of `fast-action-grid` to look like this:
#                  </div>
#                  </div>
#              );
#            })}
#        </div>
#        ) : null}
#        <div className="index-decision-grid">

correct_target = """                  </div>
                  </div>
              );
            })}
        </div>
        ) : null}
        <div className="index-decision-grid">"""

if correct_target in content:
    replacement = """                  </div>
                  </div>
              );
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
        ) : null}
        <div className="index-decision-grid">"""
    content = content.replace(correct_target, replacement)
else:
    print("WARNING: Could not find correct_target")


with open(jsx_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Applied fix 4")
