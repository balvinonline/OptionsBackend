import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

signals_block = """
                <CommandOverviewPanel
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
                />
"""

new_view = '          {view === "trade-signals" ? (\n            <Spin spinning={showHomeSpinner}>\n              <div className="grid gap-4">\n' + signals_block + '              </div>\n            </Spin>\n          ) : view === "home" ? ('

home_cond = '{view === "home" ? ('
if home_cond in content:
    content = content.replace(home_cond, new_view)
else:
    print("Could not find {view === 'home' ? (")

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Recovered and added trade-signals view.")
