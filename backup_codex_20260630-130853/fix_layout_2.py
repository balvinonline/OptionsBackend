import re

backup_file = "src/ProfessionalDashboard_Backup_Pre_OptionChecks.jsx"
current_file = "src/ProfessionalDashboard.jsx"

with open(backup_file, "r", encoding="utf-8") as f:
    backup_content = f.read()

with open(current_file, "r", encoding="utf-8") as f:
    current_content = f.read()

# 1. Extract inner grid from backup
# <div className="fast-action-grid"> ... </div>
# The div closes right before `) : deskDensity === "SIMPLE"`

pattern_backup = r'(<div className="fast-action-grid">[\s\S]*?\s*</div>\s*)(?:\n\s*</>\s*)?\)\s*:\s*deskDensity === "SIMPLE" \?)'
m_backup = re.search(pattern_backup, backup_content)
if m_backup:
    original_grid = m_backup.group(1)
    
    # We only want the matching <div className="fast-action-grid">...</div> block!
    # A safer way: just extract what's inside <div className="fast-action-grid"> until the first `) : deskDensity`
    
    # Let's find current grid:
    # <div className="fast-action-grid"> ... </div>
    # <div className="global-why-cards" ... >
    pattern_current = r'(<div className="fast-action-grid">[\s\S]*?)(?=\s*<div className="global-why-cards")'
    m_current = re.search(pattern_current, current_content)
    if m_current:
        # replace it with the backup's grid!
        # wait, the backup's grid includes the closing </div>
        # But we must extract just the `<div className="fast-action-grid"> ... </div>` carefully!
        
        # Let's do a strict find of `<div className="fast-action-grid">` up to its matching `</div>` that precedes `) : deskDensity`
        # In backup, there's no `global-why-cards`, so it's just `</div>\s*</div>\s*\)\s*:\s*deskDensity`
        
        # Actually, let's extract by string!
        start_idx = backup_content.find('<div className="fast-action-grid">')
        end_idx = backup_content.find(') : deskDensity === "SIMPLE" ?', start_idx)
        
        # Back up a bit to get just the grid div
        block = backup_content[start_idx:end_idx]
        # Remove trailing </div> if it's the wrapper closing div?
        # Actually in backup it was:
        #        <div className="fast-action-grid">
        #          {rows.map... }
        #        </div>
        #      </div>
        #      ) : deskDensity === "SIMPLE" ?
        # But the OptionBuyerDesk returns fragments or whatever.
        
        original_grid = block.rsplit('</div>', 1)[0] # remove the last closing div from the block
        
        # Now replace the current grid
        start_curr = current_content.find('<div className="fast-action-grid">')
        end_curr = current_content.find('<div className="global-why-cards"', start_curr)
        
        current_content = current_content[:start_curr] + original_grid + current_content[end_curr:]
        print("Replaced fast-action-grid successfully")
    else:
        print("Could not find current fast-action-grid")
else:
    print("Could not match backup grid")

# 2. Remove duplicate CommandOverviewPanel
# Let's find the exact text of the duplicated block
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
    print("Removed duplicate CommandOverviewPanel successfully")
else:
    # Maybe whitespace differs
    pattern_duplicate = r'(\{!focusMode && \(\s*<CommandOverviewPanel[\s\S]*?/>\s*\)\})[\s\S]*?(\{!focusMode && \(\s*<CommandOverviewPanel[\s\S]*?/>\s*\)\})'
    
    # Just to be safe, search for two identical blocks closely spaced
    import re
    # We know it's in view === "trade-signals" block
    
with open(current_file, "w", encoding="utf-8") as f:
    f.write(current_content)
