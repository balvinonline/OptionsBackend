import re
import os

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. GateHistoryPage props and buttons
gate_header_old = """function GateHistoryPage({ gateHistory = [], selectedSymbol = "ALL", onSymbolChange, onBack }) {"""
gate_header_new = """function GateHistoryPage({ gateHistory = [], selectedSymbol = "ALL", onSymbolChange, onBack, onExportSignals, signalJournalCount, onExcelReport, onPdfReport }) {"""
content = content.replace(gate_header_old, gate_header_new)

gate_buttons_old = """          <Space>
            <Button onClick={exportGateHistory}>Export CSV</Button>
            <Button icon={<HomeOutlined />} onClick={onBack}>Dashboard</Button>
          </Space>"""
gate_buttons_new = """          <Space wrap>
            {onExportSignals ? <Button size="small" onClick={onExportSignals}>Export Signals{signalJournalCount ? ` ${signalJournalCount}` : ""}</Button> : null}
            {onExcelReport ? <Button size="small" onClick={onExcelReport}>Excel Report</Button> : null}
            {onPdfReport ? <Button size="small" onClick={onPdfReport}>PDF Report</Button> : null}
            <Button size="small" onClick={exportGateHistory}>Export CSV</Button>
            <Button size="small" icon={<HomeOutlined />} onClick={onBack}>Dashboard</Button>
          </Space>"""
content = content.replace(gate_buttons_old, gate_buttons_new)

# Update ProfessionalDashboard to pass props to GateHistoryPage
gate_usage_old = """              <GateHistoryPage
                gateHistory={gateHistory}
                selectedSymbol={gateDetailSymbol}
                onSymbolChange={setGateDetailSymbol}
                onBack={() => setView("home")}
              />"""
gate_usage_new = """              <GateHistoryPage
                gateHistory={gateHistory}
                selectedSymbol={gateDetailSymbol}
                onSymbolChange={setGateDetailSymbol}
                onBack={() => setView("home")}
                onExportSignals={exportSignalJournal}
                signalJournalCount={signalJournal.length}
                onExcelReport={downloadSignalReportExcel}
                onPdfReport={downloadSignalReportPdf}
              />"""
content = content.replace(gate_usage_old, gate_usage_new)


# 2. OptionBuyerDesk remove export buttons
desk_export_old = """        <Space size={8} wrap>
          <Button size="small" onClick={onExportSignals}>
            Export Signals{signalJournalCount ? ` ${signalJournalCount}` : ""}
          </Button>
          <Button size="small" onClick={onExcelReport}>
            Excel Report
          </Button>
          <Button size="small" onClick={onPdfReport}>
            PDF Report
          </Button>"""
desk_export_new = """        <Space size={8} wrap>"""
content = content.replace(desk_export_old, desk_export_new)

# Add row.reason to OptionBuyerDesk cards
desk_reason_old = """              <div className="setup-actions">
                <Button size="small" type="primary" onClick={() => onAction(row, "TAKEN")}>Taken</Button>"""
desk_reason_new = """              {row.reason ? (
                <div style={{ padding: "4px 8px", background: "rgba(239,68,68,0.1)", color: "#ef4444", borderRadius: "4px", fontSize: "11px", marginBottom: "8px", fontWeight: "600", border: "1px solid rgba(239,68,68,0.15)" }}>
                  {row.reason}
                </div>
              ) : null}
              <div className="setup-actions">
                <Button size="small" type="primary" onClick={() => onAction(row, "TAKEN")}>Taken</Button>"""
content = content.replace(desk_reason_old, desk_reason_new)


# 3. PcrOiTrackerCard add 5m and 15m
pcr_tracker_old = """    const pcrTrack = getPcrTracker(pcrHistory, item, analytics?.pcr ?? setup?.pcr);
    const option = setup?.option || {};"""
pcr_tracker_new = """    const pcrTrack = getPcrTracker(pcrHistory, item, analytics?.pcr ?? setup?.pcr);
    const five = getPcrWindowStats(pcrHistory, item, pcrTrack.current, 5);
    const fifteen = getPcrWindowStats(pcrHistory, item, pcrTrack.current, 15);
    const option = setup?.option || {};"""
content = content.replace(pcr_tracker_old, pcr_tracker_new)

pcr_return_old = """      oiChange,
      pcrDirection,"""
pcr_return_new = """      oiChange,
      pcrDirection,
      five,
      fifteen,"""
content = content.replace(pcr_return_old, pcr_return_new)

pcr_row_old = """              <strong>{row.label}</strong>
              <span><DirectionValue value={row.pcrDirection}>{formatNum(row?.pcrTrack?.current, 2)}</DirectionValue></span>
              <span><DirectionValue value={row?.oiTotals?.putOiChange}>{formatCompactInt(row.putOi)}</DirectionValue> Put OI</span>"""
pcr_row_new = """              <strong>{row.label}</strong>
              <span><DirectionValue value={row.pcrDirection}>{formatNum(row?.pcrTrack?.current, 2)}</DirectionValue></span>
              <span style={{opacity: 0.8}}><DirectionValue value={row?.five?.delta}>{formatNum(row?.five?.start, 2)} (5m)</DirectionValue></span>
              <span style={{opacity: 0.8}}><DirectionValue value={row?.fifteen?.delta}>{formatNum(row?.fifteen?.start, 2)} (15m)</DirectionValue></span>
              <span><DirectionValue value={row?.oiTotals?.putOiChange}>{formatCompactInt(row.putOi)}</DirectionValue> Put OI</span>"""
content = content.replace(pcr_row_old, pcr_row_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

# 4. CSS Update for header-clock and pcr-all-row
with open("src/ProfessionalDashboard.css", "r", encoding="utf-8") as f:
    css_content = f.read()

# header-clock width
css_clock_old = """  width: 146px;"""
css_clock_new = """  width: auto;
  min-width: 146px;"""
css_content = css_content.replace(css_clock_old, css_clock_new)

css_clock_max_old = """  max-width: 132px;"""
css_clock_max_new = """  max-width: none;"""
css_content = css_content.replace(css_clock_max_old, css_clock_max_new)

# pcr-all-row grid
css_pcr_grid_old = """  grid-template-columns: minmax(90px, 0.9fr) minmax(58px, 0.45fr) minmax(124px, 1.15fr) minmax(120px, 1.15fr);"""
css_pcr_grid_new = """  grid-template-columns: minmax(90px, 0.9fr) minmax(48px, 0.45fr) minmax(64px, 0.6fr) minmax(64px, 0.6fr) minmax(110px, 1.15fr) minmax(110px, 1.15fr);"""
css_content = css_content.replace(css_pcr_grid_old, css_pcr_grid_new)

css_pcr_grid_old_2 = """    grid-template-columns: 0.9fr 0.4fr 1.1fr 1.2fr;"""
css_pcr_grid_new_2 = """    grid-template-columns: 0.9fr 0.4fr 0.6fr 0.6fr 1.1fr 1.1fr;"""
css_content = css_content.replace(css_pcr_grid_old_2, css_pcr_grid_new_2)

with open("src/ProfessionalDashboard.css", "w", encoding="utf-8") as f:
    f.write(css_content)

print("UI tweaks successfully applied.")
