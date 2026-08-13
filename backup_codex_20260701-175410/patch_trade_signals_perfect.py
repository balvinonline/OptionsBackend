import shutil

# Step 1: Restore from backup
shutil.copyfile("src/ProfessionalDashboard_Backup_Pre_OptionChecks.jsx", "src/ProfessionalDashboard.jsx")

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Step 2: Add navItem for Trade Signals
navItems_old = """  const navItems = [
    { label: "Dashboard V1", value: "home", icon: <HomeOutlined /> },"""
navItems_new = """  const navItems = [
    { label: "Dashboard V1", value: "home", icon: <HomeOutlined /> },
    { label: "Trade Signals", value: "trade-signals", icon: <ThunderboltOutlined /> },"""
content = content.replace(navItems_old, navItems_new)

# Step 3: Extract the CommandOverviewPanel and OptionBuyerDesk blocks
view_home_marker = """          {view === "home" ? (
            <Spin spinning={showHomeSpinner}>
              <div className="grid gap-4">

                <CommandOverviewPanel
                  setups={dashboardBuyerSetups}"""

# The section we want to remove from home and move to trade-signals ends right before:
#                 {!focusMode ? (
#                   <MarketMoversPreview foBreadth={foBreadth} onOpen={() => setView("movers")} />

# Let's do a reliable replace for this exact block.
# I will find the exact start and end in the backup file.

block_start_str = """                <CommandOverviewPanel"""
block_end_str = """                  collapsed={Boolean(collapsedSections.desk)}
                  onCollapse={() => toggleDashboardSection("desk")}
                />"""

start_idx = content.find(block_start_str)
end_idx = content.find(block_end_str)

if start_idx != -1 and end_idx != -1:
    signals_block = content[start_idx : end_idx + len(block_end_str)]
    
    # We will remove it from the home view
    # And we will insert a new trade-signals view block above the main home view.
    
    content = content[:start_idx] + content[end_idx + len(block_end_str):]
    
    trade_signals_view = f"""          {{view === "trade-signals" ? (
            <Spin spinning={{showHomeSpinner}}>
              <div className="grid gap-4">
{signals_block}
              </div>
            </Spin>
          ) : null}}

"""
    
    # We insert trade_signals_view before {view === "home" ? (
    # We need to make sure we hit the RIGHT {view === "home" ? (.
    # Let's insert it before the first <Card className="pro-card mb-4" styles={{ body: { padding: 12 } }}>
    
    market_strip_view_old = """          {view === "home" ? (
            <Card className="pro-card mb-4" styles={{ body: { padding: 12 } }}>
              <div className="flex flex-wrap items-center gap-3">
                <MarketStrip items={dashboardMarketStrip} onOpen={openTerminal} />"""
                
    market_strip_view_new = trade_signals_view + market_strip_view_old
    
    content = content.replace(market_strip_view_old, market_strip_view_new)

else:
    print("Failed to find signals block!")

# Step 4: Add the <details> wrapper around why-details-grid inside OptionBuyerDesk
details_old = """          <div className="mt-4 flex gap-4">
            <div className="why-details-grid">"""
details_new = """          <div className="mt-4 flex gap-4">
            <details style={{ width: '100%', cursor: 'pointer', outline: 'none' }}>
              <summary style={{ padding: '10px 16px', background: 'var(--section-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px' }}>▼ View Full Detailed Checklist</summary>
              <div className="why-details-grid mt-3">"""
content = content.replace(details_old, details_new)

details_end_old = """              <div><span>Data Age</span><b>{whyFreshness?.label || "Data Stale"}</b></div>
            </div>
            {whySetup.warnings?.length ? ("""
details_end_new = """              <div><span>Data Age</span><b>{whyFreshness?.label || "Data Stale"}</b></div>
            </div>
            </details>
            {whySetup.warnings?.length ? ("""
content = content.replace(details_end_old, details_end_new)

with open("src/ProfessionalDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Applied perfect patch!")
