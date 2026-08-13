import re

with open("src/ProfessionalDashboard.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add "Trade Signals" to navItems
nav_old = """  const navItems = [
    { label: "Dashboard V1", value: "home", icon: <HomeOutlined /> },"""
nav_new = """  const navItems = [
    { label: "Dashboard V1", value: "home", icon: <HomeOutlined /> },
    { label: "Trade Signals", value: "trade-signals", icon: <ThunderboltOutlined /> },"""
content = content.replace(nav_old, nav_new)

# 2. Extract CommandOverviewPanel and OptionBuyerDesk from view === "home"
# We need to find the exact block:
#                 <CommandOverviewPanel
# ...
#                 />
#
#                 <OptionBuyerDesk
# ...
#                 />
home_view_block = r"(<CommandOverviewPanel[\s\S]*?/>\s*<OptionBuyerDesk[\s\S]*?/>)"

match = re.search(home_view_block, content)
if match:
    signals_block = match.group(1)
    # Remove it from home
    content = content.replace(signals_block, "")
    
    # Add it as a new view
    new_view_block = """          ) : view === "trade-signals" ? (
            <Spin spinning={showHomeSpinner}>
              <div className="grid gap-4">
""" + signals_block + """
              </div>
            </Spin>"""
    
    # Insert new_view_block before the home view check
    home_condition = '          ) : view === "home" ? ('
    content = content.replace(home_condition, new_view_block + '\n' + home_condition)
else:
    print("Failed to find CommandOverviewPanel and OptionBuyerDesk block.")

# 3. Clean up OptionBuyerDesk "Why" section to hide full details by default
# We will wrap the huge why-details-grid in a hidden div by default
details_old = """          <div className="mt-4 flex gap-4">
            <div className="why-details-grid">
"""
details_new = """          <div className="mt-4 flex gap-4">
            <details style={{ width: '100%', cursor: 'pointer' }}>
              <summary style={{ padding: '8px', background: 'var(--section-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', fontWeight: 'bold' }}>Show Full Checklist</summary>
              <div className="why-details-grid mt-3">
"""
content = content.replace(details_old, details_new)

# Close the details tag where appropriate
# The details grid ends at:
#               <div className="why-group-title mt-2">Extra Safety</div>
#               ...
#               <div><span>Data Age</span><b>{whyFreshness?.label || "Data Stale"}</b></div>
#             </div>
#             {whySetup.warnings?.length ? (
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

print("ProfessionalDashboard.jsx patched successfully for Trade Signals page.")
