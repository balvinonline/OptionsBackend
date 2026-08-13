import re

backup_file = "src/ProfessionalDashboard_Backup_Pre_OptionChecks.jsx"
current_file = "src/ProfessionalDashboard.jsx"

with open(backup_file, "r", encoding="utf-8") as f:
    backup_content = f.read()

with open(current_file, "r", encoding="utf-8") as f:
    current_content = f.read()

# 1. Extract inner grid from backup
start_idx = backup_content.find('<div className="fast-action-grid">')
if start_idx != -1:
    end_idx = backup_content.find(') : deskDensity === "SIMPLE"', start_idx)
    block = backup_content[start_idx:end_idx]
    # In backup, the block ends with 
    #        </div>
    #      </div>
    #      
    # We want to keep everything from <div className="fast-action-grid"> 
    # but remove the outer closing tags that match the OptionBuyerDesk parent
    
    # We can just extract until the last `</div>` inside the map loop?
    # No, it's a grid, it has `</div>` at the end of `fast-action-grid`.
    # Let's find the `</div>` that closes `fast-action-grid`
    
    # Actually, we can use a small regex to just get the grid and its children
    # <div className="fast-action-grid"> ... </div>
    # The grid is closed by the first `</div>` that aligns with it?
    # Python doesn't have balanced tags regex easily.
    
    # Let's just grab the whole block and strip the trailing empty space and outer divs
    # Or even better, just replace from `<div className="fast-action-grid">` to `{rows.map...` to `</div>` in `fast-action-wrapper`!
    pass

# Wait, let's just use string find for the exact block from my dump earlier!
# I saw it in the dump:
#               return (
#                 <div className={`fast-action-card ${tone}`} key={`fast-${row.symbol}`}>
#                   <div className="fast-action-head">
# ...
#                   </div>
#                 </div>
#               );
#             })}
#           </div>

# Let's extract from `<div className="fast-action-grid">` to `})} \n </div>`
start_grid = backup_content.find('<div className="fast-action-grid">')
end_grid = backup_content.find('           </div>', backup_content.find('            })}', start_grid)) + len('           </div>')

if start_grid != -1 and end_grid > start_grid:
    original_grid = backup_content[start_grid:end_grid]
    
    # Now find the current grid in current_content
    # It has `<div className="fast-action-wrapper"` ... `</div>`
    curr_start = current_content.find('<div className="fast-action-grid">')
    # find the end of the current grid (which is before `<div className="global-why-cards"`)
    curr_end = current_content.find('<div className="global-why-cards"', curr_start)
    
    if curr_start != -1 and curr_end != -1:
        # Before doing string replacement, we need to be careful with spaces
        # Let's just replace from curr_start to curr_end
        current_content = current_content[:curr_start] + original_grid + "\n        " + current_content[curr_end:]
        print("Replaced fast-action-grid successfully")
    else:
        print("Could not find current fast-action-grid or global-why-cards")
else:
    print("Could not extract original grid from backup")


# 2. Remove duplicate CommandOverviewPanel
# In the `trade-signals` view:
#                 {!focusMode && (
#                   <CommandOverviewPanel
#                     setups={dashboardBuyerSetups} ...

duplicate_text = """                {!focusMode && (
                  <CommandOverviewPanel
                    setups={dashboardBuyerSetups}
                    mood={marketMood}
                    cards={homeCards}
                    pcrHistory={pcrHistory}
                    advanceDecline={advanceDecline}
                    foBreadth={foBreadth}
                    selectedSymbol={dashboardSelectedSymbol}
                    collapsed={Boolean(collapsedSections.cmd)}
                    onCollapse={() => toggleDashboardSection("cmd")}
                    onOpenPcr={() => openPcrDetail("ALL")}
                  />
                )}"""

double_duplicate = duplicate_text + "\n" + duplicate_text

if double_duplicate in current_content:
    current_content = current_content.replace(double_duplicate, duplicate_text)
    print("Removed duplicate CommandOverviewPanel successfully (exact match)")
else:
    # If indentation is different
    # We can use regex to find two {!focusMode && (<CommandOverviewPanel ... />)}
    pattern = r'(\{!focusMode && \(\s*<CommandOverviewPanel[\s\S]*?/>\s*\)\})\s*(\{!focusMode && \(\s*<CommandOverviewPanel[\s\S]*?/>\s*\)\})'
    
    # Let's count how many we have in view === "trade-signals"
    # Actually, we can just find the second one and remove it.
    match = re.search(pattern, current_content)
    if match:
        current_content = current_content[:match.start()] + match.group(1) + current_content[match.end():]
        print("Removed duplicate CommandOverviewPanel successfully (regex match)")
    else:
        print("Could not find duplicate CommandOverviewPanel")

with open(current_file, "w", encoding="utf-8") as f:
    f.write(current_content)
