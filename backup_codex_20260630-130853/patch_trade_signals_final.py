import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# I will find the MarketStrip block and the view === "home" blocks
# The area starts around <div style={{ position: 'absolute', top: 76...
# Let's locate the end of the top alerts block:
#               />
#             ) : null}
#           </div>
# 

start_marker = "            ) : null}\n          </div>\n"
start_idx = content.find(start_marker)

end_marker = "          ) : view === \"movers\" ? ("
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    before = content[:start_idx + len(start_marker)]
    after = content[end_idx:]
    
    # We will reconstruct the exact middle section
    # Extract the huge CommandOverviewPanel and OptionBuyerDesk blocks from the text
    # Let's just use the known structure we saved earlier
    signals_block = """                <CommandOverviewPanel
                  setups={dashboardBuyerSetups}
                  sectors={sectors}
                  mood={marketMood}
                  cards={homeCards}
                  pcrHistory={pcrHistory}
                  advanceDecline={advanceDecline}
                  foBreadth={foBreadth}
                  selectedSymbol={dashboardSelectedSymbol}
                  collapsed={Boolean(collapsedSections.market)}
                  onCollapse={() => toggleDashboardSection("market")}
                  onOpen={openTerminal}
                  onOpenMarket={() => setView("movers")}
                  onOpenPcr={openPcrDetail}
                />

                <OptionBuyerDesk
                  setups={dashboardBuyerSetups}
                  cards={homeCards}
                  stripByLabel={stripByLabel}
                  advanceDecline={advanceDecline}
                  vix={vix}
                  mood={marketMood}
                  news={marketNews}
                  pcrHistory={pcrHistory}
                  optionSignalHistory={optionSignalHistory}
                  buyerMode={buyerMode}
                  onModeChange={setBuyerMode}
                  signalJournalCount={signalJournal.length}
                  signalJournal={signalJournal}
                  gateHistoryCount={gateHistory.length}
                  gateHistory={gateHistory}
                  readyAlertsEnabled={readyAlertsEnabled}
                  readyAlertBeepMuted={readyAlertBeepMuted}
                  onReadyAlertsChange={setReadyAlertsEnabled}
                  onReadyBeepMutedChange={setReadyAlertBeepMuted}
                  onTestReadyAlert={testReadyAlert}
                  onExportSignals={exportSignalJournal}
                  onExcelReport={downloadSignalReportExcel}
                  onPdfReport={downloadSignalReportPdf}
                  loading={loadingSetups}
                  onOpen={openTerminal}
                  onChart={openChartPopup}
                  onOptionChain={openOptionChainPopup}
                  onQuick={openQuick}
                  selectedSymbol={dashboardSelectedSymbol}
                  collapsed={Boolean(collapsedSections.desk)}
                  onCollapse={() => toggleDashboardSection("desk")}
                />"""

    middle = """
          {view === "home" ? (
            <Card className="pro-card mb-4" styles={{ body: { padding: 12 } }}>
              <div className="flex flex-wrap items-center gap-3">
                <MarketStrip items={dashboardMarketStrip} onOpen={openTerminal} />
              </div>
            </Card>
          ) : null}

          {view === "trade-signals" ? (
            <Spin spinning={showHomeSpinner}>
              <div className="grid gap-4">
""" + signals_block + """
              </div>
            </Spin>
          ) : view === "home" ? (
            <Spin spinning={showHomeSpinner}>
              <div className="grid gap-4">
                {!focusMode ? (
                  <MarketMoversPreview foBreadth={foBreadth} onOpen={() => setView("movers")} />
                ) : null}

                {!focusMode ? (
                  <div className="sector-news-grid">
                    <SectorBlock sectors={sectors} collapsed={Boolean(collapsedSections.sectors)} onCollapse={() => toggleDashboardSection("sectors")} />
                    <MarketNewsPanel news={marketNews} loading={loadingNews} />
                  </div>
                ) : null}
              </div>
            </Spin>
"""
    new_content = before + middle + after
    with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Dashboard views successfully reconstructed.")
else:
    print(f"Markers not found. start_idx={start_idx}, end_idx={end_idx}")

